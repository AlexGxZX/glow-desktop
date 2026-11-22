// Glow для ПК — util.js (часть интерфейса, вынесена из main.js).


// ================= Утилиты =================

export const TAURI = globalThis.__TAURI__;

/** Язык интерфейса: 'ru' или 'en'. Берётся из настроек до запуска остального кода. */
export const LANG = (() => {
  let v = 'auto';
  try { v = (JSON.parse(localStorage.getItem('glow.settings') || '{}').lang) || 'auto'; } catch { /* нет настроек */ }
  if (v === 'auto') v = /^(ru|uk|be|kk|uz|ky|tg)\b/i.test(navigator.language || '') ? 'ru' : 'en';
  return v === 'en' ? 'en' : 'ru';
})();
export const LOCALE = LANG === 'en' ? 'en-US' : 'ru-RU';
/** Версия приложения — держать в одном месте с tauri.conf.json и Cargo.toml. */
export const APP_VERSION = '1.14.0';
export const invoke = (cmd, args) => (TAURI ? TAURI.core.invoke(cmd, args) : Promise.reject(new Error('Glow запущен не в приложении')));
export const fileSrc = (p) => (TAURI ? TAURI.core.convertFileSrc(p, 'stream') : p);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const coll = new Intl.Collator(['ru', 'en'], { sensitivity: 'base', numeric: true });
export const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
export const ROW = 52;
export const UNKNOWN_ARTIST = LANG === 'en' ? 'Unknown artist' : 'Неизвестный исполнитель';

export function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
export function fmtLong(sec) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (LANG === 'en') return h ? `${h} h ${m} min` : `${m} min`;
  return h ? `${h} ч ${m} мин` : `${m} мин`;
}
// Английские формы для слов, которые склоняются по числу.
const PLURAL_EN = {
  трек: ['track', 'tracks'], альбом: ['album', 'albums'], исполнитель: ['artist', 'artists'], папка: ['folder', 'folders'],
  жанр: ['genre', 'genres'], час: ['hour', 'hours'], минута: ['minute', 'minutes'], день: ['day', 'days'],
  прослушивание: ['play', 'plays'], файл: ['file', 'files'], плейлист: ['playlist', 'playlists'],
};
/** Слово в нужной форме без числа: 1 трек, 2 трека, 5 треков (или track/tracks). */
export function pluralWord(n, one, few, many) {
  if (LANG === 'en' && PLURAL_EN[one]) return PLURAL_EN[one][n === 1 ? 0 : 1];
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}
export function plural(n, one, few, many) {
  return `${n} ${pluralWord(n, one, few, many)}`;
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

