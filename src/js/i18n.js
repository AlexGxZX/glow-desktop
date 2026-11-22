// Glow для ПК — перевод интерфейса.
// Интерфейс написан по-русски; для английского Glow на лету переводит текст на странице
// по словарю en.js. Названия треков, исполнителей, альбомов и тексты песен не трогаются.

import { EN } from './en.js';
import { LANG } from './util.js';

const CYR = /[А-Яа-яЁё]/;
// Где лежат пользовательские данные — их не переводим, даже если совпало со словом из словаря.
const SKIP = '.row, .r-title, .r-sub, .r-album, .card-title, .lyrics, #pb-title, #pb-artist, .now-title, .now-artist, .sh-title, [data-noi18n], textarea, .nav-pin, .vh-meta .pb-artist';

let exact = null, buckets = null, loose = null;

function compile() {
  exact = new Map();
  buckets = new Map();
  loose = [];
  for (const [ru, en] of Object.entries(EN)) {
    if (!ru.includes('{')) { exact.set(ru, en); continue; }
    const re = new RegExp('^' + ru.split(/(\{\d\})/).map((p) => (/^\{\d\}$/.test(p) ? '([\\s\\S]*?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
    const order = [...ru.matchAll(/\{(\d)\}/g)].map((m) => +m[1]);
    const t = { re, en, order };
    const prefix = ru.split('{')[0];
    if (prefix.length >= 2) {
      const k = prefix.slice(0, 2);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    } else loose.push(t);
  }
  // Длинные шаблоны первыми — они точнее.
  for (const list of buckets.values()) list.sort((a, b) => b.re.source.length - a.re.source.length);
  loose.sort((a, b) => b.re.source.length - a.re.source.length);
}

/** Значение внутри шаблона: целиком или, если перед ним склеилось число, — хвост («2, не найдено: 3»). */
function translateValue(v, depth) {
  if (!CYR.test(v)) return v;
  const whole = tr(v, depth + 1);
  if (whole != null) return whole;
  const first = v.search(CYR);
  for (let i = 1; i <= first; i++) {
    const rest = tr(v.slice(i), depth + 1);
    if (rest != null) return v.slice(0, i) + rest;
  }
  return v;
}

/** Перевести строку целиком. Возвращает null, если перевода нет. */
export function tr(text, depth = 0) {
  if (!exact) compile();
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  if (depth > 2 || !CYR.test(text)) return null;
  const cands = (buckets.get(text.slice(0, 2)) || []).concat(loose);
  for (const t of cands) {
    const m = t.re.exec(text);
    if (!m) continue;
    const vals = [];
    t.order.forEach((n, i) => { vals[n] = translateValue(m[i + 1], depth); });
    return t.en.replace(/\{(\d)\}/g, (_, n) => vals[+n] ?? '');
  }
  return null;
}

/** Для кода: перевод, если интерфейс английский, иначе исходная строка. */
export const t = (s) => (LANG === 'en' ? tr(s) ?? s : s);

function translateText(node) {
  const raw = node.nodeValue;
  if (!raw || !CYR.test(raw)) return;
  const p = node.parentElement;
  if (!p || p.closest(SKIP)) return;
  const s = raw.trim();
  const out = tr(s.replace(/\s+/g, ' '));
  if (out != null && out !== s) node.nodeValue = raw.replace(s, out);
}

const ATTRS = ['title', 'placeholder', 'aria-label'];
function translateAttrs(el) {
  if (el.closest && el.closest('[data-noi18n]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute && el.getAttribute(a);
    if (v && CYR.test(v)) { const out = tr(v.trim()); if (out != null) el.setAttribute(a, out); }
  }
}

function translateTree(root) {
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1) return;
  translateAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) translateText(n);
    else translateAttrs(n);
  }
}

export function initI18n() {
  document.documentElement.lang = LANG;
  if (LANG !== 'en') return;
  compile();
  translateTree(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateTree);
      else if (m.type === 'characterData') translateText(m.target);
      else if (m.type === 'attributes') translateAttrs(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
