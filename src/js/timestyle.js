// Glow для ПК — timestyle.js: стиль по времени суток. В выбранные часы включается свой стиль,
// после окна возвращается прежний. Если стиль поменяли вручную в окне, возврат не трогает его.

import { settings } from './state.js';
import { afterSetting } from './settings.js';
import { STYLES } from './theme.js';

let prevStyle = null;
let inWindow = false;

/** Попадает ли час в окно; окно может переходить через полночь (22 → 7). */
export function inTimeWindow(h, from, to) {
  if (from === to) return false;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

export function checkTimeStyle(now = new Date()) {
  const from = Number(settings.todFrom), to = Number(settings.todTo);
  const want = !!settings.todOn && !!STYLES[settings.todStyle] && inTimeWindow(now.getHours(), from, to);
  if (want && !inWindow) {
    inWindow = true;
    prevStyle = settings.style;
    if (settings.style !== settings.todStyle) { settings.style = settings.todStyle; afterSetting('style'); }
  } else if (!want && inWindow) {
    inWindow = false;
    if (prevStyle && settings.style === settings.todStyle) { settings.style = prevStyle; afterSetting('style'); }
    prevStyle = null;
  }
}

export function startTimeStyle() {
  checkTimeStyle();
  setInterval(() => checkTimeStyle(), 30000);
}
