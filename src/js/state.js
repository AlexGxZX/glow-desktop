// Glow для ПК — state.js (часть интерфейса, вынесена из main.js).

import { t as tl } from './i18n.js';
import { STYLES } from './theme.js';
import { Engine } from './audio.js';
import { Visuals } from './visuals.js';
import { Ambient } from './ambient.js';
import { rememberKnown } from './features.js';
import { watchFolders } from './library.js';
import { saveResume } from './player.js';
import { sel } from './settings.js';
import { folderCovers } from './ui.js';
import { $, UNKNOWN_ARTIST, baseName, coll, fileSrc, norm } from './util.js';

// ================= Хранилище =================

export const LS = {
  get(k, d) { try { const v = localStorage.getItem('glow.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('glow.' + k, JSON.stringify(v)); } catch (e) { console.warn('save', k, e); } },
};

export const DEFAULTS = {
  folders: [], excluded: [], scanOnStart: true,
  style: 'aura', accentMode: 'cover', customAccent: '#7c5cff', glow: 0.75, animations: true,
  contrast: 'standard', md3Dynamic: false, md3Seed: '#6750a4', appIcon: 'glow',
  md3Variant: 'tonal', md3Mode: 'dark', glassBlur: 30, glassAlpha: 0.14, glassTint: false, glassLens: false,
  crossfade: 0, lyricsFolder: '', rgAuto: true, closeToTray: false, globalHotkeys: true, mediaKeys: false, watchFolders: true, autoUpdate: true, lang: 'auto', scene: 'auto',
  offline: false, onlineLyrics: true, lfmSession: '', lfmUser: '', lbToken: '', lbUser: '', discord: false, discordCover: true,
  backdrop: 'glow', coverMotion: 'beat', particles: true, partPreset: 'style', quality: 'medium', visualProfiles: [], karaoke: true, todOn: false, todFrom: 22, todTo: 7, todStyle: 'aura', partCount: 1, beatSens: 0.3, coverStrength: 0.5, ringStrength: 0.5, nowBg: 'cover', beatDelay: 0, nowSide: 'lyrics',
  autoContinue: true, gapless: true, replayGain: 'track', rgPreamp: 0, resume: true,
  volume: 0.8, muted: false, sort: 'title',
  eq: { enabled: true, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, balance: 0, limiter: true, preset: 'flat' },
  customPresets: [],
  sidebar: null,
};
export const settings = Object.assign({}, DEFAULTS, LS.get('settings', {}));
settings.eq = Object.assign({}, DEFAULTS.eq, settings.eq || {});

export const meta = Object.assign(
  { favorites: [], ratings: {}, plays: {}, last: {}, history: [], playlists: [], lyrics: {}, lrcFiles: {}, listenSec: 0, folderCovers: {}, known: {}, rgCalc: {}, smartLists: [] },
  LS.get('meta', {}),
);
export const favs = new Set(meta.favorites);

export let saveSetT, saveMetaT;
export function saveSettings() {
  clearTimeout(saveSetT);
  // Пока открыт редактор, в настройках временный стиль «__edit» — сохраняем прежний.
  saveSetT = setTimeout(() => LS.set('settings', { ...settings, style: settings.style === '__edit' && editor ? editor.prevStyle : settings.style }), 200);
}
export let editor = null;
export function setEditor(e) { editor = e; }

/** Сохранить настройки, метаданные и очередь сразу, без задержки. */
export function flushNow() {
  clearTimeout(saveSetT); clearTimeout(saveMetaT);
  LS.set('settings', { ...settings, style: settings.style === '__edit' && editor ? editor.prevStyle : settings.style });
  meta.favorites = [...favs];
  rememberKnown(false);
  LS.set('meta', meta);
  saveResume();
}

/** Настройки экрана плеера: у своего стиля они свои, иначе — общие. */
export function vis() {
  const st = STYLES[settings.style];
  if (st && st.user && st.player) return st.player;
  return { backdrop: settings.backdrop, motion: settings.coverMotion, particles: settings.particles };
}
export function saveMeta() {
  clearTimeout(saveMetaT);
  saveMetaT = setTimeout(() => { meta.favorites = [...favs]; rememberKnown(false); LS.set('meta', meta); }, 400);
}

// ================= Состояние =================

export const S = {
  tracks: [], byPath: new Map(), albums: [], albumByKey: new Map(), artists: [], artistByName: new Map(),
  genres: [], folders: [],
  queue: [], qi: -1, orig: null, shuffle: false, repeat: 'off',
  view: { name: 'tracks', param: null }, back: [], viewList: [], viewCtx: {}, vl: null, sel: -1,
  palette: null, theme: null,
  lyrics: null, lyricsFor: null, lyIdx: -1,
  sleep: null, scanning: false,
  listened: 0, counted: false, lastTime: 0, errors: 0,
  nowOpen: false, queueOpen: false, mini: false,
  external: new Map(), // треки, перетащенные в окно не из медиатеки
};

export const engine = new Engine(fileSrc);
export const visuals = new Visuals($('#fx'), engine);
export const ambient = new Ambient($('#bg-fx'), engine);

export const track = (i) => {
  const p = S.queue[i];
  if (!p) return null;
  return S.byPath.get(p) || stub(p);
};
export const curTrack = () => track(S.qi);
export const stub = (p) => ({ path: p, title: baseName(p), artist: tl('Файл не найден'), album: '', duration: 0, missing: true });

// ================= Медиатека =================

export function setLibrary(tracks) {
  S.tracks = tracks;
  S.byPath = new Map(tracks.map((t) => [t.path, t]));
  for (const [p, t] of S.external) if (!S.byPath.has(p)) S.byPath.set(p, t);
  // Посчитанная громкость для файлов без тегов ReplayGain.
  for (const t of tracks) if (!t.rg_track && !t.rg_album && meta.rgCalc[t.path] !== undefined) t.rg_track = `${meta.rgCalc[t.path]} dB`;
  rememberKnown();
  const albums = new Map(), artists = new Map(), genres = new Map(), folders = new Map();
  for (const t of tracks) {
    t._s = norm(`${t.title} ${t.artist} ${t.album} ${t.album_artist}`);
    const aa = t.album_artist || t.artist || UNKNOWN_ARTIST;
    const name = t.album || 'Без альбома';
    const key = norm(`${name}\u0001${t.album ? aa : t.folder}`);
    let a = albums.get(key);
    if (!a) { a = { key, name, artist: aa, year: t.year, cover: t.cover, tracks: [], added: 0 }; albums.set(key, a); }
    a.tracks.push(t);
    if (!a.cover && t.cover) a.cover = t.cover;
    if (!a.year && t.year) a.year = t.year;
    a.added = Math.max(a.added, t.added || 0);
    t._album = key;

    const ar = t.artist || UNKNOWN_ARTIST;
    let r = artists.get(ar);
    if (!r) { r = { name: ar, tracks: [], albums: new Set(), cover: null }; artists.set(ar, r); }
    r.tracks.push(t); r.albums.add(key);
    if (!r.cover && t.cover) r.cover = t.cover;
    if (aa !== ar) {
      let r2 = artists.get(aa);
      if (!r2) { r2 = { name: aa, tracks: [], albums: new Set(), cover: null }; artists.set(aa, r2); }
      r2.albums.add(key);
      if (!r2.cover && t.cover) r2.cover = t.cover;
    }

    const g = t.genre || '';
    if (g) { if (!genres.has(g)) genres.set(g, []); genres.get(g).push(t); }
    if (!folders.has(t.folder)) folders.set(t.folder, []);
    folders.get(t.folder).push(t);
  }
  const byTrackNo = (x, y) => (x.disc_no || 0) - (y.disc_no || 0) || (x.track_no || 0) - (y.track_no || 0) || coll.compare(x.title, y.title);
  for (const a of albums.values()) a.tracks.sort(byTrackNo);
  S.albums = [...albums.values()].sort((x, y) => coll.compare(x.name, y.name));
  S.albumByKey = albums;
  for (const r of artists.values()) r.tracks.sort((x, y) => coll.compare(x.album, y.album) || byTrackNo(x, y));
  S.artists = [...artists.values()].filter((r) => r.tracks.length || r.albums.size).sort((x, y) => coll.compare(x.name, y.name));
  S.artistByName = artists;
  S.genres = [...genres.entries()].map(([name, list]) => ({ name, tracks: list })).sort((x, y) => coll.compare(x.name, y.name));
  S.folders = [...folders.entries()].map(([path, list]) => ({ path, tracks: list.sort(byTrackNo) })).sort((x, y) => coll.compare(x.path, y.path));
}

export const SORTS = {
  title: 'По названию', artist: 'По исполнителю', album: 'По альбому', added: 'Недавно добавленные',
  duration: 'По длительности', plays: 'По прослушиваниям', rating: 'По оценке',
};
export function sortTracks(list, key) {
  const a = list.slice();
  const by = {
    title: (x, y) => coll.compare(x.title, y.title),
    artist: (x, y) => coll.compare(x.artist, y.artist) || coll.compare(x.album, y.album) || (x.track_no - y.track_no),
    album: (x, y) => coll.compare(x.album, y.album) || (x.disc_no - y.disc_no) || (x.track_no - y.track_no),
    added: (x, y) => (y.added || 0) - (x.added || 0),
    duration: (x, y) => (y.duration || 0) - (x.duration || 0),
    plays: (x, y) => (meta.plays[y.path] || 0) - (meta.plays[x.path] || 0),
    rating: (x, y) => (meta.ratings[y.path] || 0) - (meta.ratings[x.path] || 0) || coll.compare(x.title, y.title),
  }[key] || ((x, y) => coll.compare(x.title, y.title));
  return a.sort(by);
}

