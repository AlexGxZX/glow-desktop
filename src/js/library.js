// Glow для ПК — library.js (часть интерфейса, вынесена из main.js).

import { relinkDialog } from './features.js';
import { next, playTracks, prev, setVolume, toggleFav, togglePlay, updateNowPlaying } from './player.js';
import { S, curTrack, engine, favs, flushNow, saveSettings, setLibrary, settings } from './state.js';
import { $, TAURI, invoke, toast, tracksWord } from './util.js';
import { render } from './views.js';

// ================= Медиатека: сканирование =================

export async function addFolder() {
  const p = await invoke('pick_folder').catch(() => null);
  if (!p) return;
  if (settings.folders.includes(p)) { toast('Эта папка уже добавлена'); return; }
  settings.folders.push(p);
  saveSettings();
  watchFolders();
  if (S.view.name === 'settings') render($('#content').scrollTop);
  scan();
}

export async function scan(quiet = false) {
  if (S.scanning) { S.rescan = true; return; }
  if (!settings.folders.length) { setLibrary([]); render(); return; }
  S.scanning = true;
  S.lastScan = Date.now();
  const st0 = $('#scan-status');
  if (st0 && !quiet) { st0.classList.remove('hidden'); st0.innerHTML = 'Сканирую…<div class="scan-bar"><div></div></div>'; }
  if (!S.tracks.length) render();
  try {
    const tracks = await invoke('scan_library', { folders: settings.folders, excluded: settings.excluded });
    const before = S.tracks.length;
    const old = new Set(S.tracks.map((t) => t.path));
    setLibrary(tracks);
    render($('#content').scrollTop);
    const diff = tracks.length - before;
    const added = tracks.filter((t) => !old.has(t.path));
    if (before && added.length === 1 && diff === 1) toast(`Добавлен трек: ${added[0].title}`);
    else if (before && diff) toast(diff > 0 ? `Новых треков: ${diff}` : `Убрано треков: ${-diff}`);
    else if (!before) toast(`Найдено: ${tracksWord(tracks.length)}`);
    updateNowPlaying();
    setTimeout(() => relinkDialog(false), 400);
  } catch (e) {
    toast(`Не удалось просканировать: ${e}`);
  } finally {
    S.scanning = false;
    const st1 = $('#scan-status');
    if (st1) st1.classList.add('hidden');
    if (!S.tracks.length) render();
    if (S.rescan) { S.rescan = false; setTimeout(() => scan(true), 300); }
  }
}

/** Следить за папками медиатеки: новые, удалённые и изменённые файлы подхватываются сами. */
export function watchFolders() {
  invoke('watch_folders', { folders: settings.watchFolders ? settings.folders : [] }).catch((e) => console.warn('watch', e));
}

/** Команды из трея, глобальных клавиш и кнопок на миниатюре в панели задач. */
export function onMedia(action) {
  switch (action) {
    case 'play': if (curTrack()) togglePlay(); else if (S.tracks.length) playTracks(S.tracks, 0); break;
    case 'next': next(); break;
    case 'prev': prev(); break;
    case 'stop': engine.stop(); break;
    case 'volup': setVolume(settings.volume + 0.05); toast(`Громкость ${Math.round(settings.volume * 100)}%`, 900); break;
    case 'voldown': setVolume(settings.volume - 0.05); toast(`Громкость ${Math.round(settings.volume * 100)}%`, 900); break;
    case 'like': {
      const t = curTrack();
      if (t) { toggleFav(t.path); toast(favs.has(t.path) ? `«${t.title}» в избранном` : `«${t.title}» убран из избранного`, 1500); }
      break;
    }
    default: break;
  }
}

export async function applyDesktop() {
  invoke('set_close_to_tray', { on: !!settings.closeToTray }).catch(() => {});
  try {
    const busy = await invoke('set_global_hotkeys', { on: !!settings.globalHotkeys, media: !!settings.mediaKeys });
    S.hotkeysBusy = busy || [];
  } catch { S.hotkeysBusy = []; }
}

if (TAURI) {
  TAURI.event.listen('media', (e) => onMedia(e.payload));
  TAURI.event.listen('library-changed', () => {
    clearTimeout(S.watchT);
    S.watchT = setTimeout(() => scan(true), 600);
  });
  // Сетевые диски и флешки не всегда сообщают об изменениях — при возврате в окно проверяем, если давно не сканировали.
  window.addEventListener('focus', () => {
    if (settings.watchFolders && settings.folders.length && Date.now() - (S.lastScan || 0) > 5 * 60 * 1000) scan(true);
  });
  TAURI.event.listen('before-quit', () => flushNow());
  TAURI.event.listen('scan-progress', (e) => {
    const [done, total] = e.payload;
    const st = $('#scan-status');
    if (st) st.innerHTML = `Сканирую: ${done} / ${total}<div class="scan-bar"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>`;
  });
}

