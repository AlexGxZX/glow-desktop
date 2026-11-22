// Обновления Glow из GitHub Releases: проверка при запуске (раз в сутки) и по кнопке в настройках.

import { I } from './icons.js';
import { openModal } from './dialogs.js';
import { S, meta, saveMeta, settings } from './state.js';
import { $, APP_VERSION, TAURI, esc, invoke, toast } from './util.js';

const DAY = 24 * 60 * 60 * 1000;

/** manual — нажата кнопка: показываем и «у тебя последняя», и ошибки. */
export async function checkUpdates(manual = false) {
  if (!TAURI || S.updateBusy) return;
  if (!manual) {
    if (!settings.autoUpdate || Date.now() - (meta.updateChecked || 0) < DAY) return;
  }
  S.updateBusy = true;
  if (manual) toast('Проверяю обновления…', 8000);
  try {
    const u = await invoke('check_update');
    meta.updateChecked = Date.now();
    saveMeta();
    if (!u) { if (manual) toast(`У тебя последняя версия — ${APP_VERSION}`); return; }
    if (!manual && meta.updateSkip === u.version) return;
    if (manual) toast(`Найдена версия ${u.version}`, 1200);
    offer(u);
  } catch (e) {
    if (manual) toast(`Не удалось проверить обновления: ${String(e).slice(0, 140)}`, 6000);
    else console.warn('update', e);
  } finally {
    S.updateBusy = false;
  }
}

/** Описание релиза с GitHub: заголовки, списки, **жирный**, `код`, ссылки как текст. */
export function markdown(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  let html = '', list = false;
  for (const raw of String(src).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const li = /^[-*•]\s+(.*)$/.exec(line);
    if (li && li[1]) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (!line || /^[-*•]$/.test(line)) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    html += h ? `<div class="upd-h">${inline(h[1])}</div>` : `<p>${inline(line)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}

function offer(u) {
  const notes = (u.notes || '').trim();
  const m = openModal(`<div class="modal-head"><div class="heading">Вышел Glow ${esc(u.version)}</div><button class="icon-btn" data-close>${I.close}</button></div>
    <div class="muted" style="margin-bottom:12px">Сейчас у тебя ${esc(u.current)}. Плейлисты, настройки и стили сохранятся — Glow поставит обновление сам и перезапустится.</div>
    ${notes ? `<div class="upd-notes" data-noi18n>${markdown(notes)}</div>` : ''}
    <div class="upd-bar hidden"><div></div></div>
    <div class="modal-foot"><button class="btn" id="upd-skip">Пропустить версию</button><button class="btn" data-close>Позже</button><button class="btn primary" id="upd-go">${I.check}Обновить</button></div>`);
  $('#upd-skip', m.el).onclick = () => { meta.updateSkip = u.version; saveMeta(); m.close(); };
  $('#upd-go', m.el).onclick = async () => {
    const go = $('#upd-go', m.el);
    go.disabled = true;
    go.textContent = 'Скачиваю…';
    $('.upd-bar', m.el).classList.remove('hidden');
    let off = null;
    try {
      off = await TAURI.event.listen('update-progress', (e) => {
        const bar = $('.upd-bar > div', m.el);
        if (bar) bar.style.width = `${Math.round(e.payload * 100)}%`;
      });
      await invoke('install_update'); // при успехе Glow перезапустится
    } catch (e) {
      toast(`Обновление не удалось: ${String(e).slice(0, 140)}`, 6000);
      go.disabled = false;
      go.innerHTML = `${I.refresh}Ещё раз`;
    } finally {
      if (off) off();
    }
  };
}
