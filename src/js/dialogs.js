// Glow для ПК — dialogs.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { EQ_PRESETS, EQ_FREQS, EQ_LABELS } from './audio.js';
import { addToQueue, loadLyrics, makeSlider, next, playNext, playTracks, renderQueue, setRating, toggleFav, updateButtons, updateNowPlaying } from './player.js';
import { row } from './settings.js';
import { addToPlaylist, newPlaylist } from './sidebar.js';
import { S, curTrack, engine, favs, meta, saveMeta, saveSettings, setLibrary, settings, track } from './state.js';
import { applyAudio, coverHtml, refreshTheme, starsHtml } from './ui.js';
import { $, $$, UNKNOWN_ARTIST, clamp, esc, fmt, invoke, toast, tracksWord } from './util.js';
import { go, render } from './views.js';
import { pickOnlineCover } from './online.js';

// ================= Меню =================

export let menuHandler = null;
export function showMenu(html, x, y, handler) {
  const m = $('#menu');
  m.innerHTML = html;
  m.classList.remove('hidden');
  menuHandler = handler;
  // offsetWidth/Height — без учёта анимации появления (она чуть уменьшает меню).
  const r = { width: m.offsetWidth, height: m.offsetHeight };
  m.style.left = `${clamp(x, 6, window.innerWidth - r.width - 6)}px`;
  m.style.top = `${clamp(y, 6, window.innerHeight - r.height - 6)}px`;
  // Подменю открываем влево, если справа не хватает места.
  const flip = x + r.width * 2 + 10 > window.innerWidth;
  for (const sm of $$('.submenu > .menu', m)) { sm.style.left = flip ? 'auto' : ''; sm.style.right = flip ? '100%' : ''; }
}
export function hideMenu() { $('#menu').classList.add('hidden'); menuHandler = null; }

$('#menu').addEventListener('click', (e) => {
  const star = e.target.closest('[data-star]');
  const it = e.target.closest('[data-m]');
  if (!star && !it) return;
  const h = menuHandler;
  hideMenu();
  if (h) h(star ? `rate:${star.dataset.star}` : it.dataset.m);
});

export function trackMenu(e, t, ctx = {}) {
  e.preventDefault();
  if (t.missing && ctx.playlistId === undefined) return;
  const fav = favs.has(t.path);
  const pls = meta.playlists.map((p) => `<button class="mi" data-m="pl:${esc(p.id)}">${I.playlist}<span class="grow">${esc(p.name)}</span></button>`).join('');
  const html = `
    ${t.missing ? '' : `<button class="mi" data-m="play">${I.play}Воспроизвести</button>
    <button class="mi" data-m="next">${I.next}Играть следующим</button>
    <button class="mi" data-m="queue">${I.queue}Добавить в очередь</button>
    <div class="submenu"><button class="mi">${I.playlist}<span class="grow">В плейлист</span>${I.right}</button>
      <div class="menu"><button class="mi" data-m="pl-new">${I.plus}Новый плейлист</button>${pls ? '<div class="mi-sep"></div>' + pls : ''}</div></div>
    <button class="mi" data-m="fav">${fav ? I.heartFill : I.heart}${fav ? 'Убрать из избранного' : 'В избранное'}</button>
    <div class="mi-stars">Оценка ${starsHtml(meta.ratings[t.path] || 0)}</div>
    <div class="mi-sep"></div>
    ${t._album ? `<button class="mi" data-m="album">${I.album}Перейти к альбому</button>` : ''}
    <button class="mi" data-m="artist">${I.artist}Перейти к исполнителю</button>
    <button class="mi" data-m="tags">${I.edit}Изменить название и обложку…</button>
    <button class="mi" data-m="lyrics">${I.lyrics}Текст песни…</button>
    <button class="mi" data-m="info">${I.info}Информация о файле</button>
    <button class="mi" data-m="reveal">${I.folder}Показать в папке</button>`}
    ${ctx.playlistId !== undefined ? `<div class="mi-sep"></div><button class="mi" data-m="pl-remove">${I.trash}Убрать из плейлиста</button>` : ''}`;
  showMenu(html, e.clientX, e.clientY, async (cmd) => {
    if (cmd === 'play') {
      const i = S.viewList.indexOf(ctx.viewItem || t);
      playTracks(S.viewList.length && i >= 0 ? S.viewList : [t], Math.max(0, i));
    } else if (cmd === 'next') playNext([t.path]);
    else if (cmd === 'queue') addToQueue([t.path]);
    else if (cmd === 'pl-new') await newPlaylist([t.path]);
    else if (cmd.startsWith('pl:')) addToPlaylist(cmd.slice(3), [t.path]);
    else if (cmd === 'fav') toggleFav(t.path);
    else if (cmd.startsWith('rate:')) setRating(t.path, +cmd.slice(5));
    else if (cmd === 'album') go('album', t._album);
    else if (cmd === 'artist') go('artist', t.artist || UNKNOWN_ARTIST);
    else if (cmd === 'lyrics') lyricsEditor(t);
    else if (cmd === 'tags') tagEditor([t]);
    else if (cmd === 'info') fileInfo(t);
    else if (cmd === 'reveal') invoke('reveal', { path: t.path });
    else if (cmd === 'pl-remove') {
      const pl = meta.playlists.find((p) => p.id === ctx.playlistId);
      if (pl && ctx.index !== undefined) { pl.tracks.splice(ctx.index, 1); saveMeta(); render($('#content').scrollTop); }
    }
  });
}

// ================= Модальные окна =================

export function openModal(html, { wide = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${html}</div>`;
  $('#modal-root').appendChild(back);
  const close = () => { back.remove(); onClose && onClose(); };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  back._close = close;
  $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
  return { el: back.firstElementChild, close };
}
export function topModal() { const all = $$('.modal-back'); return all[all.length - 1]; }

export function promptModal(title, value = '', placeholder = '') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`<div class="modal-head"><div class="heading">${esc(title)}</div></div>
      <input class="field" id="pm-in" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false">
      <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" id="pm-ok">Готово</button></div>`,
    { onClose: () => { if (!done) resolve(null); } });
    const inp = $('#pm-in', m.el);
    inp.focus(); inp.select();
    const ok = () => { const v = inp.value.trim(); if (!v) return; done = true; m.close(); resolve(v); };
    $('#pm-ok', m.el).addEventListener('click', ok);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}

export function confirmModal(title, text, okText = 'Удалить') {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(`<div class="modal-head"><div class="heading">${esc(title)}</div></div><div class="muted">${text}</div>
      <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" id="cm-ok">${esc(okText)}</button></div>`,
    { onClose: () => { if (!done) resolve(false); } });
    $('#cm-ok', m.el).addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}

export function fileInfo(t) {
  const rows = [
    ['Название', t.title], ['Исполнитель', t.artist], ['Альбом', t.album], ['Исполнитель альбома', t.album_artist],
    ['Жанр', t.genre], ['Год', t.year], ['Номер', t.track_no ? `${t.disc_no ? t.disc_no + '-' : ''}${t.track_no}` : ''],
    ['Длительность', fmt(t.duration)], ['Формат', t.format],
    ['Частота', t.sample_rate ? `${(t.sample_rate / 1000).toFixed(1)} кГц` : ''],
    ['Разрядность', t.bit_depth ? `${t.bit_depth} бит` : ''],
    ['Каналы', t.channels ? (t.channels === 1 ? 'Моно' : t.channels === 2 ? 'Стерео' : t.channels) : ''],
    ['Битрейт', t.bitrate ? `${t.bitrate} кбит/с` : ''], ['Размер', t.size ? `${(t.size / 1048576).toFixed(1)} МБ` : ''],
    ['ReplayGain трека', t.rg_track], ['ReplayGain альбома', t.rg_album],
    ['Прослушиваний', meta.plays[t.path] || 0], ['Путь', t.path],
  ].filter(([, v]) => v !== '' && v !== undefined && v !== null);
  const m = openModal(`<div class="modal-head"><div class="heading">Информация о файле</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="kv">${rows.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`).join('')}</div>
    <div class="modal-foot"><button class="btn" id="fi-reveal">${I.folder}Показать в папке</button></div>`);
  $('#fi-reveal', m.el).addEventListener('click', () => invoke('reveal', { path: t.path }));
}

/**
 * Редактор тегов. Для одного трека — название, исполнитель, альбом и т. д.;
 * для альбома — общие поля, которые записываются во все его треки.
 * Всё пишется прямо в файлы, поэтому видно и в других плеерах.
 */
export function tagEditor(tracks, album = false) {
  tracks = tracks.filter((t) => !t.missing);
  if (!tracks.length) return;
  const t = tracks[0];
  let newCover = null, removeCover = false;
  const field = (key, label, val, type = 'text') => `<label class="tg-field"><span class="caption">${label}</span><input class="field" data-tag="${key}" type="${type}" value="${esc(val ?? '')}" spellcheck="false"></label>`;
  const fields = album
    ? field('album', 'Альбом', t.album) + field('album_artist', 'Исполнитель альбома', t.album_artist || t.artist)
      + `<div class="tg-two">${field('year', 'Год', t.year)}${field('genre', 'Жанр', t.genre)}</div>`
    : field('title', 'Название', t.title) + field('artist', 'Исполнитель', t.artist) + field('album', 'Альбом', t.album)
      + field('album_artist', 'Исполнитель альбома', t.album_artist)
      + `<div class="tg-three">${field('genre', 'Жанр', t.genre)}${field('year', 'Год', t.year)}${field('track_no', 'Номер', t.track_no || '', 'number')}</div>`;
  const m = openModal(`<div class="modal-head"><div class="heading">${album ? `Альбом · ${tracksWord(tracks.length)}` : 'Название и обложка'}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="tg-wrap">
      <div class="tg-cover-col">
        <button class="tg-cover" id="tg-cover" title="Выбрать картинку">${coverHtml(t.cover, true)}<span class="tg-cover-hint">${I.edit}Сменить</span></button>
        <button class="btn-text" id="tg-online">${I.globe}Найти в интернете</button>
        <button class="btn-text" id="tg-nocover">Убрать обложку</button>
      </div>
      <div class="tg-fields">${fields}</div>
    </div>
    <div class="caption" style="margin-top:14px">Изменения записываются в теги ${album ? 'всех файлов альбома' : 'файла'}: новое название и обложку увидят Проводник, телефон и другие плееры.</div>
    <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" id="tg-save">${I.check}Сохранить</button></div>`, { wide: true });
  const el = m.el;
  $('#tg-cover', el).addEventListener('click', async () => {
    const p = await invoke('pick_cover').catch(() => null);
    if (!p) return;
    newCover = p; removeCover = false;
    $('#tg-cover', el).innerHTML = `${coverHtml(p, true)}<span class="tg-cover-hint">${I.edit}Сменить</span>`;
  });
  $('#tg-online', el).addEventListener('click', async () => {
    const p = await pickOnlineCover(t.album_artist || t.artist, t.album || (album ? '' : t.title));
    if (!p) return;
    newCover = p; removeCover = false;
    $('#tg-cover', el).innerHTML = `${coverHtml(p, true)}<span class="tg-cover-hint">${I.edit}Сменить</span>`;
  });
  $('#tg-nocover', el).addEventListener('click', () => {
    newCover = null; removeCover = true;
    $('#tg-cover', el).innerHTML = `<div class="ph">${I.music}</div><span class="tg-cover-hint">${I.edit}Выбрать</span>`;
  });
  $('#tg-save', el).addEventListener('click', async () => {
    const edit = { cover: newCover, remove_cover: removeCover };
    for (const inp of $$('[data-tag]', el)) {
      const k = inp.dataset.tag;
      const orig = k === 'track_no' ? String(t.track_no || '') : String(t[k] ?? '');
      if (album || inp.value !== orig) edit[k] = k === 'track_no' ? (parseInt(inp.value, 10) || 0) : inp.value;
    }
    const btn = $('#tg-save', el);
    btn.disabled = true;
    let done = 0, failed = 0, lastErr = '';
    for (const tr of tracks) {
      btn.textContent = tracks.length > 1 ? `Записываю ${done + 1} / ${tracks.length}…` : 'Записываю…';
      try {
        const upd = await invoke('write_tags', { path: tr.path, edit });
        const i = S.tracks.findIndex((x) => x.path === tr.path);
        if (i >= 0) S.tracks[i] = upd;
        done++;
      } catch (e) { failed++; lastErr = String(e); }
    }
    m.close();
    setLibrary(S.tracks);
    render($('#content').scrollTop);
    updateNowPlaying();
    refreshTheme();
    renderQueue();
    if (failed) toast(`Не удалось записать ${failed} из ${tracks.length}: ${lastErr}`, 5000);
    else toast(album ? `Альбом обновлён: ${tracksWord(done)}` : 'Теги записаны в файл');
  });
}

export async function lyricsEditor(t) {
  let current = meta.lyrics[t.path] || '';
  if (!current) {
    try {
      current = (meta.lrcFiles[t.path] ? await invoke('read_text', { path: meta.lrcFiles[t.path] }) : await invoke('read_lyrics', { path: t.path })) || '';
    } catch { current = ''; }
  }
  const m = openModal(`<div class="modal-head"><div class="heading">Текст: ${esc(t.title)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <textarea class="field" id="ly-text" spellcheck="false" placeholder="Вставь текст. Для синхронизации используй формат LRC: [01:23.45] строка">${esc(current)}</textarea>
    <div class="caption" style="margin-top:8px">${meta.lrcFiles[t.path] ? 'Сейчас используется файл: ' + esc(meta.lrcFiles[t.path]) : 'Строки с метками времени [мм:сс.xx] будут подсвечиваться под музыку.'}</div>
    <div class="modal-foot">
      ${meta.lyrics[t.path] || meta.lrcFiles[t.path] ? `<button class="btn danger" id="ly-reset">${I.trash}Сбросить своё</button>` : ''}
      <span class="spacer"></span>
      <button class="btn" id="ly-pick">${I.folder}Выбрать .lrc</button>
      <button class="btn primary" id="ly-save">Сохранить</button></div>`, { wide: true });
  $('#ly-save', m.el).addEventListener('click', () => {
    const v = $('#ly-text', m.el).value;
    if (v.trim()) meta.lyrics[t.path] = v; else delete meta.lyrics[t.path];
    saveMeta(); m.close();
    if (curTrack() && curTrack().path === t.path) loadLyrics();
  });
  $('#ly-pick', m.el).addEventListener('click', async () => {
    const p = await invoke('pick_lrc').catch(() => null);
    if (!p) return;
    meta.lrcFiles[t.path] = p; delete meta.lyrics[t.path];
    saveMeta(); m.close();
    if (curTrack() && curTrack().path === t.path) loadLyrics();
    toast('Файл текста привязан к треку');
  });
  const reset = $('#ly-reset', m.el);
  if (reset) reset.addEventListener('click', () => {
    delete meta.lyrics[t.path]; delete meta.lrcFiles[t.path];
    saveMeta(); m.close();
    if (curTrack() && curTrack().path === t.path) loadLyrics();
  });
}

// ---------- Эквалайзер ----------

export function openEq() {
  const eq = settings.eq;
  const chips = () => Object.entries(EQ_PRESETS).map(([k, p]) => `<button class="chip${eq.preset === k ? ' on' : ''}" data-preset="${k}">${p.name}</button>`).join('')
    + settings.customPresets.map((p, i) => `<button class="chip${eq.preset === 'c' + i ? ' on' : ''}" data-cpreset="${i}" title="Правый клик — удалить">${esc(p.name)}</button>`).join('')
    + `<button class="chip" data-psave>${I.plus}Сохранить</button>`;
  const m = openModal(`<div class="modal-head"><div class="heading">Эквалайзер и звук</div>
      <span class="caption">Включён</span><button class="toggle${eq.enabled ? ' on' : ''}" id="eq-on"></button>
      <button class="icon-btn" data-close>${I.close}</button></div>
    <canvas class="eq-curve" id="eq-curve"></canvas>
    <div class="preset-chips" id="eq-presets">${chips()}</div>
    <div class="eq-bands">${EQ_FREQS.map((f, i) => `<div class="eq-band"><div class="val" id="eqv${i}"></div><div class="vslider" data-band="${i}"><div class="vs-fill"></div><div class="vs-thumb"></div></div><div class="lbl">${EQ_LABELS[i]}</div></div>`).join('')}</div>
    <div class="eq-row"><div>Усиление</div><div class="slider" id="eq-pre"><div class="sl-fill"></div><div class="sl-thumb"></div></div><div class="time" id="eq-pre-v"></div></div>
    <div class="eq-row"><div>Баланс L / R</div><div class="slider" id="eq-bal"><div class="sl-fill"></div><div class="sl-thumb"></div></div><div class="time" id="eq-bal-v"></div></div>
    <div class="eq-row"><div>Лимитер</div><div class="caption">Не даёт звуку хрипеть при сильном басе</div><button class="toggle${eq.limiter ? ' on' : ''}" id="eq-lim"></button></div>
    <div class="eq-row"><div>ReplayGain</div><div class="caption">Выравнивает громкость треков по тегам</div>
      <select class="select" id="eq-rg"><option value="off">Выкл</option><option value="track">По треку</option><option value="album">По альбому</option></select></div>`, { wide: true });
  const el = m.el;
  $('#eq-rg', el).value = settings.replayGain;

  const cv = $('#eq-curve', el);
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const cx = cv.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const N = 160, freqs = [];
    for (let i = 0; i < N; i++) freqs.push(20 * Math.pow(1000, i / (N - 1)));
    const gains = eq.enabled ? eq.gains : eq.gains.map(() => 0);
    const resp = engine.response(freqs, gains);
    const pre = eq.enabled ? eq.preamp : 0;
    const y = (db) => clamp(h / 2 - ((db + pre) / 14) * (h / 2 - 8), 2, h - 2);
    const cs = getComputedStyle(document.documentElement);
    const acc = cs.getPropertyValue('--accent').trim() || '#7c5cff';
    cx.strokeStyle = 'rgba(127,127,127,.25)'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(0, h / 2); cx.lineTo(w, h / 2); cx.stroke();
    cx.beginPath();
    for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * w; i ? cx.lineTo(x, y(resp[i])) : cx.moveTo(x, y(resp[i])); }
    cx.strokeStyle = acc; cx.lineWidth = 2.5; cx.shadowColor = acc; cx.shadowBlur = 14; cx.stroke(); cx.shadowBlur = 0;
    cx.lineTo(w, h / 2); cx.lineTo(0, h / 2); cx.closePath();
    const g = cx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, acc + '55'); g.addColorStop(1, acc + '00');
    cx.fillStyle = g; cx.fill();
  };

  const bandEls = $$('.vslider', el);
  const syncBands = () => {
    eq.gains.forEach((g, i) => {
      const p = (g + 12) / 24;
      const s = bandEls[i];
      s.style.setProperty('--p', p);
      const f = s.querySelector('.vs-fill');
      if (p >= 0.5) { f.style.top = `${(1 - p) * 100}%`; f.style.height = `${(p - 0.5) * 100}%`; }
      else { f.style.top = '50%'; f.style.height = `${(0.5 - p) * 100}%`; }
      $(`#eqv${i}`, el).textContent = (g > 0 ? '+' : '') + g.toFixed(1);
    });
    $('#eq-pre', el).style.setProperty('--p', (eq.preamp + 12) / 24);
    $('#eq-pre-v', el).textContent = `${eq.preamp > 0 ? '+' : ''}${eq.preamp.toFixed(1)} дБ`;
    $('#eq-bal', el).style.setProperty('--p', (eq.balance + 1) / 2);
    $('#eq-bal-v', el).textContent = eq.balance === 0 ? 'Центр' : eq.balance < 0 ? `L ${Math.round(-eq.balance * 100)}` : `R ${Math.round(eq.balance * 100)}`;
    draw();
  };
  const commit = () => { applyAudio(); saveSettings(); updateButtons(); };
  const refreshChips = () => { $('#eq-presets', el).innerHTML = chips(); };

  bandEls.forEach((s) => {
    const i = +s.dataset.band;
    makeSlider(s, {
      vertical: true,
      onInput: (p) => { eq.gains[i] = Math.round((p * 24 - 12) * 2) / 2; eq.preset = 'custom'; syncBands(); applyAudio(); },
      onCommit: () => { commit(); refreshChips(); },
    });
    s.addEventListener('dblclick', () => { eq.gains[i] = 0; syncBands(); commit(); });
  });
  makeSlider($('#eq-pre', el), { onInput: (p) => { eq.preamp = Math.round((p * 24 - 12) * 2) / 2; syncBands(); applyAudio(); }, onCommit: commit });
  makeSlider($('#eq-bal', el), {
    onInput: (p) => { let b = Math.round((p * 2 - 1) * 20) / 20; if (Math.abs(b) < 0.06) b = 0; eq.balance = b; syncBands(); applyAudio(); },
    onCommit: commit,
  });
  $('#eq-on', el).addEventListener('click', (e) => { eq.enabled = !eq.enabled; e.currentTarget.classList.toggle('on', eq.enabled); syncBands(); commit(); });
  $('#eq-lim', el).addEventListener('click', (e) => { eq.limiter = !eq.limiter; e.currentTarget.classList.toggle('on', eq.limiter); commit(); });
  $('#eq-rg', el).addEventListener('change', (e) => { settings.replayGain = e.target.value; commit(); });
  $('#eq-presets', el).addEventListener('click', async (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.preset) { eq.gains = EQ_PRESETS[b.dataset.preset].gains.slice(); eq.preset = b.dataset.preset; }
    else if (b.dataset.cpreset !== undefined) { const p = settings.customPresets[+b.dataset.cpreset]; eq.gains = p.gains.slice(); eq.preset = 'c' + b.dataset.cpreset; }
    else if (b.hasAttribute('data-psave')) {
      const name = await promptModal('Сохранить пресет', '', 'Название');
      if (!name) return;
      settings.customPresets.push({ name, gains: eq.gains.slice() });
      eq.preset = 'c' + (settings.customPresets.length - 1);
    }
    eq.enabled = true;
    $('#eq-on', el).classList.add('on');
    refreshChips(); syncBands(); commit();
  });
  $('#eq-presets', el).addEventListener('contextmenu', async (e) => {
    const b = e.target.closest('[data-cpreset]');
    if (!b) return;
    e.preventDefault();
    const i = +b.dataset.cpreset;
    if (!(await confirmModal('Удалить пресет?', `«${esc(settings.customPresets[i].name)}» будет удалён.`))) return;
    settings.customPresets.splice(i, 1);
    if (eq.preset.startsWith('c')) eq.preset = 'custom';
    refreshChips(); commit();
  });
  requestAnimationFrame(syncBands);
}

