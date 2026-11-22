//! Онлайн-функции Glow. Всё здесь необязательное: без интернета команды просто
//! возвращают ошибку или пустой результат, а плеер работает как обычно.
//!
//! - тексты песен из LRCLIB (с кэшем на диске — второй раз в сеть не ходим);
//! - поиск обложек (iTunes Search + MusicBrainz / Cover Art Archive);
//! - скробблинг в Last.fm и ListenBrainz;
//! - статус «Слушает…» в Discord (локальный IPC, интернет не нужен);
//! - чтение отдельных файлов для перетаскивания в окно и удаление в корзину.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;

use crate::{cover_dir, data_dir, hash_bytes, is_audio, now_secs, read_track, Track};

const UA: &str = concat!(
    "Glow/",
    env!("CARGO_PKG_VERSION"),
    " ( https://github.com/AlexGxZX/glow-desktop )"
);

// Ключи Last.fm подставляются при сборке на GitHub из секретов репозитория
// (GLOW_LASTFM_KEY, GLOW_LASTFM_SECRET), чтобы не лежать в открытом коде.
// Для своей сборки их можно задать переменными окружения перед `npm run build`.
const LASTFM_KEY: Option<&str> = option_env!("GLOW_LASTFM_KEY");
const LASTFM_SECRET: Option<&str> = option_env!("GLOW_LASTFM_SECRET");
const DISCORD_APP_ID: &str = "1573998800916324383";

fn agent() -> ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT
        .get_or_init(|| {
            ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(8))
                .timeout(Duration::from_secs(20))
                .user_agent(UA)
                .build()
        })
        .clone()
}

fn get_json(url: &str, query: &[(&str, &str)]) -> Result<Value, String> {
    let mut req = agent().get(url);
    for (k, v) in query {
        req = req.query(k, v);
    }
    match req.call() {
        Ok(r) => r.into_json::<Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(404, _)) => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

fn get_bytes(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let r = agent().get(url).call().map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    r.into_reader()
        .take(limit)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

// =============== Тексты из LRCLIB ===============

#[derive(Serialize)]
pub struct OnlineLyrics {
    text: String,
    synced: bool,
    cached: bool,
}

fn lyrics_cache(app: &AppHandle, path: &str) -> PathBuf {
    let dir = data_dir(app).join("lyrics");
    let _ = fs::create_dir_all(&dir);
    dir.join(format!("{}.lrc", hash_bytes(path.as_bytes())))
}

/// Текст для трека: из кэша, иначе из LRCLIB. «Не найдено» тоже запоминаем на неделю,
/// чтобы не спрашивать сервер при каждом запуске трека.
#[tauri::command]
pub async fn online_lyrics(
    app: AppHandle,
    path: String,
    artist: String,
    title: String,
    album: String,
    duration: f64,
    force: bool,
) -> Result<Option<OnlineLyrics>, String> {
    let cache = lyrics_cache(&app, &path);
    let miss = cache.with_extension("none");
    if !force {
        if let Ok(text) = fs::read_to_string(&cache) {
            let synced = text.contains("[0") || text.contains("[1");
            return Ok(Some(OnlineLyrics {
                text,
                synced,
                cached: true,
            }));
        }
        if let Ok(m) = fs::metadata(&miss) {
            let fresh = m
                .modified()
                .ok()
                .and_then(|t| t.elapsed().ok())
                .map_or(false, |e| e.as_secs() < 7 * 86400);
            if fresh {
                return Ok(None);
            }
        }
    }
    let found = blocking(move || lrclib_find(&artist, &title, &album, duration)).await??;
    match found {
        Some((text, synced)) => {
            let _ = fs::write(&cache, &text);
            let _ = fs::remove_file(&miss);
            Ok(Some(OnlineLyrics {
                text,
                synced,
                cached: false,
            }))
        }
        None => {
            let _ = fs::write(&miss, b"");
            Ok(None)
        }
    }
}

fn pick_lyrics(v: &Value) -> Option<(String, bool)> {
    if v.get("instrumental").and_then(Value::as_bool) == Some(true) {
        return Some((
            format!(
                "[00:00.00]♪ {}",
                crate::desktop::l("Инструментал", "Instrumental")
            ),
            true,
        ));
    }
    if let Some(s) = v
        .get("syncedLyrics")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        return Some((s.to_string(), true));
    }
    v.get("plainLyrics")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(|s| (s.to_string(), false))
}

fn lrclib_find(
    artist: &str,
    title: &str,
    album: &str,
    duration: f64,
) -> Result<Option<(String, bool)>, String> {
    let dur = format!("{}", duration.round() as i64);
    // 1. Точное совпадение по исполнителю, названию, альбому и длительности.
    let mut q = vec![
        ("artist_name", artist),
        ("track_name", title),
        ("duration", dur.as_str()),
    ];
    if !album.is_empty() {
        q.push(("album_name", album));
    }
    let v = get_json("https://lrclib.net/api/get", &q)?;
    if let Some(r) = pick_lyrics(&v) {
        return Ok(Some(r));
    }
    // 2. Поиск: берём вариант с ближайшей длительностью, синхронный — в приоритете.
    let v = get_json(
        "https://lrclib.net/api/search",
        &[("track_name", title), ("artist_name", artist)],
    )?;
    let mut best: Option<(f64, String, bool)> = None;
    for item in v.as_array().into_iter().flatten() {
        let d = item.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
        if duration > 0.0 && (d - duration).abs() > 4.0 {
            continue;
        }
        if let Some((text, synced)) = pick_lyrics(item) {
            let score = (d - duration).abs() + if synced { 0.0 } else { 100.0 };
            if best.as_ref().map_or(true, |b| score < b.0) {
                best = Some((score, text, synced));
            }
        }
    }
    Ok(best.map(|(_, t, s)| (t, s)))
}

/// Забыть скачанный текст трека (например, если он не тот).
#[tauri::command]
pub fn forget_online_lyrics(app: AppHandle, path: String) {
    let c = lyrics_cache(&app, &path);
    let _ = fs::remove_file(&c);
    let _ = fs::write(c.with_extension("none"), b"");
}

// =============== Поиск обложек ===============

#[derive(Serialize)]
pub struct CoverCandidate {
    /// Локальный файл с картинкой (уже скачан).
    path: String,
    source: String,
    title: String,
    size: String,
}

/// До 8 вариантов обложки альбома: iTunes и MusicBrainz / Cover Art Archive.
/// Картинки скачиваются в кэш, чтобы окно выбора показало их без сети.
#[tauri::command]
pub async fn search_covers(
    app: AppHandle,
    artist: String,
    album: String,
) -> Result<Vec<CoverCandidate>, String> {
    let dir = cover_dir(&app).join("online");
    let _ = fs::create_dir_all(&dir);
    blocking(move || {
        let mut urls: Vec<(String, String, String)> = Vec::new(); // url, source, title
        let term = format!("{artist} {album}");
        if let Ok(v) = get_json(
            "https://itunes.apple.com/search",
            &[("term", term.trim()), ("entity", "album"), ("limit", "6")],
        ) {
            for it in v
                .get("results")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(u) = it.get("artworkUrl100").and_then(Value::as_str) {
                    let big = u.replace("100x100bb", "1000x1000bb");
                    let t = format!(
                        "{} — {}",
                        it.get("artistName").and_then(Value::as_str).unwrap_or(""),
                        it.get("collectionName")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                    );
                    urls.push((big, "iTunes".into(), t));
                }
            }
        }
        let q = if artist.trim().is_empty() {
            format!("release:\"{}\"", album.replace('"', ""))
        } else {
            format!(
                "release:\"{}\" AND artist:\"{}\"",
                album.replace('"', ""),
                artist.replace('"', "")
            )
        };
        if let Ok(v) = get_json(
            "https://musicbrainz.org/ws/2/release/",
            &[("query", q.as_str()), ("fmt", "json"), ("limit", "5")],
        ) {
            for r in v
                .get("releases")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(id) = r.get("id").and_then(Value::as_str) {
                    let who = r
                        .get("artist-credit")
                        .and_then(Value::as_array)
                        .and_then(|a| a.first())
                        .and_then(|a| a.get("name"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let t = format!(
                        "{} — {}",
                        who,
                        r.get("title").and_then(Value::as_str).unwrap_or("")
                    );
                    urls.push((
                        format!("https://coverartarchive.org/release/{id}/front-500"),
                        "MusicBrainz".into(),
                        t,
                    ));
                }
            }
        }
        let mut out = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for (url, source, title) in urls.into_iter().take(10) {
            let Ok(bytes) = get_bytes(&url, 12 * 1024 * 1024) else {
                continue;
            };
            if bytes.len() < 1024 {
                continue;
            }
            let key = hash_bytes(&bytes);
            if !seen.insert(key.clone()) {
                continue;
            }
            let ext = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
                "png"
            } else {
                "jpg"
            };
            let file = dir.join(format!("{key}.{ext}"));
            if fs::write(&file, &bytes).is_err() {
                continue;
            }
            let size = imagesize::blob_size(&bytes)
                .map(|s| format!("{}×{}", s.width, s.height))
                .unwrap_or_default();
            out.push(CoverCandidate {
                path: file.to_string_lossy().into(),
                source,
                title,
                size,
            });
            if out.len() >= 8 {
                break;
            }
        }
        Ok(out)
    })
    .await?
}

// =============== Last.fm ===============

fn lastfm_keys() -> Result<(&'static str, &'static str), String> {
    match (LASTFM_KEY, LASTFM_SECRET) {
        (Some(k), Some(s)) if !k.is_empty() && !s.is_empty() => Ok((k, s)),
        _ => Err("В этой сборке нет ключа Last.fm".into()),
    }
}

/// Подпись запроса Last.fm: параметры по алфавиту, «имязначение» подряд, затем секрет, MD5.
fn lastfm_sign(params: &BTreeMap<String, String>, secret: &str) -> String {
    let mut s = String::new();
    for (k, v) in params {
        if k == "format" || k == "callback" {
            continue;
        }
        s.push_str(k);
        s.push_str(v);
    }
    s.push_str(secret);
    format!("{:x}", md5::compute(s.as_bytes()))
}

fn lastfm_call(
    method: &str,
    mut params: BTreeMap<String, String>,
    post: bool,
) -> Result<Value, String> {
    let (key, secret) = lastfm_keys()?;
    params.insert("method".into(), method.into());
    params.insert("api_key".into(), key.into());
    let sig = lastfm_sign(&params, secret);
    params.insert("api_sig".into(), sig);
    params.insert("format".into(), "json".into());
    let url = "https://ws.audioscrobbler.com/2.0/";
    let res = if post {
        let form: Vec<(&str, &str)> = params
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        agent().post(url).send_form(&form)
    } else {
        let mut r = agent().get(url);
        for (k, v) in &params {
            r = r.query(k, v);
        }
        r.call()
    };
    let v: Value = match res {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(_, r)) => r.into_json().unwrap_or(Value::Null),
        Err(e) => return Err(format!("нет связи: {e}")),
    };
    if let Some(code) = v.get("error").and_then(Value::as_i64) {
        let msg = v
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("ошибка Last.fm");
        return Err(format!("Last.fm {code}: {msg}"));
    }
    Ok(v)
}

#[derive(Serialize)]
pub struct LastfmAuth {
    token: String,
    url: String,
}

/// Шаг 1: получить токен и адрес страницы, где пользователь разрешит доступ.
#[tauri::command]
pub async fn lastfm_begin() -> Result<LastfmAuth, String> {
    blocking(|| {
        let v = lastfm_call("auth.getToken", BTreeMap::new(), false)?;
        let token = v
            .get("token")
            .and_then(Value::as_str)
            .ok_or("Last.fm не выдал токен")?
            .to_string();
        let (key, _) = lastfm_keys()?;
        Ok(LastfmAuth {
            url: format!("https://www.last.fm/api/auth/?api_key={key}&token={token}"),
            token,
        })
    })
    .await?
}

#[derive(Serialize, Deserialize)]
pub struct LastfmSession {
    name: String,
    key: String,
}

/// Шаг 2: после разрешения на сайте — постоянный ключ сессии.
#[tauri::command]
pub async fn lastfm_finish(token: String) -> Result<LastfmSession, String> {
    blocking(move || {
        let mut p = BTreeMap::new();
        p.insert("token".into(), token);
        let v = lastfm_call("auth.getSession", p, false)?;
        let s = v
            .get("session")
            .ok_or("Нет сессии — разреши доступ на странице Last.fm")?;
        Ok(LastfmSession {
            name: s.get("name").and_then(Value::as_str).unwrap_or("").into(),
            key: s.get("key").and_then(Value::as_str).unwrap_or("").into(),
        })
    })
    .await?
}

#[derive(Deserialize, Clone)]
pub struct Scrobble {
    artist: String,
    title: String,
    album: String,
    album_artist: String,
    duration: f64,
    /// Время начала прослушивания, секунды Unix.
    at: u64,
}

#[tauri::command]
pub fn lastfm_available() -> bool {
    lastfm_keys().is_ok()
}

#[tauri::command]
pub async fn lastfm_now_playing(sk: String, track: Scrobble) -> Result<(), String> {
    blocking(move || {
        let mut p = BTreeMap::new();
        p.insert("sk".into(), sk);
        p.insert("artist".into(), track.artist);
        p.insert("track".into(), track.title);
        if !track.album.is_empty() {
            p.insert("album".into(), track.album);
        }
        if track.duration > 0.0 {
            p.insert(
                "duration".into(),
                format!("{}", track.duration.round() as i64),
            );
        }
        lastfm_call("track.updateNowPlaying", p, true).map(|_| ())
    })
    .await?
}

/// Отправить до 50 прослушиваний за раз. Возвращает, сколько принято.
#[tauri::command]
pub async fn lastfm_scrobble(sk: String, items: Vec<Scrobble>) -> Result<usize, String> {
    blocking(move || {
        let items: Vec<Scrobble> = items.into_iter().take(50).collect();
        let mut p = BTreeMap::new();
        p.insert("sk".into(), sk);
        for (i, t) in items.iter().enumerate() {
            p.insert(format!("artist[{i}]"), t.artist.clone());
            p.insert(format!("track[{i}]"), t.title.clone());
            p.insert(format!("timestamp[{i}]"), t.at.to_string());
            if !t.album.is_empty() {
                p.insert(format!("album[{i}]"), t.album.clone());
            }
            if !t.album_artist.is_empty() && t.album_artist != t.artist {
                p.insert(format!("albumArtist[{i}]"), t.album_artist.clone());
            }
            if t.duration > 0.0 {
                p.insert(
                    format!("duration[{i}]"),
                    format!("{}", t.duration.round() as i64),
                );
            }
        }
        lastfm_call("track.scrobble", p, true)?;
        Ok(items.len())
    })
    .await?
}

// =============== ListenBrainz ===============

fn lb_meta(t: &Scrobble) -> Value {
    let mut m = json!({
        "artist_name": t.artist,
        "track_name": t.title,
        "additional_info": { "media_player": "Glow", "submission_client": "Glow for Windows", "submission_client_version": env!("CARGO_PKG_VERSION") }
    });
    if !t.album.is_empty() {
        m["release_name"] = json!(t.album);
    }
    if t.duration > 0.0 {
        m["additional_info"]["duration_ms"] = json!((t.duration * 1000.0).round() as i64);
    }
    m
}

fn lb_post(token: &str, body: Value) -> Result<(), String> {
    match agent()
        .post("https://api.listenbrainz.org/1/submit-listens")
        .set("Authorization", &format!("Token {token}"))
        .send_json(body)
    {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, r)) => {
            let msg = r.into_string().unwrap_or_default();
            Err(format!(
                "ListenBrainz {code}: {}",
                msg.chars().take(160).collect::<String>()
            ))
        }
        Err(e) => Err(format!("нет связи: {e}")),
    }
}

/// Проверить токен. Возвращает имя пользователя.
#[tauri::command]
pub async fn listenbrainz_check(token: String) -> Result<String, String> {
    blocking(move || {
        let r = agent()
            .get("https://api.listenbrainz.org/1/validate-token")
            .set("Authorization", &format!("Token {}", token.trim()))
            .call()
            .map_err(|e| e.to_string())?;
        let v: Value = r.into_json().map_err(|e| e.to_string())?;
        if v.get("valid").and_then(Value::as_bool) == Some(true) {
            Ok(v.get("user_name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string())
        } else {
            Err("Токен не подошёл".into())
        }
    })
    .await?
}

#[tauri::command]
pub async fn listenbrainz_now_playing(token: String, track: Scrobble) -> Result<(), String> {
    blocking(move || {
        lb_post(
            &token,
            json!({ "listen_type": "playing_now", "payload": [{ "track_metadata": lb_meta(&track) }] }),
        )
    })
    .await?
}

#[tauri::command]
pub async fn listenbrainz_submit(token: String, items: Vec<Scrobble>) -> Result<usize, String> {
    blocking(move || {
        let items: Vec<Scrobble> = items.into_iter().take(100).collect();
        let payload: Vec<Value> = items
            .iter()
            .map(|t| json!({ "listened_at": t.at, "track_metadata": lb_meta(t) }))
            .collect();
        let kind = if items.len() == 1 { "single" } else { "import" };
        lb_post(&token, json!({ "listen_type": kind, "payload": payload }))?;
        Ok(items.len())
    })
    .await?
}

// =============== Discord ===============
// Протокол Discord RPC: именованный канал \\.\pipe\discord-ipc-N, кадры «op (u32) + длина (u32) + JSON».
// Работает и без интернета: Discord сам отправит статус, когда сможет.

enum DiscordMsg {
    Set(Value),
    Clear,
}

static DISCORD: Mutex<Option<mpsc::Sender<DiscordMsg>>> = Mutex::new(None);

#[cfg(windows)]
mod discord_ipc {
    use serde_json::{json, Value};
    use std::fs::{File, OpenOptions};
    use std::io::{Read, Write};

    pub struct Conn(File);

    impl Conn {
        pub fn open(app_id: &str) -> Option<Conn> {
            for i in 0..10 {
                if let Ok(f) = OpenOptions::new()
                    .read(true)
                    .write(true)
                    .open(format!(r"\\.\pipe\discord-ipc-{i}"))
                {
                    let mut c = Conn(f);
                    if c.send(0, &json!({ "v": 1, "client_id": app_id })).is_ok()
                        && c.recv().is_some()
                    {
                        return Some(c);
                    }
                }
            }
            None
        }

        pub fn send(&mut self, op: u32, v: &Value) -> std::io::Result<()> {
            let body = serde_json::to_vec(v)?;
            let mut buf = Vec::with_capacity(8 + body.len());
            buf.extend_from_slice(&op.to_le_bytes());
            buf.extend_from_slice(&(body.len() as u32).to_le_bytes());
            buf.extend_from_slice(&body);
            self.0.write_all(&buf)?;
            self.0.flush()
        }

        pub fn recv(&mut self) -> Option<Value> {
            let mut head = [0u8; 8];
            self.0.read_exact(&mut head).ok()?;
            let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
            if len > 1 << 20 {
                return None;
            }
            let mut body = vec![0u8; len];
            self.0.read_exact(&mut body).ok()?;
            serde_json::from_slice(&body).ok()
        }
    }
}

fn discord_thread(rx: mpsc::Receiver<DiscordMsg>) {
    #[cfg(windows)]
    {
        let mut conn: Option<discord_ipc::Conn> = None;
        let mut nonce: u64 = 0;
        while let Ok(msg) = rx.recv() {
            let activity = match msg {
                DiscordMsg::Set(a) => a,
                DiscordMsg::Clear => Value::Null,
            };
            for _attempt in 0..2 {
                if conn.is_none() {
                    conn = discord_ipc::Conn::open(DISCORD_APP_ID);
                }
                let Some(c) = conn.as_mut() else { break };
                nonce += 1;
                let frame = json!({
                    "cmd": "SET_ACTIVITY",
                    "args": { "pid": std::process::id(), "activity": activity },
                    "nonce": format!("glow-{nonce}"),
                });
                if c.send(1, &frame).is_ok() && c.recv().is_some() {
                    break;
                }
                conn = None; // Discord перезапустили — переподключимся
            }
        }
    }
    #[cfg(not(windows))]
    while rx.recv().is_ok() {}
}

fn discord_send(msg: DiscordMsg) {
    let mut slot = DISCORD.lock().unwrap_or_else(|e| e.into_inner());
    if slot.is_none() {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || discord_thread(rx));
        *slot = Some(tx);
    }
    if let Some(tx) = slot.as_ref() {
        let _ = tx.send(msg);
    }
}

#[derive(Deserialize)]
pub struct DiscordTrack {
    title: String,
    artist: String,
    album: String,
    /// Секунды от начала трека и его длительность — для полосы времени в Discord.
    position: f64,
    duration: f64,
    playing: bool,
    /// Ссылка на обложку в интернете, если нашлась.
    cover_url: Option<String>,
}

fn clip(s: &str, n: usize) -> String {
    let s: String = s.chars().take(n).collect();
    if s.chars().count() < 2 {
        format!("{s}  ")
    } else {
        s
    }
}

#[tauri::command]
pub fn discord_set(track: Option<DiscordTrack>) {
    let Some(t) = track else {
        discord_send(DiscordMsg::Clear);
        return;
    };
    let now = now_secs() as f64;
    let mut a = json!({
        "type": 2,
        "details": clip(&t.title, 120),
        "state": clip(&format!("{}", t.artist), 120),
        "assets": {
            "large_image": t.cover_url.clone().unwrap_or_else(|| "glow".into()),
            "large_text": clip(if t.album.is_empty() { "Glow" } else { &t.album }, 120),
            "small_image": if t.playing { "play" } else { "pause" },
            "small_text": if t.playing { crate::desktop::l("Играет в Glow", "Playing in Glow") } else { crate::desktop::l("Пауза", "Paused") },
        },
    });
    if t.playing && t.duration > 0.0 {
        let start = now - t.position;
        a["timestamps"] = json!({ "start": (start * 1000.0) as i64, "end": ((start + t.duration) * 1000.0) as i64 });
    }
    discord_send(DiscordMsg::Set(a));
}

/// Ссылка на обложку альбома в iTunes — Discord умеет показывать картинки по ссылке.
#[tauri::command]
pub async fn cover_url_for(artist: String, album: String, title: String) -> Option<String> {
    blocking(move || {
        let term = format!(
            "{artist} {}",
            if album.is_empty() { &title } else { &album }
        );
        let v = get_json(
            "https://itunes.apple.com/search",
            &[("term", term.trim()), ("entity", "album"), ("limit", "1")],
        )
        .ok()?;
        let u = v
            .get("results")?
            .as_array()?
            .first()?
            .get("artworkUrl100")?
            .as_str()?;
        Some(u.replace("100x100bb", "512x512bb"))
    })
    .await
    .ok()
    .flatten()
}

// =============== Перетаскивание файлов и корзина ===============

/// Прочитать теги отдельных файлов (и всех аудио в перетащенных папках).
#[tauri::command]
pub async fn read_tracks(app: AppHandle, paths: Vec<String>) -> Result<Vec<Track>, String> {
    blocking(move || {
        let covers = cover_dir(&app);
        let mut files: Vec<PathBuf> = Vec::new();
        for p in &paths {
            let p = Path::new(p);
            if p.is_dir() {
                for e in walkdir::WalkDir::new(p)
                    .follow_links(true)
                    .into_iter()
                    .flatten()
                {
                    if e.file_type().is_file() && is_audio(e.path()) {
                        files.push(e.path().to_path_buf());
                    }
                }
            } else if is_audio(p) {
                files.push(p.to_path_buf());
            }
        }
        files.sort();
        files.truncate(5000);
        let now = now_secs();
        Ok(files
            .iter()
            .map(|f| {
                let meta = fs::metadata(f).ok();
                let mtime = meta
                    .as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs());
                let size = meta.map_or(0, |m| m.len());
                read_track(f, &f.to_string_lossy(), mtime, size, now, &covers)
            })
            .collect())
    })
    .await?
}

/// Отправить файл в корзину Windows (не удаляет насовсем).
#[tauri::command]
pub async fn trash_file(path: String) -> Result<(), String> {
    blocking(move || trash::delete(&path).map_err(|e| e.to_string())).await?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lastfm_signature_matches_spec() {
        // Пример из документации Last.fm: api_key + method + token, отсортированные по имени.
        let mut p = BTreeMap::new();
        p.insert("method".to_string(), "auth.getSession".to_string());
        p.insert("api_key".to_string(), "xxxxxxxxxx".to_string());
        p.insert("token".to_string(), "yyyyyy".to_string());
        p.insert("format".to_string(), "json".to_string());
        let sig = lastfm_sign(&p, "ilovecher");
        let expect = format!(
            "{:x}",
            md5::compute(b"api_keyxxxxxxxxxxmethodauth.getSessiontokenyyyyyyilovecher")
        );
        assert_eq!(sig, expect);
    }
}

/// Открыть ссылку в браузере по умолчанию (только http/https).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Можно открывать только веб-ссылки".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .creation_flags(0x0800_0000) // без окна консоли
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Описание релиза с GitHub — то, что написано на странице релиза сейчас
/// (latest.json хранит текст на момент сборки, а описание часто правят уже после).
pub async fn release_notes(version: String) -> Option<String> {
    blocking(move || {
        let url =
            format!("https://api.github.com/repos/AlexGxZX/glow-desktop/releases/tags/v{version}");
        let r = agent()
            .get(&url)
            .set("Accept", "application/vnd.github+json")
            .call()
            .ok()?;
        let v: Value = r.into_json().ok()?;
        v.get("body")
            .and_then(Value::as_str)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    })
    .await
    .ok()
    .flatten()
}
