// Glow для ПК — player.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { parseLrc, lineAt } from './lyrics.js';
import { findLrcInFolder, measureTrack } from './features.js';
import { fetchOnlineLyrics, onlineSeeked, onlineStateChanged, onlineTrackChanged, scrobbleTick } from './online.js';
import { updateMediaSession } from './main.js';
import { LS, S, curTrack, engine, favs, meta, saveMeta, saveSettings, settings, track, vis, visuals } from './state.js';
import { coverHtml, isStudio, refreshTheme, starsHtml, techText } from './ui.js';
import { $, UNKNOWN_ARTIST, clamp, esc, fmt, invoke, shuffleArr, toast, tracksWord } from './util.js';

// ================= Воспроизведение =================

export function playTracks(list, index = 0, { shuffle = false } = {}) {
  const playable = list.filter((t) => !t.missing);
  if (!playable.length) return;
  const target = list[index] && !list[index].missing ? list[index] : playable[0];
  S.queue = playable.map((t) => t.path);
  S.qi = Math.max(0, S.queue.indexOf(target.path));
  S.orig = null;
  if (shuffle) S.shuffle = true;
  if (S.shuffle) shuffleQueue();
  startCurrent(true);
}

export function shuffleQueue() {
  const cur = S.queue[S.qi];
  S.orig = S.queue.slice();
  const rest = S.queue.filter((_, i) => i !== S.qi);
  S.queue = [cur, ...shuffleArr(rest)];
  S.qi = 0;
}

export function unshuffleQueue() {
  if (!S.orig) return;
  const cur = S.queue[S.qi];
  const inQueue = new Set(S.queue);
  const base = S.orig.filter((p) => inQueue.has(p));
  const baseSet = new Set(base);
  S.queue = [...base, ...S.queue.filter((p) => !baseSet.has(p))];
  S.qi = Math.max(0, S.queue.indexOf(cur));
  S.orig = null;
}

export function toggleShuffle() {
  S.shuffle = !S.shuffle;
  if (S.queue.length) { if (S.shuffle) shuffleQueue(); else unshuffleQueue(); }
  afterQueueChange();
  updateButtons();
  toast(S.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено', 1400);
}

export function cycleRepeat() {
  S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat];
  engine.setLoop(S.repeat === 'one');
  afterQueueChange();
  updateButtons();
  toast({ off: 'Повтор выключен', all: 'Повтор очереди', one: 'Повтор трека' }[S.repeat], 1400);
}

export function startCurrent(autoplay, startAt = 0) {
  const t = curTrack();
  if (!t) return;
  if (t.missing) { toast(`Файл не найден: ${t.title}`); return; }
  engine.setLoop(S.repeat === 'one');
  engine.load(t, { autoplay, startAt });
  onTrackChanged();
}

export function nextIndex() {
  if (S.qi + 1 < S.queue.length) return S.qi + 1;
  if (S.repeat === 'all' && S.queue.length) return 0;
  return -1;
}

export function prepareNext() {
  const i = nextIndex();
  const t = i >= 0 && S.repeat !== 'one' ? track(i) : null;
  engine.prepareNext(t && !t.missing ? t : null);
}

export function afterQueueChange() {
  maybeExtend();
  prepareNext();
  renderQueue();
  if (S.nowOpen && settings.nowSide !== 'lyrics') renderNowRight();
  saveResume();
}

export function onTrackChanged() {
  S.listened = 0; S.counted = false; S.lastTime = 0;
  const ct = curTrack();
  invoke('set_tray_tip', { text: ct ? `${ct.title} — ${ct.artist || UNKNOWN_ARTIST}` : 'Glow' }).catch(() => {});
  onlineTrackChanged(ct);
  if (settings.rgAuto && ct && !ct.missing && !ct.rg_track && !ct.rg_album && meta.rgCalc[ct.path] === undefined) setTimeout(() => measureTrack(ct), 2500);
  maybeExtend();
  prepareNext();
  updateNowPlaying();
  refreshTheme();
  loadLyrics();
  S.vl && S.vl.refresh();
  renderQueue();
  if (S.nowOpen) renderNowRight();
  updateMediaSession();
  saveResume();
}

export function next() {
  if (!S.queue.length) return;
  maybeExtend();
  const i = nextIndex();
  if (i < 0) { engine.stop(); updateButtons(); return; }
  S.qi = i;
  startCurrent(true);
}

export function prev() {
  if (!S.queue.length) return;
  if (engine.time > 3) { engine.seek(0); return; }
  if (S.qi > 0) S.qi--;
  else if (S.repeat === 'all') S.qi = S.queue.length - 1;
  else { engine.seek(0); return; }
  startCurrent(true);
}

export function togglePlay() {
  if (!engine.track) {
    if (S.queue.length) startCurrent(true);
    else if (S.viewList.length) playTracks(S.viewList, 0);
    else if (S.tracks.length) playTracks(S.tracks, Math.floor(Math.random() * S.tracks.length), { shuffle: true });
    return;
  }
  engine.toggle();
}

/** «Продолжать похожими»: когда очередь кончается, добавляем треки того же исполнителя, жанра и любимые. */
export function maybeExtend() {
  if (!settings.autoContinue || S.repeat !== 'off' || !S.queue.length || S.qi < S.queue.length - 1 || S.tracks.length < 2) return;
  const cur = curTrack();
  if (!cur) return;
  const inQ = new Set(S.queue);
  const pool = S.tracks.filter((t) => !inQ.has(t.path));
  if (!pool.length) return;
  const pick = (arr, n) => {
    const out = [];
    const a = arr.slice();
    while (out.length < n && a.length) {
      const total = a.reduce((s, t) => s + 1 + (meta.ratings[t.path] || 0) * 1.5 + (favs.has(t.path) ? 3 : 0), 0);
      let r = Math.random() * total, k = 0;
      for (; k < a.length; k++) { r -= 1 + (meta.ratings[a[k].path] || 0) * 1.5 + (favs.has(a[k].path) ? 3 : 0); if (r <= 0) break; }
      out.push(a.splice(Math.min(k, a.length - 1), 1)[0]);
    }
    return out;
  };
  const same = pick(pool.filter((t) => t.artist && t.artist === cur.artist), 3);
  const used = new Set(same.map((t) => t.path));
  const genre = pick(pool.filter((t) => !used.has(t.path) && cur.genre && t.genre === cur.genre), 3);
  genre.forEach((t) => used.add(t.path));
  const rest = pick(pool.filter((t) => !used.has(t.path)), 10 - same.length - genre.length);
  const add = shuffleArr([...same, ...genre, ...rest]).map((t) => t.path);
  S.queue.push(...add);
  if (S.orig) S.orig.push(...add);
}

export function playNext(paths) {
  if (!S.queue.length) { playTracks(paths.map((p) => S.byPath.get(p)).filter(Boolean), 0); return; }
  S.queue.splice(S.qi + 1, 0, ...paths);
  afterQueueChange();
  toast(paths.length > 1 ? `Следующими: ${tracksWord(paths.length)}` : 'Будет следующим');
}

export function addToQueue(paths) {
  if (!S.queue.length) { playTracks(paths.map((p) => S.byPath.get(p)).filter(Boolean), 0); return; }
  S.queue.push(...paths);
  if (S.orig) S.orig.push(...paths);
  afterQueueChange();
  toast(`В очереди: +${tracksWord(paths.length)}`);
}

export function countPlay(t) {
  if (!t || t.missing) return;
  const now = Math.floor(Date.now() / 1000);
  meta.plays[t.path] = (meta.plays[t.path] || 0) + 1;
  meta.last[t.path] = now;
  meta.history.push({ p: t.path, t: now });
  if (meta.history.length > 5000) meta.history.splice(0, meta.history.length - 5000);
  saveMeta();
}

export function toggleFav(path) {
  if (!path) return;
  if (favs.has(path)) favs.delete(path); else favs.add(path);
  saveMeta();
  updateButtons();
  S.vl && S.vl.refresh();
}

export function setRating(path, n) {
  if (!path) return;
  if ((meta.ratings[path] || 0) === n) delete meta.ratings[path];
  else meta.ratings[path] = n;
  saveMeta();
  S.vl && S.vl.refresh();
  updateStars();
}

export let lastResumeSave = 0;
export function saveResume() {
  lastResumeSave = Date.now();
  LS.set('resume', {
    queue: S.queue.slice(0, 5000), qi: S.qi, pos: engine.time, shuffle: S.shuffle, repeat: S.repeat,
    orig: S.orig ? S.orig.slice(0, 5000) : null,
  });
}

export function restoreResume() {
  const r = LS.get('resume', null);
  if (!settings.resume || !r || !r.queue || !r.queue.length) return;
  const curPath = r.queue[r.qi];
  S.queue = r.queue.filter((p) => S.byPath.has(p));
  if (!S.queue.length) return;
  S.qi = Math.max(0, S.queue.indexOf(curPath));
  S.shuffle = !!r.shuffle;
  S.repeat = r.repeat || 'off';
  S.orig = r.orig ? r.orig.filter((p) => S.byPath.has(p)) : null;
  const pos = S.queue[S.qi] === curPath ? r.pos || 0 : 0;
  startCurrent(false, pos);
  updateButtons();
}

// ---------- События движка ----------

engine.addEventListener('statechange', () => {
  updateButtons();
  S.vl && S.vl.refresh();
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = engine.playing ? 'playing' : 'paused';
  if (!engine.playing && Date.now() - lastResumeSave > 1000) saveResume();
  if (S.thumbPlaying !== engine.playing) { S.thumbPlaying = engine.playing; invoke('set_thumb_playing', { playing: engine.playing }).catch(() => {}); }
  onlineStateChanged(curTrack());
});

engine.addEventListener('timeupdate', () => {
  const t = engine.time;
  const d = t - S.lastTime;
  S.lastTime = t;
  if (d < -2) { S.listened = 0; S.counted = false; S.scrobbled = false; } // повтор трека начался заново
  if (Math.abs(d) > 2) onlineSeeked(curTrack());
  if (engine.playing && d > 0 && d < 1.5) { S.listened += d; meta.listenSec = (meta.listenSec || 0) + d; }
  if (!S.counted && S.listened >= Math.min(30, (engine.duration || 60) * 0.5)) { S.counted = true; countPlay(curTrack()); }
  if (!S.scrobbled) scrobbleTick(curTrack());
  updateProgress();
  updateLyricsLine();
  if (Date.now() - lastResumeSave > 5000) saveResume();
  S.errors = 0;
});

engine.addEventListener('advanced', (e) => {
  const p = e.detail.path;
  let i = S.queue[S.qi + 1] === p ? S.qi + 1 : S.queue[0] === p ? 0 : S.queue.indexOf(p);
  if (i < 0) { S.queue.splice(S.qi + 1, 0, p); i = S.qi + 1; }
  S.qi = i;
  onTrackChanged();
  checkSleepEndOfTrack();
});

engine.addEventListener('ended', () => {
  if (checkSleepEndOfTrack(true)) return;
  next();
});

engine.addEventListener('error', (e) => {
  const t = e.detail;
  S.errors++;
  toast(`Не удалось воспроизвести: ${t ? t.title : 'файл'}`);
  if (S.errors < 5 && nextIndex() >= 0) setTimeout(next, 600);
});

// ================= Интерфейс плеера =================

export function updateNowPlaying() {
  const t = curTrack();
  const title = t ? t.title : 'Ничего не играет';
  const artist = t ? t.artist || UNKNOWN_ARTIST : '';
  $('#pb-title').textContent = title;
  $('#pb-artist').textContent = artist;
  $('#pb-cover').innerHTML = t ? coverHtml(t.cover, true) : '';
  $('#now-title').textContent = title;
  $('#now-artist').textContent = t ? [artist, t.album].filter(Boolean).join(' — ') : '';
  $('#now-cover').innerHTML = t ? coverHtml(t.cover, true) : '';
  $('#now-src').textContent = t && t.album ? `Из альбома «${t.album}»` : 'Сейчас играет';
  $('#mini-title').textContent = title;
  $('#mini-artist').textContent = artist;
  $('#mini-cover').innerHTML = t ? coverHtml(t.cover, true) : '';
  $('#pb-tech').textContent = techText(t);
  $('#now-tech').textContent = techText(t);
  if ($('#side-now-art')) {
    $('#side-now-art').innerHTML = t ? coverHtml(t.cover, true) : '';
    $('#side-now-title').textContent = t ? title : '';
    $('#side-now-artist').textContent = artist;
  }
  document.body.classList.toggle('has-track', !!t);
  document.title = t ? `${title} — ${artist}` : 'Glow';
  updateStars();
  updateButtons();
  updateProgress();
}

export function updateStars() {
  const t = curTrack();
  $('#now-stars').outerHTML = starsHtml(t ? meta.ratings[t.path] || 0 : 0).replace('class="stars', 'id="now-stars" class="stars');
}

export function setIcon(el, name) { if (el && el._ico !== name) { el.innerHTML = I[name]; el._ico = name; } }

export function updateButtons() {
  const pl = engine.playing ? 'pause' : 'play';
  document.body.classList.toggle('playing', engine.playing);
  ['#c-play', '#n-play', '#m-play'].forEach((s) => setIcon($(s), pl));
  ['#c-shuffle', '#n-shuffle'].forEach((s) => $(s).classList.toggle('on', S.shuffle));
  ['#c-repeat', '#n-repeat'].forEach((s) => { setIcon($(s), S.repeat === 'one' ? 'repeatOne' : 'repeat'); $(s).classList.toggle('on', S.repeat !== 'off'); });
  const t = curTrack();
  const fav = t && favs.has(t.path);
  ['#pb-fav', '#now-fav'].forEach((s) => { setIcon($(s), fav ? 'heartFill' : 'heart'); $(s).classList.toggle('on', !!fav); });
  setIcon($('#b-mute'), settings.muted || settings.volume === 0 ? 'mute' : settings.volume < 0.45 ? 'volumeLow' : 'volume');
  $('#b-queue').classList.toggle('on', S.queueOpen);
  $('#b-timer').classList.toggle('on', !!S.sleep);
  $('#b-eq').classList.toggle('on', settings.eq.enabled && settings.eq.gains.some((g) => g !== 0));
  $('#volume').style.setProperty('--p', settings.muted ? 0 : settings.volume);
}

export function updateProgress() {
  const d = engine.duration, t = engine.time;
  const p = d ? clamp(t / d, 0, 1) : 0;
  for (const id of ['#progress', '#n-progress']) {
    const el = $(id);
    if (!el.classList.contains('drag')) el.style.setProperty('--p', p);
  }
  if (!$('#progress').classList.contains('drag') && !$('#n-progress').classList.contains('drag')) {
    $('#t-cur').textContent = $('#n-cur').textContent = fmt(t);
  }
  $('#t-dur').textContent = $('#n-dur').textContent = fmt(d);
  $('#mini-bar').style.width = `${p * 100}%`;
}

export function makeSlider(el, { onInput, onCommit, vertical = false, wheel }) {
  let val = 0;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    val = clamp(vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width, 0, 1);
    el.style.setProperty('--p', val);
    onInput && onInput(val);
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    move(e);
  });
  el.addEventListener('pointermove', (e) => { if (el.classList.contains('drag')) move(e); });
  const end = () => {
    if (!el.classList.contains('drag')) return;
    el.classList.remove('drag');
    onCommit && onCommit(val);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  if (wheel) el.addEventListener('wheel', (e) => { e.preventDefault(); wheel(e.deltaY < 0 ? 1 : -1); }, { passive: false });
}

export function setVolume(v) {
  settings.volume = clamp(v, 0, 1);
  if (settings.volume > 0) settings.muted = false;
  engine.setVolume(settings.volume);
  engine.setMuted(settings.muted);
  saveSettings();
  updateButtons();
}

// ================= Индикаторы Studio =================

export let meterRun = false;
export const peaks = { l: 0, r: 0 };
export function startMeters() {
  if (meterRun || !isStudio()) return;
  meterRun = true;
  let last = 0;
  const cv = $('#pb-meter'), cx = cv.getContext('2d');
  const loop = (now) => {
    if (!isStudio() || document.hidden) { meterRun = false; return; }
    if (now - last > 33) {
      last = now;
      const W = cv.width, H = cv.height;
      cx.clearRect(0, 0, W, H);
      const cs = getComputedStyle(document.documentElement);
      const acc = cs.getPropertyValue('--accent').trim() || '#3ddc84';
      // Спектр: 32 полосы сверху.
      const sp = engine.spectrum(32), bw = W / 32;
      cx.fillStyle = acc;
      for (let i = 0; i < 32; i++) {
        const v = Math.pow(sp[i], 1.4) * (H - 22);
        cx.globalAlpha = 0.55 + sp[i] * 0.45;
        cx.fillRect(i * bw + 1, H - 22 - v, bw - 2, v);
      }
      cx.globalAlpha = 1;
      // Уровни L/R снизу: зелёный → жёлтый → красный, с удержанием пика.
      const m = engine.meters();
      const grad = cx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, '#2fbf71'); grad.addColorStop(0.7, '#2fbf71'); grad.addColorStop(0.85, '#f2c94c'); grad.addColorStop(1, '#ff5a4f');
      [['l', m.l, m.pl, H - 18], ['r', m.r, m.pr, H - 8]].forEach(([k, v, p, y]) => {
        cx.fillStyle = 'rgba(127,127,127,.18)'; cx.fillRect(0, y, W, 6);
        cx.fillStyle = grad; cx.fillRect(0, y, W * v, 6);
        peaks[k] = Math.max(p, peaks[k] - 0.012);
        cx.fillStyle = '#ffffff'; cx.fillRect(Math.min(W - 2, W * peaks[k]), y, 2, 6);
      });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) startMeters(); });

// ================= Экран воспроизведения =================

export function openNow(side) {
  if (side) { settings.nowSide = side; saveSettings(); }
  if (!S.nowOpen) {
    S.nowOpen = true;
    const n = $('#now');
    n.classList.remove('hidden', 'closing');
    document.body.classList.add('now-open');
    visuals.start();
  }
  renderNowRight();
}

export function closeNow() {
  if (!S.nowOpen) return;
  S.nowOpen = false;
  const n = $('#now');
  n.classList.add('closing');
  // Интерфейс под экраном плеера возвращаем сразу, чтобы он проступал во время закрытия.
  document.body.classList.remove('now-open');
  setTimeout(() => { if (!S.nowOpen) { n.classList.add('hidden'); visuals.stop(); } }, 240);
}

visuals.anchor = () => {
  const c = $('#now-cover').getBoundingClientRect(), n = $('#now').getBoundingClientRect();
  return { x: c.left - n.left + c.width / 2, y: c.top - n.top + c.height / 2, r: c.width / 2 };
};
visuals.onPulse = (p) => {
  if (vis().motion === 'beat') $('#now-cover').style.setProperty('--pulse', p.toFixed(3));
};

export function renderNowRight() {
  const box = $('#now-right');
  const t = curTrack();
  if (settings.nowSide === 'lyrics') {
    if (S.lyrics && S.lyricsFor === (t && t.path)) {
      box.innerHTML = `<div class="lyrics${S.lyrics.synced ? '' : ' plain'}" id="ly">${S.lyrics.lines.map((l, i) => `<div class="ly" data-li="${i}" data-t="${l.t}">${esc(l.text) || '♪'}</div>`).join('')}</div>`
        + (S.lyricsOnline ? `<div class="ly-source caption">Текст из LRCLIB · <button class="btn-text" data-ncmd="lyrics-wrong">не тот текст</button></div>` : '');
      S.lyIdx = -1;
      updateLyricsLine(true);
    } else if (S.lyricsSearching) {
      box.innerHTML = `<div class="lyrics-empty">${I.globe}<div>Ищу текст в LRCLIB…</div></div>`;
    } else {
      box.innerHTML = `<div class="lyrics-empty">${I.lyrics}<div>Текста для этого трека нет</div>
        <div class="actions" style="justify-content:center;margin:0"><button class="btn" data-ncmd="lyrics-online">${I.globe}Найти в интернете</button><button class="btn" data-ncmd="lyrics-edit">${I.edit}Ввести вручную</button><button class="btn" data-ncmd="lyrics-pick">${I.folder}Выбрать .lrc</button></div>
        <div class="caption">Glow сам находит .lrc рядом с треком, текст в тегах${settings.onlineLyrics && !settings.offline ? ' и в LRCLIB' : ''}.</div></div>`;
    }
  } else {
    let html = '<div class="upnext"><div class="overline q-label">Далее в очереди</div>';
    for (let i = S.qi + 1; i < Math.min(S.queue.length, S.qi + 8); i++) {
      const q = track(i);
      html += `<div class="q-item" data-qi="${i}"><div class="r-cover">${coverHtml(q.cover)}</div><div class="q-text"><div class="r-title">${esc(q.title)}</div><div class="r-sub">${esc(q.artist || UNKNOWN_ARTIST)}</div></div><span class="time">${fmt(q.duration)}</span></div>`;
    }
    if (S.qi + 1 >= S.queue.length) html += '<div class="muted" style="padding:8px">Очередь закончится на этом треке.</div>';
    box.innerHTML = html + '</div>';
  }
  $('#now-lyrics').classList.toggle('on', settings.nowSide === 'lyrics');
}

export let lyReq = 0;
export async function loadLyrics(force = false) {
  const t = curTrack();
  S.lyrics = null; S.lyricsFor = null; S.lyIdx = -1; S.lyricsOnline = false; S.lyricsSearching = false;
  if (!t || t.missing) return;
  const req = ++lyReq;
  let text = meta.lyrics[t.path] || null;
  try {
    if (!text && meta.lrcFiles[t.path]) text = await invoke('read_text', { path: meta.lrcFiles[t.path] });
    if (!text) text = await invoke('read_lyrics', { path: t.path });
    if (!text) { const p = findLrcInFolder(t); if (p) text = await invoke('read_text', { path: p }); }
  } catch { text = null; }
  if (req !== lyReq) return;
  if (!text && settings.onlineLyrics && !settings.offline) {
    // Своего текста нет — спросим LRCLIB. Найденное сохраняется, второй раз в сеть не пойдём.
    S.lyricsSearching = true;
    if (S.nowOpen && settings.nowSide === 'lyrics') renderNowRight();
    const r = await fetchOnlineLyrics(t, force);
    if (req !== lyReq) return;
    S.lyricsSearching = false;
    if (r) { text = r.text; S.lyricsOnline = true; }
  }
  S.lyrics = parseLrc(text || '');
  S.lyricsFor = t.path;
  $('#b-lyrics').classList.toggle('on', !!S.lyrics);
  if (S.nowOpen && settings.nowSide === 'lyrics') renderNowRight();
}

export function updateLyricsLine(force = false) {
  if (!S.nowOpen || !S.lyrics || !S.lyrics.synced) return;
  const box = $('#ly');
  if (!box) return;
  const i = lineAt(S.lyrics, engine.time);
  if (i === S.lyIdx && !force) return;
  const old = box.querySelector('.ly.cur');
  if (old) old.classList.remove('cur');
  S.lyIdx = i;
  const el = box.querySelector(`[data-li="${i}"]`);
  if (el) {
    el.classList.add('cur');
    box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  } else if (i < 0) box.scrollTop = 0;
}

// ================= Очередь =================

export function toggleQueue(force) {
  S.queueOpen = force !== undefined ? force : !S.queueOpen;
  $('#queue').classList.toggle('hidden', !S.queueOpen);
  renderQueue();
  updateButtons();
  setTimeout(() => S.vl && S.vl.update(true), 0);
}

export function qItem(i, cls = '') {
  const q = track(i);
  return `<div class="q-item ${cls}" data-qi="${i}" draggable="${cls ? 'false' : 'true'}">
    ${cls ? '' : `<span class="grip">${I.grip}</span>`}
    <div class="r-cover">${coverHtml(q.cover)}</div>
    <div class="q-text"><div class="r-title">${esc(q.title)}</div><div class="r-sub">${esc(q.artist || UNKNOWN_ARTIST)}</div></div>
    ${cls ? '' : `<button class="icon-btn q-x" data-qx="${i}" title="Убрать">${I.close}</button>`}
  </div>`;
}

export function renderQueue() {
  if (!S.queueOpen) return;
  const list = $('#queue-list');
  if (!S.queue.length) { list.innerHTML = '<div class="muted" style="padding:16px">Очередь пуста.</div>'; return; }
  let html = '<div class="overline q-label">Сейчас</div>' + qItem(S.qi, 'current');
  const end = Math.min(S.queue.length, S.qi + 301);
  if (S.qi + 1 < end) html += `<div class="overline q-label">Далее · ${S.queue.length - S.qi - 1}</div>`;
  for (let i = S.qi + 1; i < end; i++) html += qItem(i);
  if (S.queue.length > end) html += `<div class="caption" style="padding:8px">И ещё ${S.queue.length - end}…</div>`;
  list.innerHTML = html;
}

export function moveInQueue(from, to) {
  if (from === to || from <= S.qi || to <= S.qi) return;
  const [p] = S.queue.splice(from, 1);
  S.queue.splice(to, 0, p);
  afterQueueChange();
}

export function removeFromQueue(i) {
  if (i === S.qi) return;
  const [p] = S.queue.splice(i, 1);
  if (i < S.qi) S.qi--;
  if (S.orig) { const k = S.orig.indexOf(p); if (k >= 0) S.orig.splice(k, 1); }
  afterQueueChange();
}

// ================= Таймер сна =================

export function setSleep(min) {
  if (S.sleep && S.sleep.timer) clearTimeout(S.sleep.timer);
  S.sleep = null;
  if (min === 'eot') { S.sleep = { eot: true }; toast('Остановлю после этого трека'); }
  else if (min > 0) {
    const ms = min * 60000;
    S.sleep = { at: Date.now() + ms, timer: setTimeout(() => { engine.fadeOutAndPause(15); S.sleep = null; updateButtons(); }, Math.max(0, ms - 15000)) };
    toast(`Таймер сна: ${min} мин`);
  } else toast('Таймер сна выключен');
  updateButtons();
}

export function checkSleepEndOfTrack(ended = false) {
  if (!S.sleep || !S.sleep.eot) return false;
  S.sleep = null;
  if (ended) { engine.stop(); }
  else { engine.pause(); engine.seek(0); }
  updateButtons();
  return true;
}

