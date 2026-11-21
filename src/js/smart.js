// Glow для ПК — smart.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { openModal } from './dialogs.js';
import { row } from './settings.js';
import { saveSidebar } from './sidebar.js';
import { S, favs, meta, saveMeta, settings } from './state.js';
import { $, coll, esc, norm, shuffleArr, tracksWord } from './util.js';
import { go } from './views.js';

// ================= Умные подборки по правилам =================

export const SMART_FIELDS = {
  genre: ['Жанр', 'text'], artist: ['Исполнитель', 'text'], album: ['Альбом', 'text'], title: ['Название', 'text'],
  format: ['Формат', 'text'], folder: ['Папка', 'text'],
  year: ['Год', 'num'], rating: ['Оценка', 'num'], plays: ['Прослушиваний', 'num'],
  added: ['Добавлен, дней назад', 'num'], last: ['Слушал, дней назад', 'num'], duration: ['Длительность, мин', 'num'],
  favorite: ['В избранном', 'bool'],
};
export const SMART_OPS = {
  text: { has: 'содержит', eq: 'равно', not: 'не содержит', starts: 'начинается с' },
  num: { gt: 'больше', lt: 'меньше', eq: 'равно' },
  bool: { yes: 'да', no: 'нет' },
};
export const SMART_SORT = { random: 'Случайно', added: 'Недавно добавленные', plays: 'По прослушиваниям', rating: 'По оценке', last: 'Давно не слушал', title: 'По названию', artist: 'По исполнителю', year: 'По году' };

export function smartValue(t, f) {
  const now = Date.now() / 1000;
  switch (f) {
    case 'year': return parseInt(t.year, 10) || 0;
    case 'rating': return meta.ratings[t.path] || 0;
    case 'plays': return meta.plays[t.path] || 0;
    case 'added': return (now - (t.added || 0)) / 86400;
    case 'last': return meta.last[t.path] ? (now - meta.last[t.path]) / 86400 : 1e9;
    case 'duration': return (t.duration || 0) / 60;
    case 'favorite': return favs.has(t.path);
    default: return t[f] || '';
  }
}

export function ruleMatch(t, r) {
  const type = (SMART_FIELDS[r.field] || [])[1];
  const v = smartValue(t, r.field);
  if (type === 'bool') return r.op === 'yes' ? !!v : !v;
  if (type === 'num') { const x = parseFloat(r.value); if (Number.isNaN(x)) return true; return r.op === 'gt' ? v > x : r.op === 'lt' ? v < x : Math.round(v) === Math.round(x); }
  const a = norm(v), b = norm(r.value).trim();
  if (!b) return true;
  return r.op === 'eq' ? a === b : r.op === 'not' ? !a.includes(b) : r.op === 'starts' ? a.startsWith(b) : a.includes(b);
}

export function evalSmart(sl) {
  const rules = sl.rules || [];
  let list = S.tracks.filter((t) => !rules.length || (sl.match === 'any' ? rules.some((r) => ruleMatch(t, r)) : rules.every((r) => ruleMatch(t, r))));
  const by = {
    random: null,
    added: (a, b) => (b.added || 0) - (a.added || 0),
    plays: (a, b) => (meta.plays[b.path] || 0) - (meta.plays[a.path] || 0),
    rating: (a, b) => (meta.ratings[b.path] || 0) - (meta.ratings[a.path] || 0),
    last: (a, b) => (meta.last[a.path] || 0) - (meta.last[b.path] || 0),
    title: (a, b) => coll.compare(a.title, b.title),
    artist: (a, b) => coll.compare(a.artist, b.artist) || coll.compare(a.album, b.album),
    year: (a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0),
  }[sl.sort || 'random'];
  list = by ? list.sort(by) : shuffleArr(list);
  return sl.limit > 0 ? list.slice(0, sl.limit) : list;
}

export function ruleText(r) {
  const [label, type] = SMART_FIELDS[r.field] || ['?', 'text'];
  const op = SMART_OPS[type][r.op] || '';
  return type === 'bool' ? `${label}: ${op}` : `${label} ${op} ${r.value}`;
}

export function smartEditor(id = null) {
  const old = id ? meta.smartLists.find((x) => x.id === id) : null;
  const sl = old ? JSON.parse(JSON.stringify(old)) : { name: 'Новая подборка', match: 'all', rules: [{ field: 'rating', op: 'gt', value: '3' }], sort: 'random', limit: 0 };
  const m = openModal(`<div class="modal-head"><div class="heading">${old ? 'Изменить подборку' : 'Подборка по правилам'}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <input class="field" id="sm-name" value="${esc(sl.name)}" maxlength="60" spellcheck="false">
    <div class="sm-match">Треки, у которых выполняются <select class="select" id="sm-match"><option value="all">все условия</option><option value="any">любое условие</option></select></div>
    <div id="sm-rules" class="sm-rules"></div>
    <button class="btn" id="sm-add">${I.plus}Условие</button>
    <div class="sm-bottom"><label>Порядок <select class="select" id="sm-sort">${Object.entries(SMART_SORT).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      <label>Не больше <input class="field sm-limit" id="sm-limit" type="number" min="0" value="${sl.limit || ''}" placeholder="все"> треков</label></div>
    <div class="caption" id="sm-count" style="margin-top:12px"></div>
    <div class="modal-foot"><button class="btn" data-close>Отмена</button><button class="btn primary" id="sm-save">${I.check}Сохранить</button></div>`, { wide: true });
  const el = m.el;
  $('#sm-match', el).value = sl.match;
  $('#sm-sort', el).value = sl.sort;
  const draw = () => {
    $('#sm-rules', el).innerHTML = sl.rules.map((r, i) => {
      const type = SMART_FIELDS[r.field][1];
      return `<div class="sm-rule" data-ri="${i}">
        <select class="select" data-rf>${Object.entries(SMART_FIELDS).map(([k, [n]]) => `<option value="${k}" ${k === r.field ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <select class="select" data-ro>${Object.entries(SMART_OPS[type]).map(([k, n]) => `<option value="${k}" ${k === r.op ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ${type === 'bool' ? '<span></span>' : `<input class="field" data-rv value="${esc(r.value)}" ${type === 'num' ? 'type="number"' : ''} spellcheck="false">`}
        <button class="icon-btn" data-rx title="Убрать">${I.close}</button></div>`;
    }).join('') || '<div class="muted">Без условий — все треки медиатеки.</div>';
    count();
  };
  const count = () => { $('#sm-count', el).textContent = `Подходит сейчас: ${tracksWord(evalSmart({ ...sl, limit: 0 }).length)}`; };
  el.addEventListener('change', (e) => {
    const row = e.target.closest('[data-ri]');
    if (e.target.id === 'sm-match') sl.match = e.target.value;
    else if (e.target.id === 'sm-sort') sl.sort = e.target.value;
    else if (e.target.id === 'sm-limit') sl.limit = parseInt(e.target.value, 10) || 0;
    else if (row) {
      const r = sl.rules[+row.dataset.ri];
      if (e.target.hasAttribute('data-rf')) { r.field = e.target.value; const type = SMART_FIELDS[r.field][1]; r.op = Object.keys(SMART_OPS[type])[0]; r.value = ''; draw(); return; }
      if (e.target.hasAttribute('data-ro')) r.op = e.target.value;
    }
    count();
  });
  el.addEventListener('input', (e) => {
    const row = e.target.closest('[data-ri]');
    if (row && e.target.hasAttribute('data-rv')) { sl.rules[+row.dataset.ri].value = e.target.value; count(); }
    if (e.target.id === 'sm-name') sl.name = e.target.value;
  });
  el.addEventListener('click', (e) => {
    const x = e.target.closest('[data-rx]');
    if (x) { sl.rules.splice(+x.closest('[data-ri]').dataset.ri, 1); draw(); }
  });
  $('#sm-add', el).onclick = () => { sl.rules.push({ field: 'genre', op: 'has', value: '' }); draw(); };
  $('#sm-save', el).onclick = () => {
    sl.name = sl.name.trim() || 'Подборка';
    if (old) Object.assign(old, sl);
    else {
      sl.id = 's' + Date.now().toString(36);
      meta.smartLists.push(sl);
      // Новая подборка сразу появляется в меню, в группе «Подборки».
      const g = settings.sidebar.groups.find((x) => x.id === 'smart') || settings.sidebar.groups[0];
      g.items.push({ id: `pin:smartx:${sl.id}`, view: 'smartx', param: sl.id, label: sl.name });
    }
    saveMeta();
    saveSidebar();
    m.close();
    go('smartx', old ? old.id : sl.id, { replace: S.view.name === 'smartx' });
  };
  draw();
}

