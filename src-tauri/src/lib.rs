//! Glow для ПК — Rust-часть.
//!
//! Что здесь:
//! - сканирование папок с музыкой и чтение тегов, обложек, ReplayGain (lofty);
//! - кэш медиатеки, чтобы повторное сканирование не перечитывало неизменённые файлы;
//! - протокол `stream://` — отдаёт аудио и обложки в интерфейс с поддержкой перемотки
//!   (Range-запросы) и CORS, чтобы звук можно было пропускать через эквалайзер Web Audio;
//! - тексты песен (.lrc рядом с треком или встроенные в теги), в т.ч. в кодировке Windows-1251;
//! - выбор папок и файлов, «показать в папке», управление окном и мини-плеер.

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use lofty::config::WriteOptions;
use lofty::picture::{Picture, PictureType};
use lofty::prelude::*;
use lofty::tag::{ItemKey, Tag};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

mod desktop;
mod net;

const AUDIO_EXT: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "oga", "opus", "m4a", "aac", "webm",
];
const COVER_NAMES: &[&str] = &["cover", "folder", "front", "album", "albumart"];
const COVER_EXT: &[&str] = &["jpg", "jpeg", "png", "webp"];
/// Сколько байт отдаём за один Range-запрос. Плеер сам дозапрашивает следующие куски.
const CHUNK: u64 = 2 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct Track {
    path: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    genre: String,
    track_no: u32,
    disc_no: u32,
    year: String,
    /// Длительность в секундах.
    duration: f64,
    /// Путь к файлу обложки (извлечённой в кэш или лежащей в папке альбома).
    cover: Option<String>,
    /// Когда трек впервые попал в медиатеку (unix, секунды).
    added: u64,
    mtime: u64,
    size: u64,
    format: String,
    sample_rate: u32,
    bit_depth: u32,
    channels: u32,
    /// kbps
    bitrate: u32,
    rg_track: String,
    rg_album: String,
    folder: String,
    has_lyrics: bool,
}

// ---------- Пути и утилиты ----------

/// Папка с данными Glow: %APPDATA%\Glow на Windows.
/// Специально не папка с именем приложения (com.glow.desktop): её установщик
/// может удалить при обновлении или переустановке, а эту он не трогает.
fn data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .config_dir()
        .map(|d| d.join("Glow"))
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    // Однократный перенос кэша медиатеки из старой папки.
    let lib = dir.join("library.json");
    if !lib.exists() {
        if let Ok(old) = app.path().app_data_dir() {
            let _ = fs::copy(old.join("library.json"), &lib);
        }
    }
    dir
}

// ---------- Хранилище настроек в файлах ----------

/// Что хранится: настройки, избранное/оценки/плейлисты/история, очередь, свои стили, черновик стиля.
const STORE_KEYS: &[&str] = &["settings", "meta", "resume", "customStyles", "styleDraft"];
static STORE_LOCK: Mutex<()> = Mutex::new(());

fn store_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if !STORE_KEYS.contains(&key) {
        return Err(format!("Неизвестный ключ: {key}"));
    }
    Ok(data_dir(app).join(format!("{key}.json")))
}

fn read_store_file(path: &Path) -> Option<String> {
    let s = fs::read_to_string(path).ok()?;
    // Битый (недописанный) файл не считаем настройками.
    serde_json::from_str::<serde_json::Value>(&s).ok()?;
    Some(s)
}

/// При смене версии сохраняем копию всех данных в backups/<старая версия>, храним 5 последних.
fn backup_on_version_change(app: &AppHandle) {
    let dir = data_dir(app);
    let ver = app.package_info().version.to_string();
    let vfile = dir.join("version.txt");
    let prev = fs::read_to_string(&vfile)
        .unwrap_or_default()
        .trim()
        .to_string();
    if prev == ver {
        return;
    }
    if !prev.is_empty() {
        let bdir = dir.join("backups").join(format!("{}-{}", prev, now_secs()));
        if fs::create_dir_all(&bdir).is_ok() {
            for k in STORE_KEYS {
                let _ = fs::copy(
                    dir.join(format!("{k}.json")),
                    bdir.join(format!("{k}.json")),
                );
            }
        }
        if let Ok(rd) = fs::read_dir(dir.join("backups")) {
            let mut all: Vec<PathBuf> = rd
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect();
            all.sort_by_key(|p| fs::metadata(p).and_then(|m| m.modified()).ok());
            while all.len() > 5 {
                let _ = fs::remove_dir_all(all.remove(0));
            }
        }
    }
    let _ = fs::write(&vfile, &ver);
}

/// Все сохранённые данные: ключ → JSON-текст. Если основной файл повреждён, берём .bak.
#[tauri::command]
fn store_read_all(app: AppHandle) -> HashMap<String, String> {
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    backup_on_version_change(&app);
    let mut out = HashMap::new();
    for k in STORE_KEYS {
        if let Ok(p) = store_path(&app, k) {
            if let Some(v) =
                read_store_file(&p).or_else(|| read_store_file(&p.with_extension("json.bak")))
            {
                out.insert(k.to_string(), v);
            }
        }
    }
    out
}

/// Записать данные атомарно: во временный файл, прошлую версию — в .bak, потом подмена.
#[tauri::command]
fn store_write(app: AppHandle, key: String, content: String) -> Result<(), String> {
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = store_path(&app, &key)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn store_delete(app: AppHandle, key: String) -> Result<(), String> {
    let _g = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = store_path(&app, &key)?;
    let _ = fs::remove_file(&path);
    let _ = fs::remove_file(path.with_extension("json.bak"));
    Ok(())
}

/// Ручная резервная копия: все данные одним файлом .glowbackup.
#[tauri::command]
async fn backup_save(app: AppHandle) -> Result<bool, String> {
    let mut map = serde_json::Map::new();
    for k in STORE_KEYS {
        if let Some(v) = store_path(&app, k).ok().and_then(|p| read_store_file(&p)) {
            map.insert(k.to_string(), serde_json::Value::String(v));
        }
    }
    let doc = serde_json::json!({ "format": "glowbackup", "version": app.package_info().version.to_string(), "data": map });
    let picked = app
        .dialog()
        .file()
        .add_filter(
            desktop::l("Резервная копия Glow", "Glow backup"),
            &["glowbackup"],
        )
        .set_file_name(format!("Glow-{}.glowbackup", now_secs()))
        .blocking_save_file();
    let Some(fp) = picked else { return Ok(false) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    fs::write(
        &path,
        serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Восстановить из .glowbackup. Возвращает false, если пользователь отменил.
#[tauri::command]
async fn backup_restore(app: AppHandle) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter(
            desktop::l("Резервная копия Glow", "Glow backup"),
            &["glowbackup", "json"],
        )
        .blocking_pick_file();
    let Some(fp) = picked else { return Ok(false) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "Это не резервная копия Glow".to_string())?;
    let data = doc
        .get("data")
        .and_then(|d| d.as_object())
        .ok_or("Это не резервная копия Glow")?;
    for k in STORE_KEYS {
        if let Some(v) = data.get(*k).and_then(|v| v.as_str()) {
            if serde_json::from_str::<serde_json::Value>(v).is_ok() {
                let p = store_path(&app, k)?;
                if p.exists() {
                    let _ = fs::copy(&p, p.with_extension("json.bak"));
                }
                fs::write(&p, v).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(true)
}

fn cover_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| data_dir(app))
        .join("covers");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn ext_of(p: &Path) -> Option<String> {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

fn is_audio(p: &Path) -> bool {
    ext_of(p).map_or(false, |e| AUDIO_EXT.contains(&e.as_str()))
}

/// Нормализованный путь для сравнения: нижний регистр, прямые слеши, без слеша в конце.
fn norm(s: &str) -> String {
    s.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

fn is_excluded(p: &Path, excl: &[String]) -> bool {
    if excl.is_empty() {
        return false;
    }
    let n = norm(&p.to_string_lossy());
    excl.iter()
        .any(|e| !e.is_empty() && (n == *e || n.starts_with(&format!("{}/", e))))
}

fn hash_bytes(b: &[u8]) -> String {
    let mut h = DefaultHasher::new();
    b.hash(&mut h);
    format!("{:016x}", h.finish())
}

// ---------- Кэш медиатеки ----------

fn load_cache(app: &AppHandle) -> Vec<Track> {
    fs::read(data_dir(app).join("library.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_cache(app: &AppHandle, tracks: &[Track]) {
    if let Ok(json) = serde_json::to_vec(tracks) {
        let dir = data_dir(app);
        let tmp = dir.join("library.json.tmp");
        if fs::write(&tmp, json).is_ok() {
            let _ = fs::rename(&tmp, dir.join("library.json"));
        }
    }
}

// ---------- Чтение тегов ----------

fn write_cover(covers: &Path, key: &str, data: &[u8]) -> Option<String> {
    if data.len() < 64 {
        return None;
    }
    let ext = if data.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if data.starts_with(b"RIFF") {
        "webp"
    } else {
        "jpg"
    };
    let file = covers.join(format!("{}.{}", key, ext));
    if !file.exists() && fs::write(&file, data).is_err() {
        return None;
    }
    Some(file.to_string_lossy().to_string())
}

fn folder_cover(folder: &Path) -> Option<String> {
    for name in COVER_NAMES {
        for ext in COVER_EXT {
            for n in [name.to_string(), name[..1].to_uppercase() + &name[1..]] {
                let f = folder.join(format!("{}.{}", n, ext));
                if f.exists() {
                    return Some(f.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

fn clean(v: Option<std::borrow::Cow<'_, str>>) -> String {
    v.map(|s| s.trim().to_string()).unwrap_or_default()
}

fn read_track(p: &Path, ps: &str, mtime: u64, size: u64, added: u64, covers: &Path) -> Track {
    let folder_path = p.parent().map(Path::to_path_buf).unwrap_or_default();
    let folder = folder_path.to_string_lossy().to_string();
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut t = Track {
        path: ps.to_string(),
        title: stem,
        folder: folder.clone(),
        mtime,
        size,
        added,
        format: ext_of(p).unwrap_or_default().to_uppercase(),
        ..Default::default()
    };

    if let Ok(tagged) = lofty::read_from_path(p) {
        let props = tagged.properties();
        t.duration = props.duration().as_secs_f64();
        t.sample_rate = props.sample_rate().unwrap_or(0);
        t.bit_depth = props.bit_depth().unwrap_or(0) as u32;
        t.channels = props.channels().unwrap_or(0) as u32;
        t.bitrate = props
            .audio_bitrate()
            .or_else(|| props.overall_bitrate())
            .unwrap_or(0);

        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            let title = clean(tag.title());
            if !title.is_empty() {
                t.title = title;
            }
            t.artist = clean(tag.artist());
            t.album = clean(tag.album());
            t.genre = clean(tag.genre());
            t.track_no = tag.track().unwrap_or(0);
            t.disc_no = tag.disk().unwrap_or(0);
            t.album_artist = tag
                .get_string(&ItemKey::AlbumArtist)
                .unwrap_or("")
                .trim()
                .to_string();
            t.year = tag
                .get_string(&ItemKey::Year)
                .or_else(|| tag.get_string(&ItemKey::RecordingDate))
                .unwrap_or("")
                .trim()
                .chars()
                .take(4)
                .collect();
            t.rg_track = tag
                .get_string(&ItemKey::ReplayGainTrackGain)
                .unwrap_or("")
                .to_string();
            t.rg_album = tag
                .get_string(&ItemKey::ReplayGainAlbumGain)
                .unwrap_or("")
                .to_string();
            t.has_lyrics = tag
                .get_string(&ItemKey::Lyrics)
                .map_or(false, |s| !s.trim().is_empty());

            if let Some(pic) = tag
                .pictures()
                .iter()
                .find(|p| p.pic_type() == PictureType::CoverFront)
                .or_else(|| tag.pictures().first())
            {
                // Имя файла — хэш самой картинки: одинаковые обложки альбома хранятся один раз,
                // а изменённая обложка сразу получает новый файл.
                t.cover = write_cover(covers, &hash_bytes(pic.data()), pic.data());
            }
        }
    }

    if t.cover.is_none() {
        t.cover = folder_cover(&folder_path);
    }
    if !t.has_lyrics {
        t.has_lyrics = p.with_extension("lrc").exists();
    }
    t
}

fn scan_blocking(app: &AppHandle, folders: Vec<String>, excluded: Vec<String>) -> Vec<Track> {
    let cache: HashMap<String, Track> = load_cache(app)
        .into_iter()
        .map(|t| (t.path.clone(), t))
        .collect();
    let first_scan = cache.is_empty();
    let excl: Vec<String> = excluded.iter().map(|e| norm(e)).collect();

    let mut files: Vec<PathBuf> = Vec::new();
    for f in &folders {
        let walker = walkdir::WalkDir::new(f)
            .follow_links(true)
            .into_iter()
            .filter_entry(|e| !is_excluded(e.path(), &excl));
        for entry in walker.filter_map(|e| e.ok()) {
            if entry.file_type().is_file() && is_audio(entry.path()) {
                files.push(entry.into_path());
            }
        }
    }
    files.sort();
    files.dedup();

    let total = files.len();
    let covers = cover_dir(app);
    let now = now_secs();
    let mut out = Vec::with_capacity(total);
    let _ = app.emit("scan-progress", (0usize, total));

    for (i, p) in files.iter().enumerate() {
        let ps = p.to_string_lossy().to_string();
        let meta = fs::metadata(p).ok();
        let mtime = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let size = meta.map(|m| m.len()).unwrap_or(0);

        let cached = cache.get(&ps);
        let fresh = cached.map_or(false, |t| {
            t.mtime == mtime
                && t.size == size
                && t.cover.as_ref().map_or(true, |c| Path::new(c).exists())
        });
        if fresh {
            out.push(cached.unwrap().clone());
        } else {
            // При первом сканировании «дата добавления» = дата файла, потом — момент появления.
            let added =
                cached
                    .map(|t| t.added)
                    .unwrap_or(if first_scan { mtime.min(now) } else { now });
            out.push(read_track(p, &ps, mtime, size, added, &covers));
        }
        if i % 25 == 0 || i + 1 == total {
            let _ = app.emit("scan-progress", (i + 1, total));
        }
    }

    save_cache(app, &out);
    out
}

// ---------- Текст в Windows-1251 ----------

fn decode_text(bytes: Vec<u8>) -> String {
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        bytes[3..].to_vec()
    } else {
        bytes
    };
    match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => e.into_bytes().iter().map(|&b| cp1251(b)).collect(),
    }
}

fn cp1251(b: u8) -> char {
    match b {
        0x00..=0x7F => b as char,
        0xC0..=0xFF => char::from_u32(0x0410 + (b as u32 - 0xC0)).unwrap_or('?'),
        0xA8 => 'Ё',
        0xB8 => 'ё',
        0x85 => '…',
        0x96 => '–',
        0x97 => '—',
        0x91 => '‘',
        0x92 => '’',
        0x93 => '“',
        0x94 => '”',
        0xAB => '«',
        0xBB => '»',
        0xB9 => '№',
        0xA0 => ' ',
        _ => '?',
    }
}

// ---------- Обновления (GitHub Releases) ----------

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    current: String,
    notes: String,
    date: String,
}

/// Есть ли новая версия. None — у тебя последняя.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(u) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    // Берём описание со страницы релиза: его правят после сборки, а latest.json остаётся старым.
    let notes = match net::release_notes(u.version.clone()).await {
        Some(n) => n,
        None => u.body.clone().unwrap_or_default(),
    };
    Ok(Some(UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes,
        date: u.date.map(|d| d.to_string()).unwrap_or_default(),
    }))
}

/// Скачать и поставить обновление, затем перезапустить Glow.
/// Ход загрузки приходит событием "update-progress" (0…1).
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("Обновлений нет".into());
    };
    let mut got: u64 = 0;
    let h = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                got += chunk as u64;
                if let Some(t) = total {
                    let _ = h.emit("update-progress", got as f64 / t.max(1) as f64);
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit("before-quit", ());
    std::thread::sleep(std::time::Duration::from_millis(300));
    app.restart();
}

// ---------- Протокол stream:// ----------

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "webm" => "audio/webm",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => return None,
    })
}

fn parse_range(v: &str, len: u64) -> Option<(u64, u64)> {
    let v = v.trim().strip_prefix("bytes=")?;
    let first = v.split(',').next()?.trim();
    let (a, b) = first.split_once('-')?;
    if len == 0 {
        return None;
    }
    if a.is_empty() {
        let n: u64 = b.parse().ok()?;
        let start = len.saturating_sub(n);
        return Some((start, len - 1));
    }
    let start: u64 = a.parse().ok()?;
    if start >= len {
        return None;
    }
    let end: u64 = if b.is_empty() {
        len - 1
    } else {
        b.parse::<u64>().ok()?.min(len - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

fn empty(status: u16) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "*")
        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        .body(Vec::new())
        .unwrap()
}

fn stream_response(req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if *req.method() == tauri::http::Method::OPTIONS {
        return empty(204);
    }
    let raw = req.uri().path();
    let raw = raw.strip_prefix('/').unwrap_or(raw);
    let path = PathBuf::from(percent_decode(raw));
    let ext = ext_of(&path).unwrap_or_default();
    let Some(mime) = mime_for(&ext) else {
        return empty(403);
    };
    let Ok(mut file) = fs::File::open(&path) else {
        return empty(404);
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let range = req
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| parse_range(v, len));

    let base = Response::builder()
        .header("Content-Type", mime)
        .header("Accept-Ranges", "bytes")
        .header("Access-Control-Allow-Origin", "*")
        .header(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges",
        );

    match range {
        Some((start, end)) => {
            let end = end.min(start + CHUNK - 1);
            let n = (end - start + 1) as usize;
            let mut buf = vec![0u8; n];
            if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut buf).is_err() {
                return empty(500);
            }
            base.status(206)
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, len))
                .header("Content-Length", n.to_string())
                .body(buf)
                .unwrap()
        }
        None => {
            let mut buf = Vec::with_capacity(len as usize);
            if file.read_to_end(&mut buf).is_err() {
                return empty(500);
            }
            base.status(200)
                .header("Content-Length", buf.len().to_string())
                .body(buf)
                .unwrap()
        }
    }
}

// ---------- Команды ----------

#[tauri::command]
async fn load_library(app: AppHandle) -> Vec<Track> {
    load_cache(&app)
}

#[tauri::command]
async fn scan_library(
    app: AppHandle,
    folders: Vec<String>,
    excluded: Vec<String>,
) -> Result<Vec<Track>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_blocking(&app, folders, excluded))
        .await
        .map_err(|e| e.to_string())
}

/// Текст песни: сначала .lrc рядом с треком, потом встроенный в теги.
#[tauri::command]
async fn read_lyrics(path: String) -> Option<String> {
    let p = Path::new(&path);
    if let Ok(b) = fs::read(p.with_extension("lrc")) {
        return Some(decode_text(b));
    }
    let tagged = lofty::read_from_path(p).ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    tag.get_string(&ItemKey::Lyrics).map(|s| s.to_string())
}

#[tauri::command]
async fn read_text(path: String) -> Option<String> {
    fs::read(&path).ok().map(decode_text)
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
async fn pick_lrc(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(desktop::l("Тексты песен", "Lyrics"), &["lrc", "txt"])
        .blocking_pick_file()
        .map(|p| p.to_string())
}

/// Сохранить свой стиль в файл .glowtheme. Возвращает false, если пользователь отменил.
#[tauri::command]
async fn save_theme(app: AppHandle, name: String, content: String) -> Result<bool, String> {
    let safe: String = name
        .chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c })
        .collect();
    let picked = app
        .dialog()
        .file()
        .add_filter(desktop::l("Стиль Glow", "Glow style"), &["glowtheme"])
        .set_file_name(&safe)
        .blocking_save_file();
    let Some(fp) = picked else {
        return Ok(false);
    };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

// ---------- Редактирование тегов ----------

#[derive(Deserialize, Default)]
#[serde(default)]
pub struct TagEdit {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    album_artist: Option<String>,
    genre: Option<String>,
    year: Option<String>,
    track_no: Option<u32>,
    /// Путь к картинке JPG/PNG — новая обложка.
    cover: Option<String>,
    remove_cover: bool,
}

fn set_or_remove(tag: &mut Tag, key: ItemKey, v: &str) {
    let v = v.trim();
    tag.retain(|item| item.key() != &key);
    if !v.is_empty() {
        tag.insert_text(key, v.to_string());
    }
}

fn write_tags_blocking(app: &AppHandle, path: &str, e: TagEdit) -> Result<Track, String> {
    let p = Path::new(path);
    let mut tagged =
        lofty::read_from_path(p).map_err(|err| format!("Не удалось открыть файл: {err}"))?;
    if tagged.primary_tag().is_none() {
        let tt = tagged.primary_tag_type();
        tagged.insert_tag(Tag::new(tt));
    }
    let tag = tagged
        .primary_tag_mut()
        .ok_or("Этот формат не поддерживает теги")?;

    if let Some(v) = e.title {
        if v.trim().is_empty() {
            tag.remove_title();
        } else {
            tag.set_title(v.trim().to_string());
        }
    }
    if let Some(v) = e.artist {
        if v.trim().is_empty() {
            tag.remove_artist();
        } else {
            tag.set_artist(v.trim().to_string());
        }
    }
    if let Some(v) = e.album {
        if v.trim().is_empty() {
            tag.remove_album();
        } else {
            tag.set_album(v.trim().to_string());
        }
    }
    if let Some(v) = e.genre {
        if v.trim().is_empty() {
            tag.remove_genre();
        } else {
            tag.set_genre(v.trim().to_string());
        }
    }
    if let Some(v) = e.album_artist {
        set_or_remove(tag, ItemKey::AlbumArtist, &v);
    }
    if let Some(v) = e.year {
        tag.retain(|item| item.key() != &ItemKey::RecordingDate);
        set_or_remove(tag, ItemKey::Year, &v);
    }
    if let Some(n) = e.track_no {
        if n > 0 {
            tag.set_track(n);
        } else {
            tag.remove_track();
        }
    }
    if e.remove_cover {
        while !tag.pictures().is_empty() {
            tag.remove_picture(0);
        }
    }
    if let Some(c) = e.cover {
        let mut f =
            fs::File::open(&c).map_err(|err| format!("Не удалось открыть картинку: {err}"))?;
        let mut pic =
            Picture::from_reader(&mut f).map_err(|_| "Нужна картинка JPG или PNG".to_string())?;
        pic.set_pic_type(PictureType::CoverFront);
        tag.remove_picture_type(PictureType::CoverFront);
        tag.push_picture(pic);
    }

    tag.save_to_path(p, WriteOptions::default())
        .map_err(|err| format!("Не удалось записать теги: {err}"))?;

    // Перечитываем трек и обновляем кэш медиатеки.
    let meta = fs::metadata(p).ok();
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let size = meta.map(|m| m.len()).unwrap_or(0);
    let mut cache = load_cache(app);
    let added = cache
        .iter()
        .find(|t| t.path == path)
        .map(|t| t.added)
        .unwrap_or_else(now_secs);
    let t = read_track(p, path, mtime, size, added, &cover_dir(app));
    if let Some(slot) = cache.iter_mut().find(|x| x.path == path) {
        *slot = t.clone();
    } else {
        cache.push(t.clone());
    }
    save_cache(app, &cache);
    Ok(t)
}

/// Записать теги и обложку в файл. Возвращает обновлённый трек.
#[tauri::command]
async fn write_tags(app: AppHandle, path: String, edit: TagEdit) -> Result<Track, String> {
    tauri::async_runtime::spawn_blocking(move || write_tags_blocking(&app, &path, edit))
        .await
        .map_err(|e| e.to_string())?
}

/// Выбрать картинку для обложки трека (в теги можно только JPG и PNG).
#[tauri::command]
async fn pick_cover(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(desktop::l("Обложка", "Cover"), &["jpg", "jpeg", "png"])
        .blocking_pick_file()
        .map(|p| p.to_string())
}

/// Все .lrc в папке с текстами (с подпапками) — для автопоиска текстов по имени.
#[tauri::command]
async fn list_lrc(folder: String) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || {
        walkdir::WalkDir::new(&folder)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file() && ext_of(e.path()).as_deref() == Some("lrc"))
            .map(|e| e.path().to_string_lossy().to_string())
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Сохранить текстовый файл через диалог (обмен с Android и т. п.). false — отменено.
#[tauri::command]
async fn save_file(
    app: AppHandle,
    name: String,
    content: String,
    ext: String,
    label: String,
) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter(&label, &[ext.as_str()])
        .set_file_name(&name)
        .blocking_save_file();
    let Some(fp) = picked else {
        return Ok(false);
    };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Выбрать файл с заданными расширениями.
#[tauri::command]
async fn pick_file(app: AppHandle, exts: Vec<String>, label: String) -> Option<String> {
    let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
    app.dialog()
        .file()
        .add_filter(&label, &refs)
        .blocking_pick_file()
        .map(|p| p.to_string())
}

/// Положить картинку в папку с музыкой как folder.jpg (или folder.png) —
/// её подхватят другие плееры, Android-версия Glow и Проводник.
#[tauri::command]
fn write_folder_image(src: String, folder: String) -> Result<String, String> {
    let ext = ext_of(Path::new(&src)).unwrap_or_default();
    let name = if ext == "png" {
        "folder.png"
    } else {
        "folder.jpg"
    };
    if ext != "jpg" && ext != "jpeg" && ext != "png" {
        return Err("Для folder.jpg нужна картинка JPG или PNG".into());
    }
    let dest = Path::new(&folder).join(name);
    fs::copy(&src, &dest).map_err(|e| format!("Не удалось записать {name}: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Выбрать картинку (обложку папки).
#[tauri::command]
async fn pick_image(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(
            desktop::l("Изображения", "Images"),
            &["jpg", "jpeg", "png", "webp", "gif", "bmp"],
        )
        .blocking_pick_file()
        .map(|p| p.to_string())
}

/// Выбрать файл стиля для импорта.
#[tauri::command]
async fn pick_theme(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(
            desktop::l("Стиль Glow", "Glow style"),
            &["glowtheme", "json"],
        )
        .blocking_pick_file()
        .map(|p| p.to_string())
}

/// Сохранить профиль визуала (.glowvis).
#[tauri::command]
async fn save_profile(app: AppHandle, name: String, content: String) -> Result<bool, String> {
    let safe: String = name
        .chars()
        .map(|c| if r#"\/:*?"<>|"#.contains(c) { '_' } else { c })
        .collect();
    let picked = app
        .dialog()
        .file()
        .add_filter(desktop::l("Профиль визуала Glow", "Glow visual profile"), &["glowvis"])
        .set_file_name(&safe)
        .blocking_save_file();
    let Some(fp) = picked else {
        return Ok(false);
    };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Выбрать файл профиля визуала для импорта.
#[tauri::command]
async fn pick_profile(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter(
            desktop::l("Профиль визуала Glow", "Glow visual profile"),
            &["glowvis", "json"],
        )
        .blocking_pick_file()
        .map(|p| p.to_string())
}

/// Открыть папку с файлом и выделить его.
#[tauri::command]
fn reveal(path: String) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(parent) = Path::new(&path).parent() {
            let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
        }
    }
}

// ---------- Иконки приложения ----------

macro_rules! app_icon {
    ($n:literal) => {
        (
            $n,
            include_bytes!(concat!("../icons/app/", $n, ".png")) as &[u8],
            include_bytes!(concat!("../icons/app/", $n, ".ico")) as &[u8],
        )
    };
}

/// Пак иконок: имя, PNG для окна и панели задач, ICO для ярлыков.
const APP_ICONS: &[(&str, &[u8], &[u8])] = &[
    app_icon!("glow"),
    app_icon!("sunset"),
    app_icon!("gold"),
    app_icon!("clean"),
    app_icon!("swiss"),
    app_icon!("frost"),
    app_icon!("prism"),
    app_icon!("moss"),
    app_icon!("pulse"),
    app_icon!("capsule"),
    app_icon!("neon"),
    app_icon!("vinyl"),
];

/// Меняет иконку окна и панели задач. С shortcuts = true обновляет ещё и ярлыки
/// Glow на рабочем столе, в меню «Пуск» и закреплённый на панели задач.
#[tauri::command]
fn set_app_icon(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    shortcuts: bool,
) -> Result<(), String> {
    let (_, png, ico) = APP_ICONS
        .iter()
        .find(|(n, _, _)| *n == name)
        .ok_or("Нет такой иконки")?;
    let img = tauri::image::Image::from_bytes(png).map_err(|e| e.to_string())?;
    window.set_icon(img).map_err(|e| e.to_string())?;
    if shortcuts {
        update_shortcuts(&app, &name, ico)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn update_shortcuts(app: &AppHandle, name: &str, ico: &[u8]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let dir = data_dir(app).join("icons");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("glow-{}.ico", name));
    fs::write(&path, ico).map_err(|e| e.to_string())?;
    let ico_path = path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"$ico = '{ico_path}'
$sh = New-Object -ComObject WScript.Shell
$dirs = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'), (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))
foreach ($d in $dirs) {{
  if ($d -and (Test-Path $d)) {{
    Get-ChildItem -Path $d -Filter 'Glow*.lnk' -Recurse -Depth 1 -ErrorAction SilentlyContinue | ForEach-Object {{
      try {{ $l = $sh.CreateShortcut($_.FullName); $l.IconLocation = $ico + ',0'; $l.Save() }} catch {{ }}
    }}
  }}
}}
try {{ ie4uinit.exe -show }} catch {{ }}"#
    );
    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .creation_flags(0x0800_0000) // без окна консоли
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn update_shortcuts(_app: &AppHandle, _name: &str, _ico: &[u8]) -> Result<(), String> {
    Ok(())
}

struct MiniState(Mutex<Option<tauri::PhysicalSize<u32>>>);

#[tauri::command]
fn win_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn win_toggle_max(window: WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
fn win_close(window: WebviewWindow) {
    if desktop::CLOSE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed) {
        let _ = window.hide();
    } else {
        let _ = window.close();
    }
}

/// Мини-плеер: маленькое окно поверх всех. При выходе возвращаем прежний размер.
#[tauri::command]
fn set_mini(window: WebviewWindow, state: tauri::State<'_, MiniState>, mini: bool) {
    if mini {
        if !window.is_maximized().unwrap_or(false) {
            if let Ok(s) = window.inner_size() {
                *state.0.lock().unwrap() = Some(s);
            }
        }
        let _ = window.unmaximize();
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(340.0, 120.0)));
        let _ = window.set_size(tauri::LogicalSize::new(400.0, 140.0));
        let _ = window.set_always_on_top(true);
    } else {
        let _ = window.set_always_on_top(false);
        let _ = window.set_min_size(Some(tauri::LogicalSize::new(960.0, 600.0)));
        let prev = state.0.lock().unwrap().take();
        match prev {
            Some(s) => {
                let _ = window.set_size(s);
            }
            None => {
                let _ = window.set_size(tauri::LogicalSize::new(1280.0, 800.0));
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Второй запуск Glow просто показывает уже открытое окно.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            desktop::show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(desktop::shortcut_plugin())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(MiniState(Mutex::new(None)))
        .setup(|app| {
            desktop::setup(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main"
                    && desktop::CLOSE_TO_TRAY.load(std::sync::atomic::Ordering::Relaxed)
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .register_asynchronous_uri_scheme_protocol("stream", |_ctx, request, responder| {
            std::thread::spawn(move || {
                responder.respond(stream_response(&request));
            });
        })
        .invoke_handler(tauri::generate_handler![
            load_library,
            scan_library,
            read_lyrics,
            read_text,
            pick_folder,
            pick_lrc,
            reveal,
            win_minimize,
            win_toggle_max,
            win_close,
            set_mini,
            set_app_icon,
            save_theme,
            pick_theme,
            pick_profile,
            save_profile,
            pick_image,
            write_tags,
            pick_cover,
            store_read_all,
            store_write,
            store_delete,
            backup_save,
            backup_restore,
            list_lrc,
            save_file,
            pick_file,
            write_folder_image,
            desktop::set_tray_tip,
            desktop::set_close_to_tray,
            desktop::set_global_hotkeys,
            desktop::set_thumb_playing,
            desktop::watch_folders,
            desktop::set_ui_lang,
            check_update,
            install_update,
            net::online_lyrics,
            net::forget_online_lyrics,
            net::search_covers,
            net::lastfm_available,
            net::lastfm_begin,
            net::lastfm_finish,
            net::lastfm_now_playing,
            net::lastfm_scrobble,
            net::listenbrainz_check,
            net::listenbrainz_now_playing,
            net::listenbrainz_submit,
            net::discord_set,
            net::cover_url_for,
            net::read_tracks,
            net::trash_file,
            net::open_url
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Glow");
}
