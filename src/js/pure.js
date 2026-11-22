// Glow для ПК — чистые функции без DOM и Tauri: плейлисты .m3u, дубликаты, «Итоги года».
// Их проверяют юнит-тесты (tests/unit/pure.test.js).

const fold = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').normalize('NFKC');
/** Название или исполнитель для сравнения: без регистра, скобок «(Remastered)», лишних знаков. */
export const normTitle = (s) => fold(s).replace(/\s*[([][^)\]]*(remaster|version|edit|mix|live|mono|stereo|deluxe|bonus|explicit)[^)\]]*[)\]]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Первый исполнитель: «A feat. B», «A, B», «A/B», «A; B», «A & B» → «a». */
export const firstArtist = (s) => normTitle(String(s || '').split(/\s*(?:[,;/&×]|\bfeat\.?|\bft\.?|\bvs\.?|\bx\b)\s*/i)[0]);

// ================= .m3u =================

/** Текст .m3u8 для списка треков. Пути абсолютные — так плейлист откроют и другие плееры. */
export function buildM3u(tracks) {
  const lines = ['#EXTM3U'];
  for (const t of tracks) {
    if (!t || !t.path) continue;
    lines.push(`#EXTINF:${Math.round(t.duration || 0)},${t.artist ? `${t.artist} - ` : ''}${t.title || ''}`);
    lines.push(t.path);
  }
  return lines.join('\r\n') + '\r\n';
}

const isAbs = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/');

/** Склеить папку плейлиста и относительный путь, убрать «.» и «..». */
export function joinPath(dir, rel) {
  const sep = dir.includes('\\') || /^[a-zA-Z]:/.test(dir) ? '\\' : '/';
  const parts = `${dir}${sep}${rel}`.split(/[\\/]+/);
  const out = [];
  for (const p of parts) {
    if (p === '.' || p === '') { if (!out.length) out.push(p); continue; }
    if (p === '..') { if (out.length > 1) out.pop(); continue; }
    out.push(p);
  }
  return out.join(sep);
}

/**
 * Разобрать .m3u / .m3u8. Возвращает записи { path, title, artist, duration }.
 * base — папка, где лежит плейлист (для относительных путей).
 */
export function parseM3u(text, base = '') {
  const out = [];
  let info = null;
  for (let line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const m = /^#EXTINF:\s*(-?\d+(?:\.\d+)?)[^,]*,(.*)$/.exec(line);
      if (m) {
        const name = m[2].trim();
        const dash = name.indexOf(' - ');
        info = { duration: Math.max(0, parseFloat(m[1]) || 0), artist: dash > 0 ? name.slice(0, dash).trim() : '', title: dash > 0 ? name.slice(dash + 3).trim() : name };
      }
      continue;
    }
    if (line.startsWith('#')) continue;
    let p = line;
    if (/^file:\/\//i.test(p)) p = decodeURIComponent(p.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
    if (/^[a-z]+:\/\//i.test(p)) { info = null; continue; } // интернет-радио и ссылки пропускаем
    if (!isAbs(p) && base) p = joinPath(base, p);
    out.push({ path: p, title: info ? info.title : '', artist: info ? info.artist : '', duration: info ? info.duration : 0 });
    info = null;
  }
  return out;
}

/**
 * Найти треки медиатеки для записей плейлиста: точный путь → путь без учёта регистра →
 * имя файла (если оно одно такое) → «исполнитель - название» с длительностью.
 */
export function matchM3u(entries, tracks) {
  const byLower = new Map(), byName = new Map(), byKey = new Map();
  const fname = (p) => p.split(/[\\/]/).pop().toLowerCase();
  for (const t of tracks) {
    byLower.set(t.path.toLowerCase().replace(/\//g, '\\'), t);
    const n = fname(t.path);
    byName.set(n, byName.has(n) ? null : t);
    const k = `${firstArtist(t.artist)}|${normTitle(t.title)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  }
  const found = [], missing = [];
  for (const e of entries) {
    let t = byLower.get(e.path.toLowerCase().replace(/\//g, '\\')) || byName.get(fname(e.path)) || null;
    if (!t && e.title) {
      const c = byKey.get(`${firstArtist(e.artist)}|${normTitle(e.title)}`) || [];
      t = c.find((x) => !e.duration || Math.abs((x.duration || 0) - e.duration) <= 3) || null;
    }
    if (t) found.push(t); else missing.push(e);
  }
  return { found, missing };
}

// ================= Дубликаты =================

const LOSSLESS = new Set(['flac', 'wav', 'alac', 'ape', 'wv', 'aiff', 'aif']);

/** Чем больше, тем лучше качество файла. */
export function qualityScore(t) {
  const fmt = String(t.format || t.path.split('.').pop() || '').toLowerCase();
  const lossless = LOSSLESS.has(fmt) || (fmt === 'm4a' && (t.bit_depth || 0) > 0);
  return (lossless ? 1e7 : 0) + (t.bit_depth || 0) * 1e5 + Math.min(t.sample_rate || 0, 192000) / 10 + (t.bitrate || 0) + (t.size || 0) / 1e9;
}

/**
 * Группы одинаковых треков: одно название, тот же первый исполнитель, длительность ±3 с.
 * Внутри группы файлы отсортированы от лучшего качества к худшему.
 */
export function findDuplicates(tracks) {
  const byKey = new Map();
  for (const t of tracks) {
    if (t.missing || !t.title) continue;
    const k = `${firstArtist(t.artist)}|${normTitle(t.title)}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
  }
  const groups = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    let cur = [list[0]];
    const flush = () => { if (cur.length > 1) groups.push(cur.sort((a, b) => qualityScore(b) - qualityScore(a))); };
    for (let i = 1; i < list.length; i++) {
      if (Math.abs((list[i].duration || 0) - (cur[cur.length - 1].duration || 0)) <= 3) cur.push(list[i]);
      else { flush(); cur = [list[i]]; }
    }
    flush();
  }
  return groups.sort((a, b) => (a[0].artist || '').localeCompare(b[0].artist || '') || (a[0].title || '').localeCompare(b[0].title || ''));
}

// ================= Итоги года =================

/** Годы, за которые есть прослушивания (новые первыми). history: [{ p, t }] с секундами. */
export function historyYears(history) {
  const ys = new Set();
  for (const h of history) ys.add(new Date(h.t * 1000).getFullYear());
  return [...ys].sort((a, b) => b - a);
}

/**
 * Итоги года по истории прослушиваний.
 * byPath — Map путь → трек (для длительности, исполнителя, альбома, жанра).
 */
export function computeWrapped(history, byPath, year) {
  const list = history.filter((h) => new Date(h.t * 1000).getFullYear() === year).sort((a, b) => a.t - b.t);
  const count = (map, key, n = 1) => { if (key) map.set(key, (map.get(key) || 0) + n); };
  const tracks = new Map(), artists = new Map(), albums = new Map(), genres = new Map(), artistFirst = new Map();
  const months = new Array(12).fill(0), hours = new Array(24).fill(0), days = new Set();
  let seconds = 0;
  for (const h of list) {
    const d = new Date(h.t * 1000);
    const t = byPath.get(h.p);
    const dur = t ? Math.min(t.duration || 0, 20 * 60) : 0;
    seconds += dur;
    months[d.getMonth()] += dur / 60;
    hours[d.getHours()] += 1;
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    count(tracks, h.p);
    if (!t) continue;
    const artist = t.artist || '';
    count(artists, artist);
    if (artist && !artistFirst.has(artist)) artistFirst.set(artist, h.t);
    if (t.album) count(albums, `${t.album_artist || artist}\u0001${t.album}`);
    count(genres, t.genre);
  }
  // Самая длинная серия дней подряд с музыкой.
  const dayNums = [...days].map((s) => { const [y, m, dd] = s.split('-').map(Number); return Math.round(new Date(y, m, dd).getTime() / 86400000); }).sort((a, b) => a - b);
  let streak = dayNums.length ? 1 : 0, run = 1;
  for (let i = 1; i < dayNums.length; i++) { run = dayNums[i] === dayNums[i - 1] + 1 ? run + 1 : 1; streak = Math.max(streak, run); }
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  // «Открытие года» — исполнитель, которого до этого года не слушали, с наибольшим числом прослушиваний.
  const before = new Set(history.filter((h) => h.t < new Date(year, 0, 1).getTime() / 1000).map((h) => (byPath.get(h.p) || {}).artist).filter(Boolean));
  const discovery = top(new Map([...artists].filter(([a]) => a && !before.has(a))), 1)[0] || null;
  return {
    year,
    plays: list.length,
    minutes: Math.round(seconds / 60),
    uniqueTracks: tracks.size,
    uniqueArtists: artists.size,
    days: days.size,
    streak,
    topTracks: top(tracks, 5),
    topArtists: top(artists, 5),
    topAlbums: top(albums, 5).map(([k, n]) => { const [artist, album] = k.split('\u0001'); return { artist, album, plays: n }; }),
    topGenre: top(genres, 1)[0] || null,
    months: months.map((m) => Math.round(m)),
    hours,
    peakHour: hours.indexOf(Math.max(...hours)),
    first: list[0] || null,
    discovery,
  };
}
