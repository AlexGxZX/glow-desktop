// Glow для ПК — ui.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { STYLES, applyTheme, extractPalette } from './theme.js';
import { MOTIONS } from './visuals.js';
import { showMenu } from './dialogs.js';
import { addToQueue, next, playNext, playTracks, startMeters } from './player.js';
import { sel } from './settings.js';
import { pinToSidebar } from './sidebar.js';
import { S, ambient, curTrack, engine, favs, meta, saveMeta, settings, track, vis, visuals } from './state.js';
import { $, ROW, UNKNOWN_ARTIST, esc, fileSrc, fmt, fmtLong, invoke, toast, tracksWord } from './util.js';
import { go, render } from './views.js';

// ================= Тема =================

export let themeReq = 0;
export async function refreshTheme() {
  const t = curTrack();
  const url = t && t.cover ? fileSrc(t.cover) : null;
  const req = ++themeReq;
  syncScene();
  const pal = url ? await extractPalette(url) : null;
  if (req !== themeReq) return;
  S.palette = pal;
  S.theme = applyTheme(settings, pal);
  visuals.setTheme(S.theme);
  ambient.set(S.theme.fx || (settings.styleMotifs !== false ? S.theme.motif : null), S.theme, settings.animations);
  startMeters();
  const bgUrl = url ? `url("${url}")` : 'none';
  $('#bg-art').style.backgroundImage = bgUrl;
  $('#now-blur').style.backgroundImage = bgUrl;
}

/** Сцене нужна обложка и треки альбома (луны у планеты). */
export function sceneTrack() {
  const t = curTrack();
  if (!visuals.scenes.active) return;
  const al = t && t._album ? S.albumByKey.get(t._album) : null;
  visuals.scenes.setTrack(t, t && t.cover ? fileSrc(t.cover) : null, al ? al.tracks : []);
}

/** Сцена: своя у стиля (у своего стиля — у его основы) или выбранная в настройках. */
export function syncScene() {
  const v = vis();
  const st = STYLES[settings.style] || {};
  const own = st.scene || (st.base && STYLES[st.base] && STYLES[st.base].scene);
  const scene = v.scene && v.scene !== 'auto' ? v.scene : settings.scene && settings.scene !== 'auto' ? settings.scene : own || 'none';
  const was = visuals.scenes.kind;
  visuals.scenes.set(scene);
  const now = $('#now');
  now.classList.toggle('has-scene', visuals.scenes.active);
  now.dataset.scene = visuals.scenes.kind;
  if (was !== visuals.scenes.kind) visuals.scenes.imgSrc = undefined;
  sceneTrack();
}

export function applyVisualSettings() {
  const v = vis();
  visuals.setMode(v.backdrop);
  visuals.particlesOn = v.particles;
  visuals.beatDelay = settings.beatDelay;
  visuals.animations = settings.animations;
  const now = $('#now');
  now.classList.toggle('mode-blur', v.backdrop === 'blur');
  syncScene();
  const c = $('#now-cover');
  for (const m of Object.keys(MOTIONS)) c.classList.toggle(`motion-${m}`, v.motion === m);
  c.style.setProperty('--pulse', 0);
  c.style.setProperty('--tx', '0deg');
  c.style.setProperty('--ty', '0deg');
}

export function applyAudio() {
  engine.setVolume(settings.volume);
  engine.setMuted(settings.muted);
  engine.gapless = settings.gapless;
  engine.crossfade = settings.crossfade || 0;
  engine.setReplayGain(settings.replayGain, settings.rgPreamp || 0);
  const eq = settings.eq;
  engine.setEq(eq.enabled ? eq.gains : eq.gains.map(() => 0));
  engine.setPreamp(eq.enabled ? eq.preamp : 0);
  engine.setBalance(eq.balance || 0);
  engine.setLimiter(eq.limiter);
}

// ================= Разметка общих элементов =================

export function coverHtml(path, eager = false) {
  return path
    ? `<img src="${esc(fileSrc(path))}" ${eager ? '' : 'loading="lazy"'} decoding="async" alt="" draggable="false">`
    : `<div class="ph">${I.music}</div>`;
}

export function starsHtml(r, cls = '') {
  let h = `<div class="stars${r ? ' has' : ''} ${cls}" data-act="rate">`;
  for (let n = 1; n <= 5; n++) h += `<button data-star="${n}" class="${n <= r ? 'on' : ''}" title="${n}">${I.star}</button>`;
  return h + '</div>';
}

export function techText(t, short = false) {
  if (!t || t.missing) return '';
  const k = t.sample_rate ? `${(t.sample_rate / 1000).toFixed(1).replace('.0', '')} кГц` : '';
  if (short) return [t.format, t.sample_rate ? `${(t.sample_rate / 1000).toFixed(1).replace('.0', '')}${t.bit_depth ? '/' + t.bit_depth : ''}` : ''].filter(Boolean).join(' ');
  return [t.format, k, t.bit_depth ? `${t.bit_depth} бит` : '', t.bitrate ? `${t.bitrate} кбит/с` : '', t.channels === 1 ? 'моно' : ''].filter(Boolean).join(' · ');
}
export const isStudio = () => settings.style === 'studio';

export function rowHtml(t, i, ctx) {
  const cur = curTrack();
  const playing = cur && cur.path === t.path;
  const num = playing
    ? `<span class="eqbars ${engine.playing ? '' : 'paused'}"><i></i><i></i><i></i></span>`
    : `<span class="r-n">${ctx.numbers === 'track' && t.track_no ? t.track_no : i + 1}</span><span class="r-playbtn">${I.play}</span>`;
  const r = meta.ratings[t.path] || 0;
  const fav = favs.has(t.path);
  const third = ctx.third === 'played' ? (t._when || '') : esc(t.album);
  return `<div class="row${playing ? ' playing' : ''}${S.sel === i ? ' sel' : ''}${t.missing ? ' missing' : ''}" data-i="${i}" style="top:${i * ROW}px">
    <div class="r-num">${num}</div>
    <div class="r-main"><div class="r-cover">${coverHtml(t.cover)}</div>
      <div class="r-text"><div class="r-title">${esc(t.title)}</div><div class="r-sub">${esc(t.artist || UNKNOWN_ARTIST)}</div></div></div>
    <div class="r-album">${third}</div>
    <div>${t.missing ? '' : isStudio() ? `<span class="r-tech">${esc(techText(t, true))}</span>` : starsHtml(r)}</div>
    <button class="r-fav${fav ? ' on' : ''}" data-act="fav" title="Избранное">${fav ? I.heartFill : I.heart}</button>
    <div class="r-dur time">${t.missing ? '' : fmt(t.duration)}</div>
  </div>`;
}

/** Виртуальный список: рисуем только видимые строки, чтобы медиатека на 20 000 треков не тормозила. */
export function mountList(host, items, ctx = {}) {
  S.viewList = items;
  S.viewCtx = ctx;
  S.sel = -1;
  const third = ctx.third === 'played' ? 'Когда' : 'Альбом';
  host.innerHTML = `<div class="tl-head overline"><div style="text-align:center">#</div><div>Название</div><div>${third}</div><div>${isStudio() ? 'Формат' : 'Оценка'}</div><div></div><div>Время</div></div>
    <div class="vlist" style="height:${items.length * ROW}px"></div>`;
  const box = host.querySelector('.vlist');
  const content = $('#content');
  let first = -1, last = -1;
  const update = (force) => {
    if (!box.isConnected) return;
    const top = box.getBoundingClientRect().top - content.getBoundingClientRect().top;
    const vh = content.clientHeight;
    const start = Math.max(0, Math.floor(-top / ROW) - 6);
    const end = Math.min(items.length, Math.ceil((vh - top) / ROW) + 6);
    if (!force && start === first && end === last) return;
    first = start; last = end;
    let html = '';
    for (let i = start; i < end; i++) html += rowHtml(items[i], i, ctx);
    box.innerHTML = html;
  };
  S.vl = { update, refresh: () => update(true), box };
  update(true);
}

export function viewHead({ title, metaText, cover, round = false, actions = true, extra = '', noCover = false }) {
  const coverPart = noCover ? '' : cover !== undefined ? `<div class="vh-cover${round ? ' round' : ''}">${coverHtml(cover, true)}</div>` : '';
  return `<div class="view-head">${coverPart}<div class="vh-text">
    <h1 class="display">${esc(title)}</h1>
    ${metaText ? `<div class="vh-meta">${metaText}</div>` : ''}
    ${actions || extra ? `<div class="actions">
      ${actions ? `<button class="btn primary" data-cmd="play-all">${I.play}Слушать</button><button class="btn" data-cmd="shuffle-all">${I.shuffle}Перемешать</button>` : ''}
      ${extra}
    </div>` : ''}</div></div>`;
}

export function listMeta(list) {
  const d = list.reduce((s, t) => s + (t.duration || 0), 0);
  return `${tracksWord(list.length)} · ${fmtLong(d)}`;
}

export const folderName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || p;

/** Обложки папки: своя картинка, иначе до четырёх разных обложек треков внутри. */
export function folderCovers(f) {
  const own = meta.folderCovers && meta.folderCovers[f.path];
  if (own) return [own];
  const seen = new Set();
  for (const t of f.tracks) {
    if (t.cover && !seen.has(t.cover)) { seen.add(t.cover); if (seen.size >= 4) break; }
  }
  return [...seen];
}

export function folderArt(f, small = false) {
  const cv = folderCovers(f);
  if (cv.length >= 4 && !small) return `<div class="mosaic">${cv.slice(0, 4).map((p) => coverHtml(p)).join('')}</div>`;
  if (cv.length) return coverHtml(cv[0]);
  return `<div class="ph">${I.folder}</div>`;
}

export function folderCard(f) {
  const parent = f.path.replace(/[\\/][^\\/]*[\\/]?$/, '');
  return `<div class="card" data-go="folder" data-key="${esc(f.path)}" title="${esc(f.path)}">
    <div class="card-art">${folderArt(f)}<button class="card-play" data-cmd="play-folder" data-key="${esc(f.path)}">${I.play}</button></div>
    <div class="card-title">${esc(folderName(f.path))}</div><div class="card-sub">${tracksWord(f.tracks.length)} · ${esc(folderName(parent))}</div></div>`;
}

export function folderMenu(path, x, y) {
  const f = S.folders.find((v) => v.path === path);
  if (!f) return;
  const paths = f.tracks.map((t) => t.path);
  const own = meta.folderCovers && meta.folderCovers[path];
  showMenu(`<button class="mi" data-m="play">${I.play}Слушать папку</button><button class="mi" data-m="shuffle">${I.shuffle}Перемешать</button>
    <button class="mi" data-m="next">${I.next}Играть следующим</button><button class="mi" data-m="queue">${I.queue}Добавить в очередь</button>
    <div class="mi-sep"></div><button class="mi" data-m="pin">${I.pin}Закрепить в меню</button><button class="mi" data-m="cover">${I.album}Выбрать обложку…</button>
    ${own ? `<button class="mi" data-m="reset">${I.refresh}Вернуть обложку из треков</button>` : ''}
    ${folderCovers(f).length ? `<button class="mi" data-m="folderjpg">${I.check}Сохранить обложку в папку (folder.jpg)</button>` : ''}
    <button class="mi" data-m="reveal">${I.folder}Открыть в проводнике</button>`, x, y, async (cmd) => {
    if (cmd === 'play') playTracks(f.tracks, 0);
    else if (cmd === 'shuffle') playTracks(f.tracks, Math.floor(Math.random() * f.tracks.length), { shuffle: true });
    else if (cmd === 'next') playNext(paths);
    else if (cmd === 'queue') addToQueue(paths);
    else if (cmd === 'reveal') invoke('reveal', { path: f.tracks[0].path });
    else if (cmd === 'pin') pinToSidebar('folder', path, folderName(path));
    else if (cmd === 'folderjpg') {
      try {
        const dest = await invoke('write_folder_image', { src: folderCovers(f)[0], folder: path });
        toast(`Сохранено: ${dest}`, 3500);
      } catch (e) { toast(String(e), 4000); }
    }
    else if (cmd === 'cover') {
      const img = await invoke('pick_image').catch(() => null);
      if (!img) return;
      meta.folderCovers = meta.folderCovers || {};
      meta.folderCovers[path] = img;
      saveMeta(); render($('#content').scrollTop); toast('Обложка папки изменена');
    } else if (cmd === 'reset') {
      delete meta.folderCovers[path];
      saveMeta(); render($('#content').scrollTop);
    }
  });
}

export function albumCard(a) {
  return `<div class="card" data-go="album" data-key="${esc(a.key)}">
    <div class="card-art">${coverHtml(a.cover)}<button class="card-play" data-cmd="play-album" data-key="${esc(a.key)}">${I.play}</button></div>
    <div class="card-title">${esc(a.name)}</div><div class="card-sub">${esc(a.artist)}${a.year ? ' · ' + esc(a.year) : ''}</div></div>`;
}

export function artistCard(r) {
  return `<div class="card round" data-go="artist" data-key="${esc(r.name)}">
    <div class="card-art">${coverHtml(r.cover)}</div>
    <div class="card-title">${esc(r.name)}</div><div class="card-sub">${tracksWord(r.tracks.length)}</div></div>`;
}

export function emptyHtml(icon, title, text, button = '') {
  return `<div class="empty"><div class="big-ico">${I[icon]}</div><div class="heading">${esc(title)}</div><div>${text}</div>${button}</div>`;
}

