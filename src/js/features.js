// Glow для ПК — features.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { openModal } from './dialogs.js';
import { row } from './settings.js';
import { renderSidebar } from './sidebar.js';
import { S, curTrack, engine, favs, meta, saveMeta, settings } from './state.js';
import { $, UNKNOWN_ARTIST, baseName, esc, fileSrc, invoke, norm, toast, tracksWord } from './util.js';
import { render } from './views.js';

// ================= Пропавшие треки =================

export const trackKey = (t) => norm(`${t.artist || ''}|${t.title || ''}`).replace(/\s+/g, ' ').trim();

/** Все пути, на которые ссылаются плейлисты, избранное, оценки, история и тексты. */
export function referencedPaths() {
  const r = new Set([...favs, ...Object.keys(meta.ratings), ...Object.keys(meta.plays), ...Object.keys(meta.lrcFiles || {}), ...Object.keys(meta.lyrics || {})]);
  for (const p of meta.playlists) for (const x of p.tracks) r.add(x);
  return r;
}

/** Запоминаем, что за трек лежал по каждому нужному пути, — чтобы найти его, если файл переедет. */
export function rememberKnown(save = true) {
  if (!S.tracks.length) return;
  const refs = referencedPaths();
  const known = meta.known || {};
  let changed = false;
  for (const p of refs) {
    const t = S.byPath.get(p);
    if (t && (!known[p] || known[p].title !== t.title)) { known[p] = { title: t.title, artist: t.artist, duration: Math.round(t.duration || 0) }; changed = true; }
  }
  for (const p of Object.keys(known)) if (!refs.has(p)) { delete known[p]; changed = true; }
  meta.known = known;
  if (changed && save) saveMeta();
}

export function findRelinks() {
  const refs = [...referencedPaths()].filter((p) => !S.byPath.has(p));
  if (!refs.length) return { pairs: [], lost: 0 };
  const byKey = new Map(), byName = new Map();
  for (const t of S.tracks) {
    const k = trackKey(t);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(t);
    const n = baseName(t.path).toLowerCase();
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(t);
  }
  const taken = referencedPaths();
  const pairs = [];
  for (const p of refs) {
    const info = meta.known && meta.known[p];
    let cands = info ? byKey.get(trackKey(info)) || [] : [];
    if (info && info.duration) cands = cands.filter((t) => Math.abs((t.duration || 0) - info.duration) <= 3);
    if (!cands.length && !info) {
      // Запасной путь — по имени файла, только если оно говорящее и такое в медиатеке одно.
      const stem = baseName(p);
      const byN = byName.get(baseName(p).toLowerCase()) || [];
      if (stem.length >= 6 && !/^[\d\s._-]+$/.test(stem) && byN.length === 1) cands = byN;
    }
    const t = cands.find((x) => !taken.has(x.path));
    if (t) { pairs.push({ from: p, to: t.path, title: t.title, artist: t.artist }); taken.add(t.path); }
  }
  return { pairs, lost: refs.length - pairs.length };
}

export function applyRelinks(pairs) {
  const m = new Map(pairs.map((x) => [x.from, x.to]));
  const mv = (p) => m.get(p) || p;
  const nf = [...favs].map(mv); favs.clear(); nf.forEach((p) => favs.add(p));
  for (const key of ['ratings', 'plays', 'last', 'lyrics', 'lrcFiles', 'rgCalc', 'known']) {
    const o = meta[key] || {};
    for (const [from, to] of m) if (o[from] !== undefined) { o[to] = o[from]; delete o[from]; }
  }
  for (const h of meta.history) h.p = mv(h.p);
  for (const p of meta.playlists) p.tracks = p.tracks.map(mv);
  S.queue = S.queue.map(mv);
  saveMeta();
}

export function relinkDialog(manual = false) {
  const { pairs, lost } = findRelinks();
  if (!pairs.length) {
    if (manual) toast(lost ? `Пропавших треков: ${lost}, но новых файлов для них не нашлось` : 'Пропавших треков нет');
    return;
  }
  const sig = pairs.map((x) => x.from).sort().join('|');
  if (!manual && meta.relinkSkip === sig) return;
  const rows = pairs.map((x, i) => `<label class="rl-row"><input type="checkbox" data-rl="${i}" checked>
    <div><div class="body-strong">${esc(x.title)} <span class="muted">— ${esc(x.artist || UNKNOWN_ARTIST)}</span></div>
    <div class="caption rl-path">${esc(x.from)}<br>→ ${esc(x.to)}</div></div></label>`).join('');
  const m = openModal(`<div class="modal-head"><div class="heading">Нашлись переехавшие треки</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="muted" style="margin-bottom:12px">Эти файлы пропали со старого места, но в медиатеке есть такие же треки по новому пути. Перенести на них плейлисты, избранное, оценки, историю и тексты?${lost ? ` Ещё ${lost} пропавших найти не удалось.` : ''}</div>
    <div class="rl-list">${rows}</div>
    <div class="modal-foot"><button class="btn" id="rl-skip">Не сейчас</button><button class="btn primary" id="rl-ok">${I.check}Перенести выбранное</button></div>`, { wide: true });
  $('#rl-skip', m.el).onclick = () => { meta.relinkSkip = sig; saveMeta(); m.close(); };
  $('#rl-ok', m.el).onclick = () => {
    const chosen = pairs.filter((_, i) => $(`[data-rl="${i}"]`, m.el).checked);
    applyRelinks(chosen);
    m.close();
    render($('#content').scrollTop);
    toast(`Перенесено: ${tracksWord(chosen.length)}`);
  };
}

// ================= Тексты из папки =================

export async function indexLrcFolder() {
  if (!settings.lyricsFolder) { S.lrcIndex = null; return; }
  try {
    const list = await invoke('list_lrc', { folder: settings.lyricsFolder });
    S.lrcIndex = new Map();
    for (const p of list) S.lrcIndex.set(norm(baseName(p)).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(), p);
  } catch { S.lrcIndex = null; }
}

export function findLrcInFolder(t) {
  if (!S.lrcIndex || !S.lrcIndex.size) return null;
  const k = (x) => norm(x).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const keys = [baseName(t.path), `${t.artist} - ${t.title}`, `${t.title} - ${t.artist}`, `${t.artist} — ${t.title}`, t.title];
  for (const key of keys) { const p = S.lrcIndex.get(k(key)); if (p) return p; }
  return null;
}

// ================= Обмен с Android (.glowsync) =================

export function exportKeyMap() {
  const out = {};
  for (const t of S.tracks) out[t.path] = trackKey(t);
  return out;
}

export async function exportSync() {
  const k = exportKeyMap();
  const tracks = {};
  const keyOf = (p) => { const key = k[p]; if (key && !tracks[key]) { const t = S.byPath.get(p); tracks[key] = { title: t.title, artist: t.artist, album: t.album, duration: Math.round(t.duration || 0), file: baseName(t.path) }; } return key; };
  const mapObj = (o) => { const r = {}; for (const [p, v] of Object.entries(o || {})) { const key = keyOf(p); if (key) r[key] = v; } return r; };
  const doc = {
    format: 'glowsync', version: 1, from: 'Glow для ПК', exported: new Date().toISOString(),
    favorites: [...favs].map(keyOf).filter(Boolean),
    ratings: mapObj(meta.ratings), plays: mapObj(meta.plays), last: mapObj(meta.last),
    history: meta.history.slice(-3000).map((h) => ({ k: keyOf(h.p), t: h.t })).filter((h) => h.k),
    playlists: meta.playlists.map((p) => ({ name: p.name, tracks: p.tracks.map(keyOf).filter(Boolean) })),
    tracks,
  };
  try {
    const ok = await invoke('save_file', { name: `Glow-${new Date().toISOString().slice(0, 10)}.glowsync`, content: JSON.stringify(doc), ext: 'glowsync', label: 'Обмен Glow' });
    if (ok) toast('Файл обмена сохранён — открой его в Glow на телефоне');
  } catch (e) { toast(`Не удалось сохранить: ${e}`); }
}

export async function importSync() {
  try {
    const path = await invoke('pick_file', { exts: ['glowsync', 'json'], label: 'Обмен Glow' });
    if (!path) return;
    const doc = JSON.parse(await invoke('read_text', { path }));
    if (!doc || doc.format !== 'glowsync') throw new Error('Это не файл обмена Glow');
    const byKey = new Map();
    for (const t of S.tracks) { const key = trackKey(t); if (!byKey.has(key)) byKey.set(key, t.path); }
    const local = (key) => byKey.get(key);
    let matched = 0, missed = 0;
    const seen = new Set();
    const count = (key) => { if (seen.has(key)) return; seen.add(key); if (local(key)) matched++; else missed++; };
    for (const key of doc.favorites || []) { count(key); const p = local(key); if (p) favs.add(p); }
    for (const [key, v] of Object.entries(doc.ratings || {})) { count(key); const p = local(key); if (p) meta.ratings[p] = Math.max(meta.ratings[p] || 0, v); }
    for (const [key, v] of Object.entries(doc.plays || {})) { count(key); const p = local(key); if (p) meta.plays[p] = Math.max(meta.plays[p] || 0, v); }
    for (const [key, v] of Object.entries(doc.last || {})) { const p = local(key); if (p) meta.last[p] = Math.max(meta.last[p] || 0, v); }
    const have = new Set(meta.history.map((h) => `${h.p}|${h.t}`));
    for (const h of doc.history || []) { const p = local(h.k); if (p && !have.has(`${p}|${h.t}`)) meta.history.push({ p, t: h.t }); }
    meta.history.sort((a, b) => a.t - b.t);
    if (meta.history.length > 5000) meta.history.splice(0, meta.history.length - 5000);
    let plNew = 0;
    for (const pl of doc.playlists || []) {
      const paths = (pl.tracks || []).map(local).filter(Boolean);
      let mine = meta.playlists.find((x) => x.name === pl.name);
      if (!mine) { mine = { id: 'p' + Date.now().toString(36) + plNew, name: pl.name, tracks: [], created: Date.now() }; meta.playlists.push(mine); plNew++; }
      const hs = new Set(mine.tracks);
      for (const p of paths) if (!hs.has(p)) { mine.tracks.push(p); hs.add(p); }
    }
    saveMeta();
    renderSidebar();
    render($('#content').scrollTop);
    toast(`Импортировано. Совпало треков: ${matched}${missed ? `, не нашлось на ПК: ${missed}` : ''}${plNew ? `, новых плейлистов: ${plNew}` : ''}`, 6000);
  } catch (e) { toast(`Не удалось импортировать: ${e.message || e}`, 5000); }
}

// ================= Громкость (ReplayGain) для файлов без тегов =================

/** Громкость по EBU R128 (K-фильтр, стробирование −70 и −10 LU) → поправка до −18 LUFS. */
export async function measureLoudness(path) {
  const data = await (await fetch(fileSrc(path))).arrayBuffer();
  const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
  const sr = audio.sampleRate;
  const oc = new OfflineAudioContext(audio.numberOfChannels, audio.length, sr);
  const src = oc.createBufferSource();
  src.buffer = audio;
  const shelf = oc.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 1500; shelf.gain.value = 4;
  const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.5;
  src.connect(shelf).connect(hp).connect(oc.destination);
  src.start();
  const out = await oc.startRendering();
  const ch = [];
  for (let c = 0; c < out.numberOfChannels; c++) ch.push(out.getChannelData(c));
  const block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  const ms = [];
  for (let i = 0; i + block <= out.length; i += hop) {
    let sum = 0;
    for (const d of ch) for (let j = i; j < i + block; j += 2) sum += d[j] * d[j];
    ms.push(sum / (block / 2));
  }
  const L = (x) => -0.691 + 10 * Math.log10(x || 1e-12);
  const abs = ms.filter((x) => L(x) > -70);
  if (!abs.length) return null;
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const gated = abs.filter((x) => L(x) > rel);
  const lufs = L(gated.reduce((a, b) => a + b, 0) / gated.length);
  return Math.round((-18 - lufs) * 100) / 100;
}

export async function measureTrack(t) {
  if (!t || meta.rgCalc[t.path] !== undefined || t.rg_track || t.rg_album) return;
  try {
    const db = await measureLoudness(t.path);
    if (db === null) return;
    meta.rgCalc[t.path] = db;
    t.rg_track = `${db} dB`;
    saveMeta();
    if (curTrack() && curTrack().path === t.path) engine.setReplayGain(settings.replayGain, settings.rgPreamp || 0);
  } catch (e) { console.warn('loudness', t.path, e); }
}

export async function rgScanAll() {
  if (S.rgScan) { S.rgScan.stop = true; return; }
  const todo = S.tracks.filter((t) => !t.rg_track && !t.rg_album && meta.rgCalc[t.path] === undefined);
  if (!todo.length) { toast('У всех треков громкость уже известна'); return; }
  S.rgScan = { stop: false };
  render($('#content').scrollTop);
  let n = 0;
  for (const t of todo) {
    if (S.rgScan.stop) break;
    toast(`Считаю громкость: ${++n} / ${todo.length} · ${t.title}`, 60000);
    await measureTrack(t);
    await new Promise((r) => setTimeout(r, 30));
  }
  toast(S.rgScan.stop ? `Остановлено. Посчитано: ${n - 1}` : `Готово: громкость посчитана для ${tracksWord(n)}`);
  S.rgScan = null;
  if (S.view.name === 'settings') render($('#content').scrollTop);
}

