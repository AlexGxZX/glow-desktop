// Glow для ПК — онлайн-функции: тексты из LRCLIB, поиск обложек, Last.fm, ListenBrainz, Discord.
// Всё необязательное. Без интернета Glow работает как обычно: найденное хранится у себя,
// прослушивания копятся в очереди и уходят, когда связь появится.

import { I } from './icons.js';
import { openModal } from './dialogs.js';
import { S, engine, meta, saveMeta, saveSettings, settings } from './state.js';
import { $, TAURI, UNKNOWN_ARTIST, esc, fileSrc, invoke, toast } from './util.js';

export const online = () => !settings.offline && navigator.onLine !== false;

// ================= Тексты =================

/** Текст из LRCLIB для трека, у которого нет своего. force — искать заново, мимо кэша. */
export async function fetchOnlineLyrics(t, force = false) {
  if (!t || !settings.onlineLyrics || (!online() && !force)) return null;
  try {
    const r = await invoke('online_lyrics', {
      path: t.path, artist: t.artist || '', title: t.title || '', album: t.album || '', duration: t.duration || 0, force,
    });
    return r && r.text ? r : null;
  } catch {
    return null; // нет сети — просто без текста
  }
}

export function forgetOnlineLyrics(t) {
  return invoke('forget_online_lyrics', { path: t.path }).catch(() => {});
}

// ================= Обложки =================

/** Окно выбора обложки из интернета. Возвращает путь к выбранной картинке или null. */
export function pickOnlineCover(artist, album) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`<div class="modal-head"><div class="heading">Обложка из интернета</div><button class="icon-btn" data-close>${I.close}</button></div>
      <div class="oc-search"><input class="field" id="oc-artist" value="${esc(artist || '')}" placeholder="Исполнитель" spellcheck="false">
        <input class="field" id="oc-album" value="${esc(album || '')}" placeholder="Альбом" spellcheck="false">
        <button class="btn" id="oc-go">${I.search}Искать</button></div>
      <div class="oc-grid" id="oc-grid"></div>
      <div class="caption" style="margin-top:10px">Источники: iTunes и MusicBrainz / Cover Art Archive. Картинка запишется в файлы так же, как выбранная с диска.</div>`,
    { wide: true, onClose: () => { if (!done) resolve(null); } });
    const grid = $('#oc-grid', m.el);
    const search = async () => {
      if (!online()) { grid.innerHTML = '<div class="muted oc-msg">Нет связи с интернетом</div>'; return; }
      grid.innerHTML = `<div class="muted oc-msg">${I.search}Ищу обложки…</div>`;
      try {
        const list = await invoke('search_covers', { artist: $('#oc-artist', m.el).value.trim(), album: $('#oc-album', m.el).value.trim() });
        if (!list.length) { grid.innerHTML = '<div class="muted oc-msg">Ничего не нашлось. Попробуй убрать лишнее из названия альбома.</div>'; return; }
        grid.innerHTML = list.map((c, i) => `<button class="oc-item" data-oc="${i}" title="${esc(c.title)}">
          <img src="${fileSrc(c.path)}" alt="" loading="lazy"><span class="caption">${esc(c.source)}${c.size ? ` · ${esc(c.size)}` : ''}</span></button>`).join('');
        grid.onclick = (e) => {
          const b = e.target.closest('[data-oc]');
          if (!b) return;
          done = true;
          m.close();
          resolve(list[+b.dataset.oc].path);
        };
      } catch (e) {
        grid.innerHTML = `<div class="muted oc-msg">Не получилось: ${esc(String(e).slice(0, 160))}</div>`;
      }
    };
    $('#oc-go', m.el).onclick = search;
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.field')) search(); });
    search();
  });
}

// ================= Скробблинг =================

const SCROBBLE_MIN = 30; // треки короче 30 секунд не скробблятся (правило Last.fm)
let flushT = 0, flushing = false, npT = 0;

function scrobbleItem(t, at) {
  return {
    artist: t.artist || UNKNOWN_ARTIST, title: t.title || '', album: t.album || '',
    album_artist: t.album_artist || '', duration: Math.round(t.duration || 0), at,
  };
}

const services = () => [
  settings.lfmSession && { id: 'lfm', send: (items) => invoke('lastfm_scrobble', { sk: settings.lfmSession, items }), max: 50 },
  settings.lbToken && { id: 'lb', send: (items) => invoke('listenbrainz_submit', { token: settings.lbToken, items }), max: 100 },
].filter(Boolean);

/** Вызывается каждый тик: трек дослушан до половины (или 4 минут) — в очередь на отправку. */
export function scrobbleTick(t) {
  if (!t || S.scrobbled || !services().length) return;
  const dur = t.duration || engine.duration || 0;
  if (dur < SCROBBLE_MIN) return;
  if (S.listened < Math.min(240, dur / 2)) return;
  S.scrobbled = true;
  const at = Math.floor(Date.now() / 1000 - S.listened);
  const q = meta.scrobbleQ || (meta.scrobbleQ = {});
  for (const s of services()) {
    const list = q[s.id] || (q[s.id] = []);
    list.push(scrobbleItem(t, at));
    if (list.length > 3000) list.splice(0, list.length - 3000);
  }
  saveMeta();
  scheduleFlush(1500);
}

export function scheduleFlush(ms = 60000) {
  clearTimeout(flushT);
  flushT = setTimeout(flushScrobbles, ms);
}

/** Отправить накопленное. Если сети нет — попробуем позже, ничего не теряется. */
export async function flushScrobbles() {
  if (flushing) return;
  const q = meta.scrobbleQ || {};
  const pending = services().filter((s) => (q[s.id] || []).length);
  if (!pending.length) return;
  if (!online()) { scheduleFlush(5 * 60000); return; }
  flushing = true;
  let failed = false;
  try {
    for (const s of pending) {
      while ((q[s.id] || []).length) {
        const batch = q[s.id].slice(0, s.max);
        try {
          await s.send(batch);
          q[s.id].splice(0, batch.length);
          saveMeta();
        } catch (e) {
          const msg = String(e);
          // Ошибки авторизации не лечатся повтором — показываем один раз.
          if (/Last\.fm (4|9|26):|ListenBrainz 401/.test(msg)) {
            if (!S.scrobbleWarned) { S.scrobbleWarned = true; toast(`Скробблинг: ${msg.slice(0, 140)}. Переподключи аккаунт в настройках.`, 7000); }
          }
          failed = true;
          break;
        }
      }
    }
  } finally {
    flushing = false;
  }
  if (failed) scheduleFlush(10 * 60000);
}

export const pendingScrobbles = () => Object.values(meta.scrobbleQ || {}).reduce((n, l) => n + l.length, 0);

/** «Сейчас слушает» — через пару секунд после старта, чтобы не дёргать сервис при быстром листании. */
function nowPlaying(t) {
  clearTimeout(npT);
  if (!t || !online()) return;
  npT = setTimeout(() => {
    if (!engine.playing || curPath !== t.path) return;
    const item = scrobbleItem(t, Math.floor(Date.now() / 1000));
    if (settings.lfmSession) invoke('lastfm_now_playing', { sk: settings.lfmSession, track: item }).catch(() => {});
    if (settings.lbToken) invoke('listenbrainz_now_playing', { token: settings.lbToken, track: item }).catch(() => {});
  }, 3000);
}

// ================= Discord =================

let curPath = null, discordT = 0;

async function coverUrl(t) {
  if (!settings.discordCover || !online()) return null;
  const key = `${(t.album_artist || t.artist || '').toLowerCase()}|${(t.album || t.title || '').toLowerCase()}`;
  const cache = meta.coverUrls || (meta.coverUrls = {});
  if (key in cache) return cache[key];
  const url = await invoke('cover_url_for', { artist: t.album_artist || t.artist || '', album: t.album || '', title: t.title || '' }).catch(() => undefined);
  if (url === undefined) return null; // ошибка сети — спросим в следующий раз
  cache[key] = url || null;
  const keys = Object.keys(cache);
  if (keys.length > 2000) delete cache[keys[0]];
  saveMeta();
  return cache[key];
}

export function updateDiscord(t) {
  clearTimeout(discordT);
  if (!TAURI) return;
  if (!settings.discord || !t) { invoke('discord_set', { track: null }).catch(() => {}); return; }
  discordT = setTimeout(async () => {
    const url = await coverUrl(t);
    invoke('discord_set', {
      track: {
        title: t.title || '', artist: t.artist || UNKNOWN_ARTIST, album: t.album || '',
        position: engine.time || 0, duration: t.duration || engine.duration || 0, playing: engine.playing, cover_url: url,
      },
    }).catch(() => {});
  }, 600);
}

// ================= Связь с плеером =================

export function onlineTrackChanged(t) {
  curPath = t ? t.path : null;
  S.scrobbled = false;
  if (t && engine.playing) nowPlaying(t);
  updateDiscord(t);
}

export function onlineStateChanged(t) {
  if (t && engine.playing) nowPlaying(t);
  updateDiscord(t);
}

export function onlineSeeked(t) {
  updateDiscord(t);
}

export function initOnline() {
  window.addEventListener('online', () => scheduleFlush(3000));
  scheduleFlush(15000);
  setInterval(() => scheduleFlush(1000), 15 * 60000);
}

// ================= Подключение аккаунтов =================

export async function connectLastfm(rerender) {
  try {
    const avail = await invoke('lastfm_available');
    if (!avail) { toast('В этой сборке нет ключа Last.fm — скачай Glow со страницы релизов на GitHub', 6000); return; }
    const { token, url } = await invoke('lastfm_begin');
    await invoke('open_url', { url });
    const m = openModal(`<div class="modal-head"><div class="heading">Подключение Last.fm</div><button class="icon-btn" data-close>${I.close}</button></div>
      <div class="muted" style="margin-bottom:14px">В браузере открылась страница Last.fm. Войди в аккаунт, нажми «Yes, allow access» и вернись сюда.</div>
      <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" id="lfm-done">${I.check}Я разрешил доступ</button></div>`);
    $('#lfm-done', m.el).onclick = async () => {
      try {
        const s = await invoke('lastfm_finish', { token });
        settings.lfmSession = s.key;
        settings.lfmUser = s.name;
        saveSettings();
        m.close();
        toast(`Last.fm подключён: ${s.name}`);
        scheduleFlush(2000);
        rerender && rerender();
      } catch (e) { toast(String(e), 6000); }
    };
  } catch (e) {
    toast(`Last.fm: ${String(e).slice(0, 160)}`, 6000);
  }
}

export function disconnectLastfm() {
  settings.lfmSession = ''; settings.lfmUser = '';
  if (meta.scrobbleQ) delete meta.scrobbleQ.lfm;
  saveSettings(); saveMeta();
}

export async function connectListenBrainz(token, rerender) {
  token = (token || '').trim();
  if (!token) { toast('Вставь токен из профиля ListenBrainz'); return; }
  try {
    const user = await invoke('listenbrainz_check', { token });
    settings.lbToken = token;
    settings.lbUser = user;
    saveSettings();
    toast(`ListenBrainz подключён: ${user}`);
    scheduleFlush(2000);
    rerender && rerender();
  } catch (e) { toast(`ListenBrainz: ${String(e).slice(0, 160)}`, 6000); }
}

export function disconnectListenBrainz() {
  settings.lbToken = ''; settings.lbUser = '';
  if (meta.scrobbleQ) delete meta.scrobbleQ.lb;
  saveSettings(); saveMeta();
}
