// Glow для ПК — views.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { closeNow } from './player.js';
import { renderSettings, row } from './settings.js';
import { evalSmart, ruleText } from './smart.js';
import { S, SORTS, favs, meta, settings, sortTracks, stub, track } from './state.js';
import { albumCard, artistCard, emptyHtml, folderArt, folderCard, folderName, listMeta, mountList, viewHead } from './ui.js';
import { $, $$, UNKNOWN_ARTIST, esc, fmtLong, norm, plural, tracksWord } from './util.js';
import { renderDupes, renderWrapped } from './collection.js';

// ================= Навигация =================

export const VIEW_TITLES = {
  tracks: 'Треки', albums: 'Альбомы', artists: 'Исполнители', genres: 'Жанры', folders: 'Папки',
  favorites: 'Избранное', history: 'История', stats: 'Статистика', settings: 'Настройки', dupes: 'Дубликаты', wrapped: 'Итоги года',
};
export const SMART = {
  recent: 'Недавно добавленные', most: 'Часто слушаю', rated: 'Лучшие по оценкам', forgotten: 'Давно не слушал',
};

export function go(name, param = null, { replace = false } = {}) {
  if (!replace && (S.view.name !== name || S.view.param !== param)) S.back.push({ ...S.view, scroll: $('#content').scrollTop });
  if (S.back.length > 50) S.back.shift();
  S.view = { name, param };
  if (S.nowOpen) closeNow();
  render(0);
}

export function goBack() {
  const v = S.back.pop();
  if (!v) return;
  S.view = { name: v.name, param: v.param };
  render(v.scroll || 0);
}

export function markSidebar() {
  for (const b of $$('.nav')) {
    const on = b.dataset.view === S.view.name && (!b.dataset.param || b.dataset.param === String(S.view.param));
    b.classList.toggle('active', on);
  }
}

export function render(scroll = 0) {
  const c = $('#content');
  S.vl = null;
  S.viewList = [];
  const v = S.view;
  const libEmpty = !S.tracks.length;
  if (libEmpty && !['settings', 'playlist', 'stats'].includes(v.name)) {
    c.innerHTML = S.scanning
      ? emptyHtml('refresh', 'Сканирую музыку…', 'Это первое сканирование, дальше будет быстрее.')
      : emptyHtml('folder', 'Добавь папку с музыкой', 'Glow найдёт треки, обложки и теги во всех вложенных папках.',
        `<button class="btn primary" data-cmd="add-folder">${I.plus}Выбрать папку</button>`);
  } else {
    const fn = VIEWS[v.name] || VIEWS.tracks;
    fn(c, v.param);
  }
  markSidebar();
  c.scrollTop = scroll;
  S.vl && S.vl.update(true);
}

export const VIEWS = {
  tracks(c) {
    const list = sortTracks(S.tracks, settings.sort);
    c.innerHTML = viewHead({
      title: 'Треки', metaText: listMeta(list), noCover: true,
      extra: `<span class="spacer"></span><select class="select" data-set="sort">${Object.entries(SORTS).map(([k, n]) => `<option value="${k}" ${settings.sort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`,
    }) + '<div id="tl"></div>';
    mountList($('#tl'), list);
  },

  albums(c) {
    c.innerHTML = viewHead({ title: 'Альбомы', metaText: plural(S.albums.length, 'альбом', 'альбома', 'альбомов'), noCover: true, actions: false })
      + `<div class="grid">${S.albums.map(albumCard).join('')}</div>`;
  },

  album(c, key) {
    const a = S.albumByKey.get(key);
    if (!a) return VIEWS.albums(c);
    const metaText = `<a class="pb-artist" data-go="artist" data-key="${esc(a.artist)}">${esc(a.artist)}</a>${a.year ? ' · ' + esc(a.year) : ''} · ${listMeta(a.tracks)}`;
    c.innerHTML = viewHead({ title: a.name, metaText, cover: a.cover }) + '<div id="tl"></div>';
    mountList($('#tl'), a.tracks, { numbers: 'track' });
  },

  artists(c) {
    c.innerHTML = viewHead({ title: 'Исполнители', metaText: plural(S.artists.length, 'исполнитель', 'исполнителя', 'исполнителей'), noCover: true, actions: false })
      + `<div class="grid">${S.artists.map(artistCard).join('')}</div>`;
  },

  artist(c, name) {
    const r = S.artistByName.get(name);
    if (!r) return VIEWS.artists(c);
    const albums = [...r.albums].map((k) => S.albumByKey.get(k)).filter(Boolean).sort((x, y) => (y.year || '').localeCompare(x.year || ''));
    const list = r.tracks.length ? r.tracks : albums.flatMap((a) => a.tracks);
    c.innerHTML = viewHead({ title: r.name, metaText: `${plural(albums.length, 'альбом', 'альбома', 'альбомов')} · ${listMeta(list)}`, cover: r.cover, round: true })
      + (albums.length ? `<div class="section-title heading">Альбомы</div><div class="grid">${albums.map(albumCard).join('')}</div>` : '')
      + '<div class="section-title heading">Треки</div><div id="tl"></div>';
    mountList($('#tl'), list);
  },

  genres(c) {
    c.innerHTML = viewHead({ title: 'Жанры', metaText: plural(S.genres.length, 'жанр', 'жанра', 'жанров'), noCover: true, actions: false })
      + (S.genres.length
        ? `<div class="chips">${S.genres.map((g) => `<button class="chip" data-go="genre" data-key="${esc(g.name)}">${esc(g.name)} <span class="muted">${g.tracks.length}</span></button>`).join('')}</div>`
        : emptyHtml('genre', 'Жанров нет', 'В тегах треков не указан жанр.'));
  },

  genre(c, name) {
    const g = S.genres.find((x) => x.name === name);
    const list = g ? sortTracks(g.tracks, 'artist') : [];
    c.innerHTML = viewHead({ title: name, metaText: listMeta(list), noCover: true }) + '<div id="tl"></div>';
    mountList($('#tl'), list);
  },

  folders(c) {
    const grid = settings.folderView !== 'list';
    const toggle = `<span class="spacer"></span><div class="chips"><button class="chip${grid ? ' on' : ''}" data-cmd="folder-view" data-key="grid">Плитка</button><button class="chip${grid ? '' : ' on'}" data-cmd="folder-view" data-key="list">Список</button></div>`;
    c.innerHTML = viewHead({ title: 'Папки', metaText: plural(S.folders.length, 'папка', 'папки', 'папок'), noCover: true, actions: false, extra: toggle })
      + (grid
        ? `<div class="grid">${S.folders.map(folderCard).join('')}</div>`
        : `<div class="list-rows">${S.folders.map((f) => `<div class="lrow" data-go="folder" data-key="${esc(f.path)}"><div class="r-cover">${folderArt(f, true)}</div><div class="grow">${esc(f.path)}</div><span class="caption">${f.tracks.length}</span></div>`).join('')}</div>`);
  },

  folder(c, path) {
    const f = S.folders.find((x) => x.path === path);
    const list = f ? f.tracks : [];
    c.innerHTML = `<div class="view-head"><div class="vh-cover" data-folder-cover="${esc(path)}" title="Правый клик — сменить обложку">${f ? folderArt(f) : ''}</div><div class="vh-text">
        <h1 class="display">${esc(folderName(path))}</h1><div class="vh-meta">${esc(path)} · ${listMeta(list)}</div>
        <div class="actions"><button class="btn primary" data-cmd="play-all">${I.play}Слушать</button><button class="btn" data-cmd="shuffle-all">${I.shuffle}Перемешать</button>
        <button class="btn" data-cmd="reveal-folder" data-key="${esc(path)}">${I.folder}Открыть папку</button></div></div></div><div id="tl"></div>`;
    mountList($('#tl'), list);
  },

  favorites(c) {
    const list = [...favs].reverse().map((p) => S.byPath.get(p) || stub(p));
    c.innerHTML = viewHead({ title: 'Избранное', metaText: listMeta(list), noCover: true }) + '<div id="tl"></div>';
    if (!list.length) $('#tl').innerHTML = emptyHtml('heart', 'Пока пусто', 'Нажми на сердечко у трека, и он появится здесь.');
    else mountList($('#tl'), list);
  },

  history(c) {
    const seen = new Set(), list = [];
    for (let i = meta.history.length - 1; i >= 0 && list.length < 500; i--) {
      const h = meta.history[i];
      if (seen.has(h.p)) continue;
      seen.add(h.p);
      const t = S.byPath.get(h.p);
      if (!t) continue;
      list.push(Object.assign(Object.create(t), { _when: whenText(h.t) }));
    }
    c.innerHTML = viewHead({ title: 'История', metaText: `${plural(meta.history.length, 'прослушивание', 'прослушивания', 'прослушиваний')}`, noCover: true,
      extra: meta.history.length ? `<button class="btn danger" data-cmd="clear-history">${I.trash}Очистить</button>` : '' }) + '<div id="tl"></div>';
    if (!list.length) $('#tl').innerHTML = emptyHtml('history', 'История пуста', 'Здесь появятся треки, которые ты дослушал хотя бы до половины.');
    else mountList($('#tl'), list, { third: 'played' });
  },

  stats(c) {
    const plays = Object.values(meta.plays).reduce((a, b) => a + b, 0);
    const topTracks = Object.entries(meta.plays).filter(([p]) => S.byPath.has(p)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const byArtist = new Map();
    for (const [p, n] of Object.entries(meta.plays)) {
      const t = S.byPath.get(p);
      if (!t) continue;
      const a = t.artist || UNKNOWN_ARTIST;
      byArtist.set(a, (byArtist.get(a) || 0) + n);
    }
    const topArtists = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxA = topArtists[0] ? topArtists[0][1] : 1;
    const libTime = S.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    c.innerHTML = viewHead({ title: 'Статистика', noCover: true, actions: false, extra: `<button class="btn primary" data-go="wrapped">${I.star}Итоги года</button>` })
      + `<div class="stat-cards">
        <div class="stat"><div class="overline">Прослушиваний</div><div class="v">${plays}</div></div>
        <div class="stat"><div class="overline">Время в музыке</div><div class="v">${fmtLong(meta.listenSec || 0)}</div></div>
        <div class="stat"><div class="overline">Треков</div><div class="v">${S.tracks.length}</div></div>
        <div class="stat"><div class="overline">Альбомов</div><div class="v">${S.albums.length}</div></div>
        <div class="stat"><div class="overline">Исполнителей</div><div class="v">${S.artists.length}</div></div>
        <div class="stat"><div class="overline">Вся медиатека</div><div class="v">${fmtLong(libTime)}</div></div>
      </div>
      <div class="section-title heading">Топ исполнителей</div>
      ${topArtists.length ? `<div class="bars">${topArtists.map(([a, n]) => `<div class="bar-row"><div class="name lrow" style="height:auto;padding:0" data-go="artist" data-key="${esc(a)}">${esc(a)}</div><div class="bar-track"><div style="width:${(n / maxA) * 100}%"></div></div><div class="caption">${n}</div></div>`).join('')}</div>` : '<div class="muted">Пока нет прослушиваний.</div>'}
      <div class="section-title heading">Топ треков</div><div id="tl"></div>`;
    if (topTracks.length) mountList($('#tl'), topTracks.map(([p]) => S.byPath.get(p)));
  },

  smartx(c, id) {
    const sl = (meta.smartLists || []).find((x) => x.id === id);
    if (!sl) return VIEWS.tracks(c);
    const list = evalSmart(sl);
    const rules = sl.rules.map(ruleText).join(sl.match === 'any' ? ' или ' : ' и ');
    c.innerHTML = viewHead({ title: sl.name, metaText: `${listMeta(list)}${rules ? ' · ' + esc(rules) : ''}`, noCover: true,
      extra: `<button class="btn" data-cmd="smart-edit" data-key="${esc(id)}">${I.edit}Изменить</button><button class="btn danger" data-cmd="smart-del" data-key="${esc(id)}">${I.trash}Удалить</button>` }) + '<div id="tl"></div>';
    if (!list.length) $('#tl').innerHTML = emptyHtml('smart', 'Под эти условия ничего не подходит', 'Измени правила подборки.');
    else mountList($('#tl'), list);
  },

  smart(c, kind) {
    const now = Date.now() / 1000;
    let list = [];
    if (kind === 'recent') list = sortTracks(S.tracks, 'added').slice(0, 300);
    else if (kind === 'most') list = S.tracks.filter((t) => meta.plays[t.path]).sort((a, b) => meta.plays[b.path] - meta.plays[a.path]).slice(0, 200);
    else if (kind === 'rated') list = S.tracks.filter((t) => (meta.ratings[t.path] || 0) >= 4).sort((a, b) => meta.ratings[b.path] - meta.ratings[a.path] || (meta.plays[b.path] || 0) - (meta.plays[a.path] || 0));
    else if (kind === 'forgotten') list = S.tracks.filter((t) => (meta.plays[t.path] || 0) >= 2 && now - (meta.last[t.path] || 0) > 30 * 86400).sort((a, b) => (meta.last[a.path] || 0) - (meta.last[b.path] || 0)).slice(0, 200);
    c.innerHTML = viewHead({ title: SMART[kind] || 'Подборка', metaText: listMeta(list), noCover: true }) + '<div id="tl"></div>';
    if (!list.length) {
      const hint = { most: 'Послушай что-нибудь, и здесь появятся любимые треки.', rated: 'Поставь трекам 4–5 звёзд.', forgotten: 'Здесь будут треки, которые ты слушал, но давно не включал.' }[kind] || '';
      $('#tl').innerHTML = emptyHtml('smart', 'Пока пусто', hint);
    } else mountList($('#tl'), list);
  },

  playlist(c, id) {
    const pl = meta.playlists.find((p) => p.id === id);
    if (!pl) return VIEWS.tracks(c);
    const list = pl.tracks.map((p) => S.byPath.get(p) || stub(p));
    const missing = list.filter((t) => t.missing).length;
    c.innerHTML = viewHead({
      title: pl.name, metaText: listMeta(list) + (missing ? ` · <span style="color:#ff8a8a">не найдено: ${missing}</span>` : ''), noCover: true,
      extra: `<button class="btn" data-cmd="pl-export" data-key="${esc(id)}">${I.down}Экспорт .m3u</button><button class="btn" data-cmd="pl-rename" data-key="${esc(id)}">${I.edit}Переименовать</button><button class="btn danger" data-cmd="pl-delete" data-key="${esc(id)}">${I.trash}Удалить</button>`,
    }) + '<div id="tl"></div>';
    if (!list.length) $('#tl').innerHTML = emptyHtml('playlist', 'Плейлист пуст', 'Добавляй треки через правый клик → «В плейлист».');
    else mountList($('#tl'), list, { playlistId: id });
  },

  search(c, q) {
    const n = norm(q).trim();
    const words = n.split(/\s+/).filter(Boolean);
    const match = (s) => words.every((w) => s.includes(w));
    const tracks = S.tracks.filter((t) => match(t._s)).slice(0, 2000);
    const albums = S.albums.filter((a) => match(norm(`${a.name} ${a.artist}`))).slice(0, 12);
    const artists = S.artists.filter((r) => match(norm(r.name))).slice(0, 12);
    c.innerHTML = viewHead({ title: `«${q}»`, metaText: tracksWord(tracks.length), noCover: true, actions: tracks.length > 0 })
      + (artists.length ? `<div class="section-title heading">Исполнители</div><div class="grid">${artists.map(artistCard).join('')}</div>` : '')
      + (albums.length ? `<div class="section-title heading">Альбомы</div><div class="grid">${albums.map(albumCard).join('')}</div>` : '')
      + (tracks.length ? '<div class="section-title heading">Треки</div><div id="tl"></div>' : '');
    if (tracks.length) mountList($('#tl'), tracks);
    else if (!albums.length && !artists.length) c.insertAdjacentHTML('beforeend', emptyHtml('search', 'Ничего не нашлось', 'Попробуй другое слово.'));
  },

  settings(c) { renderSettings(c); },
  dupes(c) { renderDupes(c); },
  wrapped(c, year) { renderWrapped(c, year); },
};

export function whenText(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Сегодня, ${time}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Вчера, ${time}`;
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) + `, ${time}`;
}

