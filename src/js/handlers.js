// Glow для ПК — handlers.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { STYLES } from './theme.js';
import { confirmModal, hideMenu, lyricsEditor, openEq, promptModal, showMenu, tagEditor, topModal, trackMenu } from './dialogs.js';
import { exportSync, importSync, indexLrcFolder, relinkDialog, rgScanAll } from './features.js';
import { addFolder, scan, watchFolders } from './library.js';
import { setMini } from './main.js';
import { addToQueue, afterQueueChange, closeNow, cycleRepeat, loadLyrics, makeSlider, moveInQueue, next, openNow, playNext, playTracks, prev, removeFromQueue, renderNowRight, setRating, setSleep, setVolume, startCurrent, toggleFav, togglePlay, toggleQueue, toggleShuffle, updateButtons } from './player.js';
import { afterSetting, importStyle, range, sel, setAppIcon, userStyleMenu } from './settings.js';
import { addToPlaylist, bindSidebar, newPlaylist, pinToSidebar, renderPlaylists, saveSidebar, setNavMode, startNavEdit, toggleNav } from './sidebar.js';
import { smartEditor } from './smart.js';
import { checkUpdates } from './updates.js';
import { exportPlaylistM3u, importM3u } from './collection.js';
import { connectLastfm, connectListenBrainz, disconnectLastfm, disconnectListenBrainz, flushScrobbles, forgetOnlineLyrics, pendingScrobbles } from './online.js';
import { S, curTrack, editor, engine, flushNow, meta, saveMeta, saveSettings, settings, track, vis } from './state.js';
import { folderMenu } from './ui.js';
import { $, $$, UNKNOWN_ARTIST, esc, fmt, invoke, toast } from './util.js';
import { go, goBack, render } from './views.js';

// ================= Обработчики =================

export function bindUi() {
  for (const el of $$('[data-icon]')) { el.innerHTML = I[el.dataset.icon] || ''; el._ico = el.dataset.icon; }

  // Окно
  $('#win-min').onclick = () => invoke('win_minimize');
  $('#win-max').onclick = () => invoke('win_toggle_max');
  $('#win-close').onclick = async () => {
    // Сначала дописываем всё на диск, потом закрываем окно.
    flushNow();
    try { await Promise.race([window.__glowFlush ? window.__glowFlush() : null, new Promise((r) => setTimeout(r, 1500))]); } catch { /* ignore */ }
    invoke('win_close');
  };
  $('#btn-mini').onclick = () => setMini(true);
  $('#m-expand').onclick = () => setMini(false);

  // Сайдбар
  bindSidebar();
  $('#btn-nav').onclick = toggleNav;

  // Поиск
  let st;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(st);
    const q = e.target.value.trim();
    st = setTimeout(() => {
      if (q) go('search', q, { replace: S.view.name === 'search' });
      else if (S.view.name === 'search') goBack();
    }, 160);
  });
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); if (S.view.name === 'search') goBack(); }
    if (e.key === 'Enter' && S.viewList.length) playTracks(S.viewList, 0);
  });

  // Контент
  const content = $('#content');
  content.addEventListener('scroll', () => S.vl && S.vl.update(), { passive: true });
  window.addEventListener('resize', () => S.vl && S.vl.update(true));
  content.addEventListener('click', onContentClick);
  content.addEventListener('dblclick', (e) => {
    const r = e.target.closest('.row');
    if (r && !e.target.closest('[data-act]')) playTracks(S.viewList, +r.dataset.i);
  });
  content.addEventListener('contextmenu', (e) => {
    const r = e.target.closest('.row');
    if (r) {
      const i = +r.dataset.i;
      const t = S.viewList[i];
      selectRow(i);
      trackMenu(e, t, { viewItem: t, playlistId: S.viewCtx.playlistId, index: i });
      return;
    }
    const ag = e.target.closest('[data-go="artist"], [data-go="genre"]');
    if (ag) {
      e.preventDefault();
      const kind = ag.dataset.go, key = ag.dataset.key;
      const list = kind === 'artist' ? (S.artistByName.get(key) || { tracks: [] }).tracks : ((S.genres.find((g) => g.name === key) || { tracks: [] }).tracks);
      showMenu(`<button class="mi" data-m="play">${I.play}Слушать</button><button class="mi" data-m="shuffle">${I.shuffle}Перемешать</button>
        <button class="mi" data-m="queue">${I.queue}Добавить в очередь</button><div class="mi-sep"></div><button class="mi" data-m="pin">${I.pin}Закрепить в меню</button>`,
      e.clientX, e.clientY, (cmd) => {
        if (cmd === 'play') playTracks(list, 0);
        else if (cmd === 'shuffle' && list.length) playTracks(list, Math.floor(Math.random() * list.length), { shuffle: true });
        else if (cmd === 'queue') addToQueue(list.map((x) => x.path));
        else if (cmd === 'pin') pinToSidebar(kind, key, key);
      });
      return;
    }
    const fo = e.target.closest('[data-go="folder"], [data-folder-cover]');
    if (fo) { e.preventDefault(); folderMenu(fo.dataset.key || fo.dataset.folderCover, e.clientX, e.clientY); return; }
    const sc = e.target.closest('[data-style]');
    if (sc) {
      e.preventDefault();
      const id = sc.dataset.style;
      if (STYLES[id] && STYLES[id].user) { userStyleMenu(id, e.clientX, e.clientY); return; }
      showMenu(`<button class="mi" data-m="use">${I.check}Применить</button><button class="mi" data-m="new">${I.edit}Создать свой стиль на основе «${esc(STYLES[id].name)}»</button>`,
        e.clientX, e.clientY, (cmd) => { if (cmd === 'use') { settings.style = id; afterSetting('style'); } else editor.open({ base: id }); });
      return;
    }
    const card = e.target.closest('[data-go="album"]');
    if (card) {
      e.preventDefault();
      const a = S.albumByKey.get(card.dataset.key);
      if (!a) return;
      const paths = a.tracks.map((t) => t.path);
      const pls = meta.playlists.map((p) => `<button class="mi" data-m="pl:${esc(p.id)}">${I.playlist}<span class="grow">${esc(p.name)}</span></button>`).join('');
      showMenu(`<button class="mi" data-m="play">${I.play}Слушать альбом</button><button class="mi" data-m="next">${I.next}Играть следующим</button><button class="mi" data-m="queue">${I.queue}Добавить в очередь</button>
        <div class="submenu"><button class="mi">${I.playlist}<span class="grow">В плейлист</span>${I.right}</button><div class="menu"><button class="mi" data-m="pl-new">${I.plus}Новый плейлист</button>${pls}</div></div>
        <div class="mi-sep"></div><button class="mi" data-m="pin">${I.pin}Закрепить в меню</button><button class="mi" data-m="tags">${I.edit}Изменить альбом и обложку…</button>`,
      e.clientX, e.clientY, (cmd) => {
        if (cmd === 'pin') pinToSidebar('album', a.key, a.name);
        else if (cmd === 'tags') tagEditor(a.tracks, true);
        else if (cmd === 'play') playTracks(a.tracks, 0);
        else if (cmd === 'next') playNext(paths);
        else if (cmd === 'queue') addToQueue(paths);
        else if (cmd === 'pl-new') newPlaylist(paths);
        else if (cmd.startsWith('pl:')) addToPlaylist(cmd.slice(3), paths);
      });
    }
  });
  content.addEventListener('change', (e) => {
    const s = e.target.closest('[data-set]');
    if (s) { settings[s.dataset.set] = s.value; afterSetting(s.dataset.set); }
    if (e.target.id === 'md3hex') {
      const v = e.target.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(v)) { settings.md3Seed = (v.startsWith('#') ? v : '#' + v).toLowerCase(); afterSetting('md3Seed'); }
      else toast('Нужен цвет в формате #RRGGBB');
    }
    if (e.target.id === 'hex') {
      const v = e.target.value.trim();
      if (/^#?[0-9a-f]{6}$/i.test(v)) { settings.customAccent = v.startsWith('#') ? v.toLowerCase() : '#' + v.toLowerCase(); if (settings.accentMode === 'cover') settings.accentMode = 'custom'; afterSetting('customAccent'); }
      else toast('Нужен цвет в формате #RRGGBB');
    }
  });
  content.addEventListener('input', (e) => {
    const r = e.target.closest('[data-range]');
    if (!r) return;
    const key = r.dataset.range;
    settings[key] = parseFloat(r.value);
    const lbl = $(`[data-range-v="${key}"]`, content);
    const fmtR = { glow: (v) => Math.round(v * 100) + '%', glassAlpha: (v) => Math.round(v * 100) + '%', glassBlur: (v) => v + ' px', crossfade: (v) => (v ? v + ' с' : 'выкл') };
    if (lbl) lbl.textContent = fmtR[key] ? fmtR[key](settings[key]) : settings[key] + ' мс';
    afterSetting(key, false);
  });

  // Нижняя панель
  $('#c-play').onclick = $('#n-play').onclick = $('#m-play').onclick = togglePlay;
  $('#c-next').onclick = $('#n-next').onclick = $('#m-next').onclick = next;
  $('#c-prev').onclick = $('#n-prev').onclick = $('#m-prev').onclick = prev;
  $('#c-shuffle').onclick = $('#n-shuffle').onclick = toggleShuffle;
  $('#c-repeat').onclick = $('#n-repeat').onclick = cycleRepeat;
  $('#pb-fav').onclick = $('#now-fav').onclick = () => toggleFav(curTrack() && curTrack().path);
  $('#pb-cover').onclick = () => { if (curTrack()) openNow(); };
  $('#pb-artist').onclick = () => { const t = curTrack(); if (t && !t.missing) go('artist', t.artist || UNKNOWN_ARTIST); };
  $('#b-queue').onclick = () => toggleQueue();
  $('#queue-close').onclick = () => toggleQueue(false);
  $('#queue-clear').onclick = () => { if (!S.queue.length) return; S.queue = [S.queue[S.qi]]; S.qi = 0; S.orig = null; afterQueueChange(); };
  $('#b-eq').onclick = openEq;
  $('#b-lyrics').onclick = () => { if (curTrack()) openNow('lyrics'); };
  $('#b-mute').onclick = () => { settings.muted = !settings.muted; engine.setMuted(settings.muted); saveSettings(); updateButtons(); };
  $('#b-timer').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const left = S.sleep && S.sleep.at ? `<div class="mi-stars">Осталось ${fmt((S.sleep.at - Date.now()) / 1000)}</div><div class="mi-sep"></div>` : '';
    showMenu(`${left}${[15, 30, 45, 60, 90].map((m) => `<button class="mi" data-m="${m}">${I.timer}${m} минут</button>`).join('')}
      <button class="mi" data-m="eot">${I.music}До конца трека</button>${S.sleep ? `<div class="mi-sep"></div><button class="mi" data-m="0">${I.close}Выключить</button>` : ''}`,
    r.left - 120, r.top - 300, (cmd) => setSleep(cmd === 'eot' ? 'eot' : +cmd));
  };

  makeSlider($('#progress'), {
    onInput: (p) => { $('#t-cur').textContent = fmt(p * engine.duration); },
    onCommit: (p) => engine.seek(p * engine.duration),
  });
  makeSlider($('#n-progress'), {
    onInput: (p) => { $('#n-cur').textContent = fmt(p * engine.duration); },
    onCommit: (p) => engine.seek(p * engine.duration),
  });
  makeSlider($('#volume'), { onInput: setVolume, wheel: (d) => setVolume(settings.volume + d * 0.05) });
  $('#playerbar').addEventListener('wheel', (e) => {
    if (e.target.closest('#volume')) return;
    if (e.target.closest('.pb-right')) { e.preventDefault(); setVolume(settings.volume + (e.deltaY < 0 ? 0.05 : -0.05)); }
  }, { passive: false });
  $('#pb-cover').addEventListener('contextmenu', (e) => { const t = curTrack(); if (t) trackMenu(e, t); });

  // Очередь
  const ql = $('#queue-list');
  ql.addEventListener('click', (e) => {
    const x = e.target.closest('[data-qx]');
    if (x) { removeFromQueue(+x.dataset.qx); return; }
    const it = e.target.closest('[data-qi]');
    if (it && +it.dataset.qi !== S.qi) { S.qi = +it.dataset.qi; startCurrent(true); }
  });
  ql.addEventListener('contextmenu', (e) => {
    const it = e.target.closest('[data-qi]');
    if (!it) return;
    const t = track(+it.dataset.qi);
    if (t) trackMenu(e, t);
  });
  let dragFrom = -1;
  ql.addEventListener('dragstart', (e) => { const it = e.target.closest('[data-qi]'); if (!it) return; dragFrom = +it.dataset.qi; e.dataTransfer.effectAllowed = 'move'; });
  ql.addEventListener('dragover', (e) => {
    const it = e.target.closest('[data-qi]');
    if (!it || dragFrom < 0) return;
    e.preventDefault();
    $$('.drag-over', ql).forEach((x) => x.classList.remove('drag-over'));
    it.classList.add('drag-over');
  });
  ql.addEventListener('drop', (e) => {
    const it = e.target.closest('[data-qi]');
    $$('.drag-over', ql).forEach((x) => x.classList.remove('drag-over'));
    if (it && dragFrom >= 0) { e.preventDefault(); moveInQueue(dragFrom, Math.max(S.qi + 1, +it.dataset.qi)); }
    dragFrom = -1;
  });
  ql.addEventListener('dragend', () => { dragFrom = -1; $$('.drag-over', ql).forEach((x) => x.classList.remove('drag-over')); });

  // Экран воспроизведения
  $('#now-close').onclick = closeNow;
  $('#now-lyrics').onclick = () => { settings.nowSide = settings.nowSide === 'lyrics' ? 'queue' : 'lyrics'; saveSettings(); renderNowRight(); };
  $('#now-more').onclick = (e) => { const t = curTrack(); if (t) trackMenu(e, t); };
  $('#now-cover').addEventListener('contextmenu', (e) => { const t = curTrack(); if (t) trackMenu(e, t); });
  $('#now').addEventListener('click', (e) => {
    const st = e.target.closest('#now-stars [data-star]');
    if (st) { setRating(curTrack() && curTrack().path, +st.dataset.star); return; }
    const ly = e.target.closest('.ly');
    if (ly && S.lyrics && S.lyrics.synced) { engine.seek(parseFloat(ly.dataset.t)); return; }
    const q = e.target.closest('#now-right [data-qi]');
    if (q) { S.qi = +q.dataset.qi; startCurrent(true); return; }
    const c = e.target.closest('[data-ncmd]');
    if (c && curTrack()) {
      if (c.dataset.ncmd === 'lyrics-edit') lyricsEditor(curTrack());
      else if (c.dataset.ncmd === 'lyrics-online') { if (settings.offline) toast('Включён режим без интернета — выключи его в Настройки → Онлайн'); else loadLyrics(true); }
      else if (c.dataset.ncmd === 'lyrics-wrong') { forgetOnlineLyrics(curTrack()).then(() => { toast('Этот текст больше не покажется. Можно ввести свой.'); loadLyrics(); }); }
      else if (c.dataset.ncmd === 'lyrics-pick') invoke('pick_lrc').then((p) => { if (p) { meta.lrcFiles[curTrack().path] = p; saveMeta(); loadLyrics(); } });
    }
  });
  $('#now').addEventListener('mousemove', (e) => {
    if (vis().motion !== 'parallax' || !settings.animations) return;
    const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5;
    const c = $('#now-cover');
    c.style.setProperty('--tx', `${(x * 14).toFixed(2)}deg`);
    c.style.setProperty('--ty', `${(-y * 14).toFixed(2)}deg`);
  });
  $('#now-cover').addEventListener('wheel', (e) => { e.preventDefault(); e.deltaY > 0 ? next() : prev(); }, { passive: false });

  // Мини-плеер: клик по обложке — открыть обычное окно с экраном воспроизведения.
  $('#mini-cover').addEventListener('dblclick', () => { setMini(false); openNow(); });

  // Клавиатура
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#menu')) hideMenu(); }, true);
  window.addEventListener('blur', hideMenu);
  window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); if (S.nowOpen) closeNow(); else goBack(); } });
  window.addEventListener('beforeunload', flushNow);
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
  // Чтобы пробел не «нажимал» последнюю кнопку повторно, снимаем с неё фокус после клика.
  document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
}

export async function playlistCmd(cmd, id) {
  const pl = meta.playlists.find((p) => p.id === id);
  if (!pl) return;
  if (cmd === 'play') playTracks(pl.tracks.map((p) => S.byPath.get(p)).filter(Boolean), 0);
  else if (cmd === 'rename') {
    const n = await promptModal('Переименовать плейлист', pl.name);
    if (n) { pl.name = n; saveMeta(); renderPlaylists(); if (S.view.name === 'playlist') render($('#content').scrollTop); }
  } else if (cmd === 'delete') {
    if (!(await confirmModal('Удалить плейлист?', `«${esc(pl.name)}» будет удалён. Сами треки останутся.`))) return;
    meta.playlists = meta.playlists.filter((p) => p.id !== id);
    saveMeta(); renderPlaylists();
    if (S.view.name === 'playlist' && S.view.param === id) go('tracks', null, { replace: true });
  }
}

export function selectRow(i) {
  S.sel = i;
  for (const r of $$('.row.sel', $('#content'))) r.classList.remove('sel');
  const r = $(`.row[data-i="${i}"]`, $('#content'));
  if (r) r.classList.add('sel');
}

export async function onContentClick(e) {
  const t = e.target;
  const rowEl = t.closest('.row');
  if (rowEl) {
    const i = +rowEl.dataset.i;
    const tr = S.viewList[i];
    const star = t.closest('[data-star]');
    if (star) { setRating(tr.path, +star.dataset.star); return; }
    if (t.closest('[data-act="fav"]')) { toggleFav(tr.path); return; }
    if (t.closest('.r-playbtn')) { playTracks(S.viewList, i); return; }
    selectRow(i);
    return;
  }

  const go_ = t.closest('[data-go]');
  const cmdEl = t.closest('[data-cmd]');
  if (cmdEl) {
    e.stopPropagation();
    const cmd = cmdEl.dataset.cmd, key = cmdEl.dataset.key;
    switch (cmd) {
      case 'play-all': playTracks(S.viewList, 0); break;
      case 'shuffle-all': if (S.viewList.length) playTracks(S.viewList, Math.floor(Math.random() * S.viewList.length), { shuffle: true }); break;
      case 'play-album': { const a = S.albumByKey.get(key); if (a) playTracks(a.tracks, 0); break; }
      case 'smart-edit': smartEditor(key); break;
      case 'smart-del': {
        const sl = meta.smartLists.find((x) => x.id === key);
        if (sl && await confirmModal('Удалить подборку?', `«${esc(sl.name)}» будет удалена. Треки останутся.`)) {
          meta.smartLists = meta.smartLists.filter((x) => x.id !== key);
          for (const g of settings.sidebar.groups) g.items = g.items.filter((it) => !(it.view === 'smartx' && it.param === key));
          saveMeta(); saveSidebar(); go('tracks', null, { replace: true });
        }
        break;
      }
      case 'relink': relinkDialog(true); break;
      case 'update-check': checkUpdates(true); break;
      case 'm3u-import': importM3u(); break;
      case 'pl-export': exportPlaylistM3u(key); break;
      case 'lfm-connect': connectLastfm(() => render($('#content').scrollTop)); break;
      case 'lfm-disconnect': disconnectLastfm(); render($('#content').scrollTop); break;
      case 'lb-connect': connectListenBrainz($('#lb-token') && $('#lb-token').value, () => render($('#content').scrollTop)); break;
      case 'lb-disconnect': disconnectListenBrainz(); render($('#content').scrollTop); break;
      case 'scrobble-flush': {
        const n = pendingScrobbles();
        await flushScrobbles();
        const left = pendingScrobbles();
        toast(left ? `Не отправлено: ${left}. Попробую позже.` : `Отправлено: ${n}`);
        render($('#content').scrollTop);
        break;
      }
      case 'lrc-folder': {
        const p = await invoke('pick_folder').catch(() => null);
        if (p) { settings.lyricsFolder = p; saveSettings(); await indexLrcFolder(); render($('#content').scrollTop); toast(`Найдено текстов: ${S.lrcIndex ? S.lrcIndex.size : 0}`); }
        break;
      }
      case 'lrc-folder-clear': settings.lyricsFolder = ''; S.lrcIndex = null; saveSettings(); render($('#content').scrollTop); break;
      case 'sync-export': exportSync(); break;
      case 'sync-import': importSync(); break;
      case 'rg-scan': rgScanAll(); break;
      case 'play-folder': { const f = S.folders.find((x) => x.path === key); if (f) playTracks(f.tracks, 0); break; }
      case 'folder-view': settings.folderView = key; saveSettings(); render(); break;
      case 'add-folder': addFolder(); break;
      case 'rescan': scan(); break;
      case 'rm-folder': settings.folders.splice(+cmdEl.dataset.i, 1); saveSettings(); watchFolders(); render($('#content').scrollTop); scan(); break;
      case 'add-excl': {
        const p = await invoke('pick_folder').catch(() => null);
        if (p && !settings.excluded.includes(p)) { settings.excluded.push(p); saveSettings(); render($('#content').scrollTop); scan(); }
        break;
      }
      case 'rm-excl': settings.excluded.splice(+cmdEl.dataset.i, 1); saveSettings(); render($('#content').scrollTop); scan(); break;
      case 'open-eq': openEq(); break;
      case 'backup-save':
        flushNow();
        try { await (window.__glowFlush && window.__glowFlush()); if (await invoke('backup_save')) toast('Резервная копия сохранена'); } catch (e2) { toast(`Не удалось сохранить: ${e2}`); }
        break;
      case 'backup-restore':
        if (!(await confirmModal('Восстановить из копии?', 'Текущие настройки, плейлисты, избранное и свои стили заменятся данными из файла. Прежние останутся в .bak-файлах.', 'Выбрать файл'))) break;
        try {
          if (await invoke('backup_restore')) { toast('Восстановлено, перезапускаю…'); setTimeout(() => location.reload(), 600); }
        } catch (e2) { toast(`Не удалось восстановить: ${e2}`); }
        break;
      case 'nav-edit': if (settings.sidebar.mode === 'hidden') settings.sidebar.mode = 'full'; startNavEdit(); break;
      case 'style-new': editor.open({ base: settings.style }); break;
      case 'style-import': importStyle(); break;
      case 'reveal-folder': {
        const f = S.folders.find((x) => x.path === key);
        if (f && f.tracks[0]) invoke('reveal', { path: f.tracks[0].path });
        break;
      }
      case 'clear-history':
        if (await confirmModal('Очистить историю?', 'Счётчики прослушиваний и статистика останутся.', 'Очистить')) { meta.history = []; saveMeta(); render(); }
        break;
      case 'pl-rename': playlistCmd('rename', key); break;
      case 'pl-delete': playlistCmd('delete', key); break;
      default: break;
    }
    return;
  }
  if (go_) { go(go_.dataset.go, go_.dataset.key); return; }

  const sty = t.closest('[data-style]');
  if (sty) { settings.style = sty.dataset.style; afterSetting('style'); return; }
  const am = t.closest('[data-accent-mode]');
  if (am) { settings.accentMode = am.dataset.accentMode; afterSetting('accentMode'); return; }
  const nm = t.closest('[data-navmode]');
  if (nm) { setNavMode(nm.dataset.navmode); render($('#content').scrollTop); return; }
  const um = t.closest('[data-umore]');
  if (um) { const r = um.getBoundingClientRect(); userStyleMenu(um.dataset.umore, r.left, r.bottom + 4); return; }
  const ai = t.closest('[data-appicon]');
  if (ai) {
    settings.appIcon = ai.dataset.appicon;
    saveSettings();
    setAppIcon(settings.appIcon, true);
    render($('#content').scrollTop);
    return;
  }
  const ms = t.closest('[data-md3seed]');
  if (ms) { settings.md3Seed = ms.dataset.md3seed; afterSetting('md3Seed'); return; }
  const ac = t.closest('[data-accent]');
  if (ac) { settings.customAccent = ac.dataset.accent; if (settings.accentMode === 'cover') settings.accentMode = 'custom'; afterSetting('customAccent'); return; }
  const tg = t.closest('[data-toggle]');
  if (tg) { const k = tg.dataset.toggle; settings[k] = !settings[k]; afterSetting(k); }
}

export function onKey(e) {
  const typing = e.target.matches('input, textarea, select');
  if (e.key === 'Escape') {
    if (!$('#menu').classList.contains('hidden')) { hideMenu(); return; }
    const m = topModal();
    if (m) { m._close(); return; }
    if (S.nowOpen) { closeNow(); return; }
    if (S.mini) return;
    if (typing) e.target.blur();
    return;
  }
  if (typing || topModal()) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && (k === 'f' || k === 'а')) { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
  if (e.ctrlKey && (k === 'b' || k === 'и')) { e.preventDefault(); toggleNav(); return; }
  switch (e.code) {
    case 'Space': e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': e.preventDefault(); e.ctrlKey ? next() : engine.seek(engine.time + 5); break;
    case 'ArrowLeft': e.preventDefault(); e.ctrlKey ? prev() : engine.seek(engine.time - 5); break;
    case 'ArrowUp': e.preventDefault(); setVolume(settings.volume + 0.05); break;
    case 'ArrowDown': e.preventDefault(); setVolume(settings.volume - 0.05); break;
    case 'KeyM': settings.muted = !settings.muted; engine.setMuted(settings.muted); saveSettings(); updateButtons(); break;
    case 'KeyL': toggleFav(curTrack() && curTrack().path); break;
    case 'KeyS': toggleShuffle(); break;
    case 'KeyR': cycleRepeat(); break;
    case 'KeyQ': toggleQueue(); break;
    case 'KeyN': if (S.nowOpen) closeNow(); else if (curTrack()) openNow(); break;
    case 'Enter': if (S.sel >= 0 && S.viewList[S.sel]) playTracks(S.viewList, S.sel); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      if (curTrack()) { setRating(curTrack().path, +e.code.slice(5)); toast(`Оценка: ${'★'.repeat(meta.ratings[curTrack().path] || 0) || 'снята'}`, 1200); }
      break;
    case 'Backspace': if (e.altKey) goBack(); break;
    default: break;
  }
  if (e.altKey && e.code === 'ArrowLeft') goBack();
}

