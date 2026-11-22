// Glow для ПК — медиатека: плейлисты .m3u, перетаскивание файлов в окно, дубликаты, «Итоги года».

import { t as tl } from './i18n.js';
import { I } from './icons.js';
import { confirmModal, openModal } from './dialogs.js';
import { applyRelinks } from './features.js';
import { scan, watchFolders } from './library.js';
import { addToQueue, playTracks } from './player.js';
import { renderPlaylists } from './sidebar.js';
import { S, meta, saveMeta, saveSettings, settings } from './state.js';
import { coverHtml, emptyHtml, viewHead } from './ui.js';
import { $, LOCALE, TAURI, UNKNOWN_ARTIST, esc, fmt, invoke, pluralWord, toast, tracksWord } from './util.js';
import { buildM3u, computeWrapped, findDuplicates, historyYears, matchM3u, parseM3u } from './pure.js';
import { go, render } from './views.js';

const dirOf = (p) => p.replace(/[\\/][^\\/]*$/, '');
const extOf = (p) => (/\.([^.\\/]+)$/.exec(p) || [])[1]?.toLowerCase() || '';
const AUDIO = new Set(['mp3', 'flac', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'webm', 'alac', 'aiff', 'aif', 'wma', 'ape', 'wv']);

// ================= .m3u =================

export async function exportPlaylistM3u(id) {
  const pl = meta.playlists.find((p) => p.id === id);
  if (!pl) return;
  const tracks = pl.tracks.map((p) => S.byPath.get(p)).filter(Boolean);
  try {
    const ok = await invoke('save_file', { name: `${pl.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Плейлист'}.m3u8`, content: buildM3u(tracks), ext: 'm3u8', label: tl('Плейлист M3U') });
    if (ok) toast(`Плейлист сохранён: ${tracksWord(tracks.length)}`);
  } catch (e) { toast(`Не удалось сохранить: ${e}`); }
}

/** Импорт одного или нескольких .m3u/.m3u8: новые плейлисты из найденных в медиатеке треков. */
export async function importM3u(paths) {
  if (!paths) {
    const p = await invoke('pick_file', { exts: ['m3u', 'm3u8'], label: tl('Плейлист M3U') }).catch(() => null);
    if (!p) return;
    paths = [p];
  }
  let made = 0, total = 0, lost = 0;
  for (const path of paths) {
    const text = await invoke('read_text', { path }).catch(() => null);
    if (!text) { toast(`Не удалось прочитать ${path}`); continue; }
    const { found, missing } = matchM3u(parseM3u(text, dirOf(path)), S.tracks);
    lost += missing.length;
    if (!found.length) continue;
    const name = path.split(/[\\/]/).pop().replace(/\.m3u8?$/i, '');
    meta.playlists.push({ id: 'p' + Date.now().toString(36) + made, name, tracks: [...new Set(found.map((t) => t.path))], created: Date.now() });
    made++;
    total += found.length;
  }
  if (!made) { toast(lost ? `В медиатеке не нашлось ни одного трека из плейлиста (${lost})` : 'Плейлист пустой'); return; }
  saveMeta();
  renderPlaylists();
  toast(`Импортировано плейлистов: ${made}, треков: ${total}${lost ? `, не найдено в медиатеке: ${lost}` : ''}`, 5000);
  const last = meta.playlists[meta.playlists.length - 1];
  go('playlist', last.id);
}

// ================= Перетаскивание файлов =================

/** Файлы, перетащенные из Проводника: плейлисты импортируются, музыка играет или идёт в медиатеку. */
export async function handleDrop(paths) {
  if (!paths || !paths.length) return;
  const lists = paths.filter((p) => /\.m3u8?$/i.test(p));
  if (lists.length) await importM3u(lists);
  const rest = paths.filter((p) => !/\.m3u8?$/i.test(p));
  if (!rest.length) return;
  const folders = rest.filter((p) => !extOf(p) || !AUDIO.has(extOf(p)));
  toast('Читаю файлы…', 10000);
  let tracks = await invoke('read_tracks', { paths: rest }).catch(() => []);
  tracks = (tracks || []).map((t) => S.byPath.get(t.path) || t);
  if (!tracks.length) { toast('Среди перетащенного нет музыки'); return; }
  // Треки не из медиатеки играют, пока Glow открыт: держим их рядом с медиатекой.
  for (const t of tracks) if (!S.byPath.has(t.path)) { S.external.set(t.path, t); S.byPath.set(t.path, t); }
  toast(`Найдено: ${tracksWord(tracks.length)}`, 1200);
  const inLib = (f) => settings.folders.some((d) => f.toLowerCase() === d.toLowerCase() || f.toLowerCase().startsWith(d.toLowerCase().replace(/[\\/]$/, '') + '\\'));
  const newFolders = folders.filter((f) => !inLib(f));
  const m = openModal(`<div class="modal-head"><div class="heading">${tracksWord(tracks.length)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="drop-list">${tracks.slice(0, 6).map((t) => `<div class="drop-row"><div class="r-cover">${coverHtml(t.cover)}</div><div class="grow"><div class="r-title">${esc(t.title)}</div><div class="r-sub">${esc(t.artist || UNKNOWN_ARTIST)}</div></div><span class="time">${fmt(t.duration)}</span></div>`).join('')}
      ${tracks.length > 6 ? `<div class="caption" style="padding:6px 4px">и ещё ${tracks.length - 6}</div>` : ''}</div>
    <div class="modal-foot">
      ${newFolders.length ? `<button class="btn" id="dr-add">${I.folder}Добавить ${newFolders.length > 1 ? 'папки' : 'папку'} в медиатеку</button>` : ''}
      <button class="btn" id="dr-queue">${I.queue}В очередь</button>
      <button class="btn primary" id="dr-play">${I.play}Играть</button>
    </div>`);
  $('#dr-play', m.el).onclick = () => { m.close(); playTracks(tracks, 0); };
  $('#dr-queue', m.el).onclick = () => { m.close(); addToQueue(tracks.map((t) => t.path)); };
  const add = $('#dr-add', m.el);
  if (add) add.onclick = () => {
    m.close();
    for (const f of newFolders) if (!settings.folders.includes(f)) settings.folders.push(f);
    saveSettings();
    watchFolders();
    scan();
    toast(`Добавлено в медиатеку: ${newFolders.length > 1 ? `${newFolders.length} папки` : newFolders[0]}`);
  };
}

export function initDrop() {
  if (!TAURI) return;
  const over = document.createElement('div');
  over.className = 'drop-over';
  over.innerHTML = `<div class="drop-card">${I.music}<div class="title">Отпусти, чтобы играть</div><div class="caption">Музыка, папки или плейлисты .m3u</div></div>`;
  document.body.appendChild(over);
  const ev = TAURI.event;
  ev.listen('tauri://drag-enter', () => over.classList.add('show'));
  ev.listen('tauri://drag-leave', () => over.classList.remove('show'));
  ev.listen('tauri://drag-drop', (e) => {
    over.classList.remove('show');
    handleDrop((e.payload && e.payload.paths) || []);
  });
}

// ================= Дубликаты =================

function qualityText(t) {
  const fmtName = (t.format || extOf(t.path)).toUpperCase();
  const parts = [fmtName];
  if (t.bit_depth && t.sample_rate) parts.push(`${t.bit_depth} бит / ${(t.sample_rate / 1000).toFixed(1).replace('.0', '')} кГц`);
  else if (t.bitrate) parts.push(`${t.bitrate} кбит/с`);
  if (t.size) parts.push(`${(t.size / 1048576).toFixed(1)} МБ`);
  return parts.join(' · ');
}

export function renderDupes(c) {
  const groups = findDuplicates(S.tracks);
  const extra = groups.reduce((n, g) => n + g.length - 1, 0);
  c.innerHTML = viewHead({
    title: 'Дубликаты', noCover: true, actions: false,
    metaText: groups.length ? `${groups.length} ${groups.length === 1 ? 'трек' : 'треков'} в нескольких копиях · лишних файлов: ${extra}` : 'Повторов не нашлось',
  }) + (groups.length ? `<div class="caption dupe-hint">Одинаковыми считаются треки с тем же названием, первым исполнителем и длительностью ±3 с. Сверху — копия лучшего качества. При удалении копии её прослушивания, оценки и места в плейлистах переходят к лучшей. Файлы уходят в корзину Windows.</div>
    <div class="dupes">${groups.map((g, gi) => `<div class="dupe-group">
      ${g.map((t, i) => `<div class="dupe-row${i === 0 ? ' best' : ''}">
        <div class="r-cover">${coverHtml(t.cover)}</div>
        <div class="grow"><div class="r-title">${esc(t.title)} <span class="muted">— ${esc(t.artist || UNKNOWN_ARTIST)}</span>${i === 0 ? ' <span class="dupe-badge">лучшее качество</span>' : ''}</div>
          <div class="r-sub">${esc(qualityText(t))} · ${fmt(t.duration)}</div><div class="caption dupe-path">${esc(t.path)}</div></div>
        <button class="icon-btn" data-dupe="play" data-g="${gi}" data-i="${i}" title="Слушать">${I.play}</button>
        <button class="icon-btn" data-dupe="reveal" data-g="${gi}" data-i="${i}" title="Показать в папке">${I.folder}</button>
        ${i > 0 ? `<button class="icon-btn danger" data-dupe="trash" data-g="${gi}" data-i="${i}" title="В корзину">${I.trash}</button>` : '<span class="dupe-spacer"></span>'}
      </div>`).join('')}</div>`).join('')}</div>` : emptyHtml('check', 'Дубликатов нет', 'Каждый трек в медиатеке в одном экземпляре.'));
  c.onclick = async (e) => {
    const b = e.target.closest('[data-dupe]');
    if (!b) return;
    const g = groups[+b.dataset.g], t = g[+b.dataset.i];
    if (b.dataset.dupe === 'play') playTracks([t], 0);
    else if (b.dataset.dupe === 'reveal') invoke('reveal', { path: t.path });
    else if (b.dataset.dupe === 'trash') {
      if (!(await confirmModal('Удалить копию?', `Файл <b>${esc(t.path)}</b> уйдёт в корзину Windows. Прослушивания, оценки и плейлисты перейдут к копии лучшего качества.`))) return;
      try {
        applyRelinks([{ from: t.path, to: g[0].path }]);
        await invoke('trash_file', { path: t.path });
        S.tracks = S.tracks.filter((x) => x.path !== t.path);
        toast('Копия отправлена в корзину');
        scan(true);
        render($('#content').scrollTop);
      } catch (err) { toast(`Не удалось удалить: ${err}`, 5000); }
    }
  };
}

// ================= Итоги года =================

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString(LOCALE, { month: 'short' }).replace('.', ''));
const plural = pluralWord;

export function renderWrapped(c, yearParam) {
  const years = historyYears(meta.history);
  if (!years.length) {
    c.innerHTML = viewHead({ title: 'Итоги года', noCover: true, actions: false }) + emptyHtml('stats', 'Пока нечего подводить', 'Итоги появятся, когда наберётся история прослушиваний.');
    return;
  }
  const year = years.includes(+yearParam) ? +yearParam : years[0];
  const w = computeWrapped(meta.history, S.byPath, year);
  const trackOf = (p) => S.byPath.get(p);
  const maxM = Math.max(1, ...w.months), maxH = Math.max(1, ...w.hours);
  const hours = Math.floor(w.minutes / 60);
  const firstT = w.first && trackOf(w.first.p);
  const albumCover = (a) => { const al = S.albums.find((x) => x.name === a.album && (x.artist === a.artist)); return al ? al.cover : null; };
  c.innerHTML = viewHead({ title: `Итоги ${year}`, noCover: true, actions: false,
    extra: years.length > 1 ? `<div class="chips">${years.map((y) => `<button class="chip${y === year ? ' on' : ''}" data-go="wrapped" data-key="${y}">${y}</button>`).join('')}</div>` : '' })
    + `<div class="wr">
      <div class="wr-hero">
        <div class="wr-big">${w.minutes.toLocaleString(LOCALE)}</div>
        <div class="wr-label">${plural(w.minutes, 'минута', 'минуты', 'минут')} музыки${hours >= 2 ? ` — это ${hours} ${plural(hours, 'час', 'часа', 'часов')}` : ''}</div>
      </div>
      <div class="stat-cards">
        <div class="stat"><div class="overline">Прослушиваний</div><div class="v">${w.plays}</div></div>
        <div class="stat"><div class="overline">Разных треков</div><div class="v">${w.uniqueTracks}</div></div>
        <div class="stat"><div class="overline">Исполнителей</div><div class="v">${w.uniqueArtists}</div></div>
        <div class="stat"><div class="overline">Дней с музыкой</div><div class="v">${w.days}</div></div>
        <div class="stat"><div class="overline">Серия подряд</div><div class="v">${w.streak} ${plural(w.streak, 'день', 'дня', 'дней')}</div></div>
        ${w.topGenre ? `<div class="stat"><div class="overline">Любимый жанр</div><div class="v wr-small">${esc(w.topGenre[0])}</div></div>` : ''}
      </div>
      <div class="wr-cols">
        <div><div class="section-title heading">Треки года</div>
          ${w.topTracks.map(([p, n], i) => { const t = trackOf(p); return t ? `<div class="wr-row" data-wr-play="${esc(p)}"><span class="wr-n">${i + 1}</span><div class="r-cover">${coverHtml(t.cover)}</div><div class="grow"><div class="r-title">${esc(t.title)}</div><div class="r-sub">${esc(t.artist || UNKNOWN_ARTIST)}</div></div><span class="caption">${n}</span></div>` : ''; }).join('')}</div>
        <div><div class="section-title heading">Исполнители года</div>
          ${w.topArtists.map(([a, n], i) => `<div class="wr-row" data-go="artist" data-key="${esc(a)}"><span class="wr-n">${i + 1}</span><div class="grow"><div class="r-title">${esc(a || UNKNOWN_ARTIST)}</div></div><span class="caption">${n}</span></div>`).join('')}</div>
      </div>
      ${w.topAlbums.length ? `<div class="section-title heading">Альбомы года</div><div class="wr-albums">${w.topAlbums.map((a) => `<div class="wr-album"><div class="card-art">${coverHtml(albumCover(a))}</div><div class="r-title">${esc(a.album)}</div><div class="r-sub">${esc(a.artist || UNKNOWN_ARTIST)} · ${a.plays}</div></div>`).join('')}</div>` : ''}
      <div class="wr-cols">
        <div><div class="section-title heading">По месяцам</div><div class="wr-bars">${w.months.map((m, i) => `<div class="wr-bar" title="${m} мин"><div style="height:${(m / maxM) * 100}%"></div><span>${MONTHS[i]}</span></div>`).join('')}</div></div>
        <div><div class="section-title heading">По времени суток</div><div class="wr-bars hours">${w.hours.map((h, i) => `<div class="wr-bar" title="${i}:00 — ${h}"><div style="height:${(h / maxH) * 100}%"></div><span>${i % 6 === 0 ? i : ''}</span></div>`).join('')}</div>
          <div class="caption" style="margin-top:8px">Чаще всего слушаешь около ${w.peakHour}:00</div></div>
      </div>
      <div class="wr-facts">
        ${firstT ? `<div class="wr-fact"><div class="overline">Первый трек года</div><div class="r-title">${esc(firstT.title)}</div><div class="r-sub">${esc(firstT.artist || UNKNOWN_ARTIST)} · ${new Date(w.first.t * 1000).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })}</div></div>` : ''}
        ${w.discovery ? `<div class="wr-fact"><div class="overline">Открытие года</div><div class="r-title">${esc(w.discovery[0])}</div><div class="r-sub">${w.discovery[1]} ${plural(w.discovery[1], 'прослушивание', 'прослушивания', 'прослушиваний')}</div></div>` : ''}
      </div>
      <div class="actions" style="margin-top:22px"><button class="btn primary" id="wr-play">${I.play}Слушать треки года</button></div>
    </div>`;
  const top = [...new Map(meta.history.filter((h) => new Date(h.t * 1000).getFullYear() === year).map((h) => [h.p, 0])).keys()];
  const counts = new Map();
  for (const h of meta.history) if (new Date(h.t * 1000).getFullYear() === year) counts.set(h.p, (counts.get(h.p) || 0) + 1);
  const yearList = top.map(trackOf).filter(Boolean).sort((a, b) => counts.get(b.path) - counts.get(a.path)).slice(0, 100);
  $('#wr-play').onclick = () => playTracks(yearList, 0);
  c.onclick = (e) => {
    const r = e.target.closest('[data-wr-play]');
    if (r) { const i = yearList.findIndex((t) => t.path === r.dataset.wrPlay); playTracks(yearList, Math.max(0, i)); }
  };
}
