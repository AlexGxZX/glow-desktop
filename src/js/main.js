// Glow для ПК — точка входа: запуск и связывание модулей.

import { I } from './icons.js';
import { STYLES, applyTheme } from './theme.js';
import { createEditor, registerCustom } from './editor.js';
import { confirmModal, openModal, promptModal } from './dialogs.js';
import { indexLrcFolder, relinkDialog } from './features.js';
import { bindUi } from './handlers.js';
import { applyDesktop, scan, watchFolders } from './library.js';
import { closeNow, next, playTracks, prev, restoreResume, togglePlay, updateButtons, updateNowPlaying } from './player.js';
import { setAppIcon } from './settings.js';
import { normalizeSidebar, renderSidebar } from './sidebar.js';
import { S, ambient, curTrack, editor, engine, saveSettings, setLibrary, settings, visuals, setEditor } from './state.js';
import { applyAudio, applyVisualSettings, refreshTheme } from './ui.js';
import { $, esc, fileSrc, invoke, toast } from './util.js';
import { render } from './views.js';
import { checkUpdates } from './updates.js';

// ================= Material 3: формы, волна от клика =================

/** Многоугольники с одинаковым числом точек — CSS плавно перетекает между ними. */
export function shapePolygon(fn, n = 72) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = fn(a);
    pts.push(`${(50 + r * 50 * Math.cos(a)).toFixed(2)}% ${(50 + r * 50 * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(',')})`;
}

export function initShapes() {
  const st = document.documentElement.style;
  st.setProperty('--shape-circle', shapePolygon(() => 1));
  st.setProperty('--shape-cookie', shapePolygon((a) => 0.9 + 0.1 * Math.cos(9 * a)));
  st.setProperty('--shape-flower', shapePolygon((a) => 0.84 + 0.16 * Math.cos(6 * a)));
  // Скруглённый квадрат (суперэллипс).
  st.setProperty('--shape-soft', shapePolygon((a) => {
    const c = Math.abs(Math.cos(a)), s2 = Math.abs(Math.sin(a));
    return 0.96 / Math.pow(Math.pow(c, 4) + Math.pow(s2, 4), 0.25);
  }));
}

export function bindRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (!document.body.classList.contains('md3') || settings.animations === false || e.button !== 0) return;
    const host = e.target.closest('.btn, .nav, .chip, .mi, .icon-btn, .row, .lrow, .q-item, .style-card');
    if (!host) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const sp = document.createElement('span');
    sp.className = 'ripple';
    sp.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.appendChild(sp);
    setTimeout(() => sp.remove(), 600);
  }, true);
}

/** Блик стекла и перелив голографии следуют за мышкой. */
export function bindPointerLight() {
  let raf = 0, mx = 0, my = 0;
  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const b = document.body.classList;
      if (!b.contains('liquid') && !b.contains('holo-style')) return;
      const st = document.documentElement.style;
      st.setProperty('--mx', `${mx}px`);
      st.setProperty('--my', `${my}px`);
      const hx = mx / window.innerWidth, hy = my / window.innerHeight;
      st.setProperty('--hx', hx.toFixed(3));
      st.setProperty('--hy', hy.toFixed(3));
      st.setProperty('--holo-tilt', `${((hx - 0.5) * 120).toFixed(1)}deg`);
    });
  }, { passive: true });
}

/** Шапка при прокрутке: название раздела, «Слушать» и «Наверх». */
export function bindScrollHead() {
  const c = $('#content'), head = $('#scroll-head');
  const upd = () => {
    const title = $('.view-head .display', c);
    // В настройках вместо шапки прилипают вкладки.
    const show = c.scrollTop > 180 && !!title && !c.querySelector('.set-tabs');
    head.classList.toggle('show', show);
    if (show) {
      $('#sh-title').textContent = title.textContent;
      $('#sh-play').style.display = S.viewList.length ? '' : 'none';
    }
  };
  c.addEventListener('scroll', upd, { passive: true });
  $('#sh-top').onclick = () => c.scrollTo({ top: 0, behavior: settings.animations === false ? 'auto' : 'smooth' });
  $('#sh-play').onclick = () => { if (S.viewList.length) playTracks(S.viewList, 0); };
}

// ================= Мини-плеер и системная панель =================

export function setMini(on) {
  S.mini = on;
  if (on && S.nowOpen) closeNow();
  document.body.classList.toggle('mini', on);
  invoke('set_mini', { mini: on }).catch(() => {});
  setTimeout(() => S.vl && S.vl.update(true), 300);
}

export function updateMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const t = curTrack();
  if (!t) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist || '', album: t.album || '',
      artwork: t.cover ? [{ src: fileSrc(t.cover), sizes: '512x512' }] : [],
    });
  } catch { /* ignore */ }
}

export function bindMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const h = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* не поддерживается */ } };
  h('play', () => { if (!engine.playing) togglePlay(); });
  h('pause', () => engine.pause());
  h('previoustrack', prev);
  h('nexttrack', next);
  h('seekto', (d) => engine.seek(d.seekTime));
  h('seekbackward', () => engine.seek(engine.time - 10));
  h('seekforward', () => engine.seek(engine.time + 10));
}

// ================= Запуск =================

export async function init() {
  settings.sidebar = normalizeSidebar(settings.sidebar);
  registerCustom();
  if (!STYLES[settings.style]) settings.style = 'aura';
  setEditor(createEditor({
    settings, I, esc, toast, openModal, confirmModal, promptModal, invoke,
    refreshTheme, applyVisualSettings, saveSettings,
    getPalette: () => S.palette,
    afterClose: () => { if (S.view.name === 'settings') render($('#content').scrollTop); },
  }));
  bindUi();
  initShapes();
  bindRipple();
  bindPointerLight();
  bindScrollHead();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (settings.md3Mode === 'system') refreshTheme(); });
  }
  bindMediaSession();
  applyAudio();
  applyVisualSettings();
  S.theme = applyTheme(settings, null);
  visuals.setTheme(S.theme);
  ambient.set(S.theme.fx, S.theme, settings.animations);
  renderSidebar();
  updateButtons();

  let lib = [];
  try { lib = await invoke('load_library'); } catch (e) { console.warn(e); }
  setLibrary(lib || []);
  render();
  restoreResume();
  updateNowPlaying();
  refreshTheme();
  indexLrcFolder();
  applyDesktop();
  watchFolders();
  setTimeout(() => checkUpdates(false), 8000);
  if (settings.scanOnStart && settings.folders.length) scan();
  else setTimeout(() => relinkDialog(false), 800);
  // Своя иконка окна; ярлыки уже обновлены при выборе, их не трогаем.
  if (settings.appIcon && settings.appIcon !== 'glow') setAppIcon(settings.appIcon, false);
}

init();

