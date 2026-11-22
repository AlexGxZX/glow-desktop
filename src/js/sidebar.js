// Glow для ПК — sidebar.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { confirmModal, promptModal, showMenu } from './dialogs.js';
import { playlistCmd } from './handlers.js';
import { scan } from './library.js';
import { openNow } from './player.js';
import { smartEditor } from './smart.js';
import { S, curTrack, meta, saveMeta, saveSettings, settings } from './state.js';
import { coverHtml } from './ui.js';
import { $, $$, UNKNOWN_ARTIST, esc, toast } from './util.js';
import { go, markSidebar, render } from './views.js';

// ================= Плейлисты =================

// ================= Боковое меню =================

export const BUILTIN_NAV = {
  tracks: ['tracks', null, 'Треки', 'music'],
  albums: ['albums', null, 'Альбомы', 'album'],
  artists: ['artists', null, 'Исполнители', 'artist'],
  genres: ['genres', null, 'Жанры', 'genre'],
  folders: ['folders', null, 'Папки', 'folder'],
  favorites: ['favorites', null, 'Избранное', 'heart'],
  history: ['history', null, 'История', 'history'],
  stats: ['stats', null, 'Статистика', 'stats'],
  wrapped: ['wrapped', null, 'Итоги года', 'star'],
  'smart:recent': ['smart', 'recent', 'Недавно добавленные', 'smart'],
  'smart:most': ['smart', 'most', 'Часто слушаю', 'smart'],
  'smart:rated': ['smart', 'rated', 'Лучшие по оценкам', 'smart'],
  'smart:forgotten': ['smart', 'forgotten', 'Давно не слушал', 'smart'],
};
export const PIN_ICONS = { album: 'album', artist: 'artist', genre: 'genre', folder: 'folder', playlist: 'playlist', smart: 'smart', smartx: 'smart' };

export function defaultSidebar(mode = 'full') {
  const g = (id, title, ids) => ({ id, title, items: ids.map((x) => ({ id: x })) });
  return {
    mode,
    groups: [
      g('lib', 'Медиатека', ['tracks', 'albums', 'artists', 'genres', 'folders']),
      g('mine', 'Моё', ['favorites', 'history', 'stats', 'wrapped']),
      g('smart', 'Подборки', ['smart:recent', 'smart:most', 'smart:rated', 'smart:forgotten']),
      { id: 'playlists', title: 'Плейлисты', type: 'playlists', items: [] },
    ],
  };
}

/** Чинит сохранённое меню: встроенные пункты не теряются, группа плейлистов всегда есть. */
export function normalizeSidebar(sb) {
  if (!sb || !Array.isArray(sb.groups)) return defaultSidebar();
  if (!['full', 'compact', 'hidden'].includes(sb.mode)) sb.mode = 'full';
  const seen = new Set();
  for (const g of sb.groups) {
    g.items = (g.items || []).filter((it) => it && it.id && (BUILTIN_NAV[it.id] || it.view) && !seen.has(it.id) && seen.add(it.id));
  }
  const first = sb.groups.find((g) => g.type !== 'playlists');
  // Новые встроенные пункты: «Итоги года» — в «Моё», остальные — в первую группу.
  for (const id of Object.keys(BUILTIN_NAV)) {
    if (seen.has(id)) continue;
    const target = (id === 'wrapped' && sb.groups.find((g) => g.id === 'mine')) || first;
    if (target) target.items.push({ id });
  }
  if (!sb.groups.some((g) => g.type === 'playlists')) sb.groups.push({ id: 'playlists', title: 'Плейлисты', type: 'playlists', items: [] });
  return sb;
}

export function navInfo(it) {
  const b = BUILTIN_NAV[it.id];
  if (b) return { view: b[0], param: b[1], label: b[2], icon: b[3], pinned: false };
  let label = it.label || it.param;
  if (it.view === 'smartx') { const sl = (meta.smartLists || []).find((x) => x.id === it.param); if (sl) label = sl.name; }
  return { view: it.view, param: it.param, label, icon: PIN_ICONS[it.view] || 'pin', pinned: true };
}

export function renderSidebar() {
  const sb = settings.sidebar;
  const edit = S.navEdit;
  const bc = document.body.classList;
  bc.toggle('nav-compact', sb.mode === 'compact' && !edit);
  bc.toggle('nav-hidden', sb.mode === 'hidden' && !edit);
  bc.toggle('nav-edit', !!edit);
  let html = '';
  sb.groups.forEach((g, gi) => {
    if (g.hidden && !edit) return;
    const isPl = g.type === 'playlists';
    const items = isPl ? [] : g.items.map((it, ii) => ({ it, ii })).filter(({ it }) => edit || !it.hidden);
    if (!edit && !isPl && !items.length) return;
    html += `<div class="nav-group${g.hidden ? ' off' : ''}" data-gi="${gi}">`;
    if (edit) {
      html += `<div class="nav-ghead" draggable="true" data-gdrag="${gi}"><span class="grip">${I.grip}</span>
        <input class="nav-gtitle" data-gtitle="${gi}" value="${esc(g.title)}" spellcheck="false" maxlength="40">
        <button class="mini-add" data-geye="${gi}" title="${g.hidden ? 'Показать группу' : 'Скрыть группу'}">${g.hidden ? I.eyeOff : I.eye}</button>
        ${isPl ? '' : `<button class="mini-add" data-gdel="${gi}" title="Удалить группу">${I.trash}</button>`}</div>`;
    } else {
      html += `<div class="overline">${esc(g.title)}${isPl ? `<button class="mini-add" data-navcmd="pl-new" title="Новый плейлист">${I.plus}</button>` : g.id === 'smart' ? `<button class="mini-add" data-navcmd="smart-new" title="Новая подборка по правилам">${I.plus}</button>` : ''}</div>`;
    }
    if (isPl) {
      html += edit ? '<div class="caption nav-pl-note">Здесь появляются твои плейлисты</div>' : '<div id="pl-list"></div>';
    } else {
      for (const { it, ii } of items) {
        const n = navInfo(it);
        if (edit) {
          html += `<div class="nav nav-e${it.hidden ? ' off' : ''}" draggable="true" data-gi="${gi}" data-ii="${ii}">
            <span class="grip">${I.grip}</span>${I[n.icon]}<span class="nav-label">${esc(n.label)}</span>
            <button class="mini-add" data-ieye="${gi}:${ii}" title="${it.hidden ? 'Показать' : 'Скрыть'}">${it.hidden ? I.eyeOff : I.eye}</button>
            ${n.pinned ? `<button class="mini-add" data-idel="${gi}:${ii}" title="Убрать из меню">${I.close}</button>` : ''}</div>`;
        } else {
          html += `<button class="nav" data-view="${n.view}"${n.param ? ` data-param="${esc(n.param)}"` : ''}${n.pinned ? ` data-pin="${gi}:${ii}"` : ''} title="${esc(n.label)}">${I[n.icon]}<span class="nav-label">${esc(n.label)}</span></button>`;
        }
      }
      if (edit && !g.items.length) html += `<div class="nav-drop" data-gi="${gi}">Перетащи сюда пункты</div>`;
    }
    html += '</div>';
  });
  if (edit) {
    html += `<div class="nav-edit-bar">
      <div class="caption">Перетаскивай пункты и группы, глаз скрывает пункт, название группы можно переписать. Альбомы, исполнителей, папки и жанры закрепляй через правый клик → «Закрепить в меню».</div>
      <div class="nav-edit-btns"><button class="btn" data-navcmd="add-group">${I.plus}Группа</button><button class="btn" data-navcmd="reset">${I.refresh}Сбросить</button><button class="btn primary" data-navcmd="done">${I.check}Готово</button></div></div>`;
  }
  const t = curTrack();
  html += `<button class="side-now" id="side-now" title="Экран воспроизведения">
      <div class="side-now-art" id="side-now-art">${t ? coverHtml(t.cover, true) : ''}</div>
      <div class="side-now-title body-strong" id="side-now-title">${t ? esc(t.title) : ''}</div>
      <div class="side-now-artist" id="side-now-artist">${t ? esc(t.artist || UNKNOWN_ARTIST) : ''}</div></button>
    <div class="side-bottom">
      <div id="scan-status" class="scan-status${S.scanning ? '' : ' hidden'}">Сканирую…<div class="scan-bar"><div></div></div></div>
      <button class="nav" data-view="settings" title="Настройки">${I.settings}<span class="nav-label">Настройки</span></button>
    </div>`;
  $('#sidebar').innerHTML = html;
  if (!edit) renderPlaylists();
  markSidebar();
}

export function saveSidebar() { saveSettings(); renderSidebar(); }

export function setNavMode(mode) {
  if (mode !== 'hidden') S.lastNavMode = mode;
  settings.sidebar.mode = mode;
  saveSidebar();
  setTimeout(() => S.vl && S.vl.update(true), 50);
}

export function toggleNav() {
  setNavMode(settings.sidebar.mode === 'hidden' ? (S.lastNavMode || 'full') : 'hidden');
}

export function startNavEdit() {
  S.navEdit = true;
  renderSidebar();
  $('#sidebar').scrollTop = 0;
}

export function pinToSidebar(view, param, label) {
  const sb = settings.sidebar;
  const id = `pin:${view}:${param}`;
  if (sb.groups.some((g) => g.items.some((it) => it.id === id))) { toast('Уже закреплено в меню'); return; }
  let g = sb.groups.find((x) => x.id === 'pinned');
  if (!g) { g = { id: 'pinned', title: 'Закреплённое', items: [] }; sb.groups.splice(1, 0, g); }
  g.hidden = false;
  g.items.push({ id, view, param, label });
  if (sb.mode === 'hidden') sb.mode = S.lastNavMode || 'full';
  saveSidebar();
  toast(`«${label}» закреплено в меню`);
}

export function sidebarMenu(e) {
  const pinEl = e.target.closest('[data-pin]');
  const m = settings.sidebar.mode;
  showMenu(`${pinEl ? `<button class="mi" data-m="unpin">${I.close}Открепить</button><div class="mi-sep"></div>` : ''}
    <button class="mi" data-m="edit">${I.edit}Настроить меню…</button>
    <button class="mi" data-m="${m === 'compact' ? 'full' : 'compact'}">${I.sidebar}${m === 'compact' ? 'Полное меню' : 'Компактное меню — только иконки'}</button>
    <button class="mi" data-m="hidden">${I.close}Скрыть меню <span class="grow"></span><span class="caption">Ctrl+B</span></button>`,
  e.clientX, e.clientY, (cmd) => {
    if (cmd === 'unpin') { const [gi, ii] = pinEl.dataset.pin.split(':').map(Number); settings.sidebar.groups[gi].items.splice(ii, 1); saveSidebar(); }
    else if (cmd === 'edit') startNavEdit();
    else setNavMode(cmd);
  });
}

export function bindSidebar() {
  const sbEl = $('#sidebar');
  sbEl.addEventListener('click', async (e) => {
    const t = e.target;
    const nc = t.closest('[data-navcmd]');
    if (nc) {
      e.stopPropagation();
      const c = nc.dataset.navcmd;
      if (c === 'pl-new') newPlaylist();
      else if (c === 'smart-new') smartEditor();
      else if (c === 'done') { S.navEdit = false; saveSidebar(); sbEl.scrollTop = 0; }
      else if (c === 'add-group') {
        settings.sidebar.groups.splice(settings.sidebar.groups.length - 1, 0, { id: 'g' + Date.now().toString(36), title: 'Новая группа', items: [] });
        saveSidebar();
        const inputs = $$('.nav-gtitle', sbEl);
        const inp = inputs[inputs.length - 2] || inputs[inputs.length - 1];
        if (inp) { inp.focus(); inp.select(); }
      } else if (c === 'reset') {
        if (await confirmModal('Сбросить меню?', 'Порядок, скрытые пункты, свои группы и закреплённое вернутся к исходным.', 'Сбросить')) {
          settings.sidebar = defaultSidebar(settings.sidebar.mode);
          saveSidebar();
        }
      }
      return;
    }
    const sb = settings.sidebar;
    const ie = t.closest('[data-ieye]');
    if (ie) { const [gi, ii] = ie.dataset.ieye.split(':').map(Number); const it = sb.groups[gi].items[ii]; it.hidden = !it.hidden; saveSidebar(); return; }
    const id = t.closest('[data-idel]');
    if (id) { const [gi, ii] = id.dataset.idel.split(':').map(Number); sb.groups[gi].items.splice(ii, 1); saveSidebar(); return; }
    const ge = t.closest('[data-geye]');
    if (ge) { const g = sb.groups[+ge.dataset.geye]; g.hidden = !g.hidden; saveSidebar(); return; }
    const gd = t.closest('[data-gdel]');
    if (gd) {
      const gi = +gd.dataset.gdel;
      const g = sb.groups[gi];
      // Встроенные пункты не пропадают: переезжают в первую другую группу.
      const keep = g.items.filter((it) => BUILTIN_NAV[it.id]);
      sb.groups.splice(gi, 1);
      const dest = sb.groups.find((x) => x.type !== 'playlists');
      if (dest) dest.items.push(...keep);
      saveSidebar();
      return;
    }
    if (S.navEdit) return;
    if (t.closest('#side-now')) { if (curTrack()) openNow(); return; }
    const b = t.closest('.nav[data-view]');
    if (b) go(b.dataset.view, b.dataset.param || null);
  });
  sbEl.addEventListener('change', (e) => {
    const gt = e.target.closest('[data-gtitle]');
    if (gt) { settings.sidebar.groups[+gt.dataset.gtitle].title = gt.value.trim() || 'Без названия'; saveSettings(); }
  });
  sbEl.addEventListener('keydown', (e) => { if (e.target.matches('.nav-gtitle') && e.key === 'Enter') e.target.blur(); });
  sbEl.addEventListener('contextmenu', (e) => {
    if (S.navEdit) { e.preventDefault(); return; }
    const b = e.target.closest('.nav[data-view="playlist"]');
    e.preventDefault();
    if (b && !b.dataset.pin) {
      const id = b.dataset.param;
      const pl = meta.playlists.find((p) => p.id === id);
      showMenu(`<button class="mi" data-m="play">${I.play}Слушать</button><button class="mi" data-m="rename">${I.edit}Переименовать</button><button class="mi" data-m="delete">${I.trash}Удалить</button>
        <div class="mi-sep"></div><button class="mi" data-m="edit-nav">${I.edit}Настроить меню…</button>`,
      e.clientX, e.clientY, (cmd) => { if (cmd === 'edit-nav') startNavEdit(); else playlistCmd(cmd, id); });
      return;
    }
    sidebarMenu(e);
  });

  // Перетаскивание пунктов и групп в режиме настройки
  let drag = null;
  const clearMarks = () => $$('.drag-over', sbEl).forEach((x) => x.classList.remove('drag-over'));
  sbEl.addEventListener('dragstart', (e) => {
    if (!S.navEdit) return;
    if (e.target.matches && e.target.matches('.nav-gtitle')) { e.preventDefault(); return; }
    const it = e.target.closest('[data-ii]');
    const gh = e.target.closest('[data-gdrag]');
    if (it) drag = { type: 'item', gi: +it.dataset.gi, ii: +it.dataset.ii };
    else if (gh) drag = { type: 'group', gi: +gh.dataset.gdrag };
    if (drag) e.dataTransfer.effectAllowed = 'move';
  });
  const targetOf = (e) => e.target.closest('[data-ii], .nav-drop, .nav-ghead, .nav-group');
  sbEl.addEventListener('dragover', (e) => {
    if (!drag) return;
    const t = targetOf(e);
    if (!t) return;
    const g = settings.sidebar.groups[+(t.dataset.gi ?? t.dataset.gdrag ?? t.closest('.nav-group').dataset.gi)];
    if (drag.type === 'item' && g && g.type === 'playlists') return;
    e.preventDefault();
    clearMarks();
    (drag.type === 'group' ? t.closest('.nav-group') : t).classList.add('drag-over');
  });
  sbEl.addEventListener('drop', (e) => {
    if (!drag) return;
    const t = targetOf(e);
    clearMarks();
    if (!t) { drag = null; return; }
    e.preventDefault();
    const sb = settings.sidebar;
    const gi2 = +(t.dataset.gi ?? t.dataset.gdrag ?? t.closest('.nav-group').dataset.gi);
    if (drag.type === 'group') {
      const [g] = sb.groups.splice(drag.gi, 1);
      sb.groups.splice(gi2 > drag.gi ? gi2 : gi2, 0, g);
    } else if (sb.groups[gi2] && sb.groups[gi2].type !== 'playlists') {
      const [it] = sb.groups[drag.gi].items.splice(drag.ii, 1);
      const dest = sb.groups[gi2].items;
      if (t.dataset.ii !== undefined) {
        let ii2 = +t.dataset.ii;
        if (drag.gi === gi2 && drag.ii < ii2) ii2--;
        dest.splice(ii2, 0, it);
      } else dest.push(it);
    }
    drag = null;
    saveSidebar();
  });
  sbEl.addEventListener('dragend', () => { drag = null; clearMarks(); });
}

export function renderPlaylists() {
  if (!$('#pl-list')) return;
  $('#pl-list').innerHTML = meta.playlists.map((p) => `<button class="nav" data-view="playlist" data-param="${esc(p.id)}">${I.playlist}<span class="pl-name">${esc(p.name)}</span></button>`).join('');
  markSidebar();
}

export async function newPlaylist(paths = []) {
  const name = await promptModal('Новый плейлист', '', 'Название');
  if (!name) return null;
  const pl = { id: 'p' + Date.now().toString(36), name, tracks: [...new Set(paths)], created: Date.now() };
  meta.playlists.push(pl);
  saveMeta();
  renderPlaylists();
  if (paths.length) toast(`Создан «${name}»`);
  return pl;
}

export function addToPlaylist(id, paths) {
  const pl = meta.playlists.find((p) => p.id === id);
  if (!pl) return;
  const have = new Set(pl.tracks);
  const add = paths.filter((p) => !have.has(p));
  pl.tracks.push(...add);
  saveMeta();
  toast(add.length ? `Добавлено в «${pl.name}»` : 'Уже есть в плейлисте');
  if (S.view.name === 'playlist' && S.view.param === id) render($('#content').scrollTop);
}

