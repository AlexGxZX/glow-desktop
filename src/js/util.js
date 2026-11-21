// Glow для ПК — util.js (часть интерфейса, вынесена из main.js).


// ================= Утилиты =================

export const TAURI = window.__TAURI__;
/** Версия приложения — держать в одном месте с tauri.conf.json и Cargo.toml. */
export const APP_VERSION = '1.11.0';
export const invoke = (cmd, args) => (TAURI ? TAURI.core.invoke(cmd, args) : Promise.reject(new Error('Glow запущен не в приложении')));
export const fileSrc = (p) => (TAURI ? TAURI.core.convertFileSrc(p, 'stream') : p);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const coll = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
export const ROW = 52;
export const UNKNOWN_ARTIST = 'Неизвестный исполнитель';

export function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
export function fmtLong(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}
export function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`;
}
export const tracksWord = (n) => plural(n, 'трек', 'трека', 'треков');
export function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function baseName(p) { return String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, ''); }

export let toastTimer;
export function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

