// Проверка перевода: у каждой русской строки интерфейса есть английский вариант,
// а сам переводчик правильно подставляет значения.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EN } from '../../src/js/en.js';

const CYR = /[А-Яа-яЁё]/;
const dir = new URL('../../src/js/', import.meta.url);

/** Строковые литералы из JS: обычные и шаблонные, с ${…} вместо {0}, {1}… */
function literals(s) {
  const out = [];
  const n = s.length;
  const isEl = (e) => /^(I\.|I\[|\w*[Hh]tml\(|tog\(|sel\(|range\(|row\(|styleCard|.*\.map\()/.test(e);
  const regexAt = (i) => {
    let k = i - 1;
    while (k >= 0 && (s[k] === ' ' || s[k] === '\t')) k--;
    return k < 0 || '(,=:[!&|?{};'.includes(s[k]);
  };
  const skipRegex = (i) => {
    let j = i + 1, cls = false;
    while (j < n && s[j] !== '\n' && (cls || s[j] !== '/')) {
      if (s[j] === '\\') { j += 2; continue; }
      if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false;
      j++;
    }
    return j + 1;
  };
  const quoted = (i) => {
    const q = s[i];
    let j = i + 1;
    while (j < n && s[j] !== q && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
    const lit = s.slice(i + 1, j);
    if (CYR.test(lit)) out.push([lit]);
    return j + 1;
  };
  function template(i) {
    const parts = [];
    let buf = '';
    i++;
    while (i < n) {
      const c = s[i];
      if (c === '\\') { buf += s.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { parts.push(buf); out.push(parts); return i + 1; }
      if (c === '$' && s[i + 1] === '{') {
        parts.push(buf); buf = '';
        const j = expr(i + 2);
        parts.push(isEl(s.slice(i + 2, j - 1).trim()) ? { el: true } : null);
        i = j;
        continue;
      }
      buf += c; i++;
    }
    return i;
  }
  function expr(i) {
    let depth = 1;
    while (i < n) {
      const c = s[i];
      if (c === '/' && s[i + 1] !== '/' && s[i + 1] !== '*' && regexAt(i)) { i = skipRegex(i); continue; }
      if (c === '"' || c === "'") { i = quoted(i); continue; }
      if (c === '`') { i = template(i); continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i + 1;
      i++;
    }
    return i;
  }
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (s.startsWith('//', i)) { const j = s.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (s.startsWith('/*', i)) { const j = s.indexOf('*/', i); i = j < 0 ? n : j + 2; continue; }
    if (c === '"' || c === "'") { i = quoted(i); continue; }
    if (c === '`') { i = template(i); continue; }
    if (c === '/' && s[i + 1] !== '/' && s[i + 1] !== '*' && regexAt(i)) { i = skipRegex(i); continue; }
    i++;
  }
  return out;
}

function runs(parts) {
  const txt = parts.map((p) => (p === null ? '\u0000' : p && p.el ? '<el>' : p)).join('').replace(/\\n/g, '\n');
  const res = [];
  for (const seg of txt.split(/<[^<>]*>/)) {
    for (const line of seg.split('\n')) {
      const t = line.trim();
      if (!CYR.test(t)) continue;
      let k = 0;
      res.push(t.replace(/\u0000/g, () => `{${k++}}`).replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').replace(/\\\\/g, '\\').trim());
    }
  }
  return res;
}

test('у каждой строки интерфейса есть перевод', () => {
  const skip = new Set(['en.js', 'i18n.js', 'pure.js']);
  const missing = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && !skip.has(x))) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const parts of literals(src)) for (const r of runs(parts)) if (!(r in EN) && !/^[а-яё]$/.test(r)) missing.add(`${f}: ${r}`);
  }
  const html = fs.readFileSync(new URL('../index.html', dir), 'utf8');
  for (const m of html.matchAll(/>([^<>]*[А-Яа-яЁё][^<>]*)</g)) { const r = m[1].replace(/\s+/g, ' ').trim(); if (!(r in EN)) missing.add(`index.html: ${r}`); }
  for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]*[А-Яа-яЁё][^"]*)"/g)) if (!(m[1] in EN)) missing.add(`index.html: ${m[1]}`);
  assert.deepEqual([...missing], [], 'Добавь эти строки в src/js/en.js');
});

test('в переводе те же подстановки, что в оригинале', () => {
  for (const [ru, en] of Object.entries(EN)) {
    const a = [...ru.matchAll(/\{\d\}/g)].map((m) => m[0]).sort();
    const b = [...en.matchAll(/\{\d\}/g)].map((m) => m[0]).sort();
    assert.deepEqual(b, a, ru);
  }
});

test('переводчик: точные строки, шаблоны и вложенные значения', async () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ lang: 'en' }) };
  const { tr } = await import('../../src/js/i18n.js');
  assert.equal(tr('Настройки'), 'Settings');
  assert.equal(tr('Плейлист сохранён: 12 tracks'), 'Playlist saved: 12 tracks');
  assert.equal(tr('Импортировано плейлистов: 1, треков: 2, не найдено в медиатеке: 3'), 'Playlists imported: 1, tracks: 2, not in library: 3');
  assert.equal(tr('Добавить папку в медиатеку'), 'Add folder to library');
  assert.equal(tr('Свет из окна'), null); // чужой текст не трогаем
});
