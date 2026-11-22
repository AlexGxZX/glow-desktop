// Glow для ПК — vprofiles.js: профили визуала (наборы настроек экрана воспроизведения).
// Встроенные профили и свои; свой профиль можно сохранить файлом .glowvis и передать другому.

import { BACKDROPS, MOTIONS, PART_PRESETS, QUALITIES } from './visuals.js';
import { SCENES } from './scenes.js';
import { I } from './icons.js';
import { confirmModal, promptModal } from './dialogs.js';
import { saveSettings, settings } from './state.js';
import { applyVisualSettings, refreshTheme, syncScene } from './ui.js';
import { esc, invoke, toast } from './util.js';

// Какие настройки входят в профиль.
export const VKEYS = ['backdrop', 'coverMotion', 'particles', 'partPreset', 'quality', 'partCount', 'beatSens', 'coverStrength', 'ringStrength', 'scene', 'nowBg', 'glow', 'animations'];

export const BUILTIN = [
  { id: 'calm', name: 'Спокойный', values: { backdrop: 'glow', coverMotion: 'breathe', particles: true, partPreset: 'dust', partCount: 0.6, beatSens: 0.2, coverStrength: 0.3, ringStrength: 0.2, quality: 'medium', glow: 0.5 } },
  { id: 'club', name: 'Клуб', values: { backdrop: 'lights', coverMotion: 'beat', particles: true, partPreset: 'sparks', partCount: 1.6, beatSens: 0.5, coverStrength: 0.8, ringStrength: 0.8, quality: 'high', scene: 'spectrum' } },
  { id: 'minimal', name: 'Минимал', values: { backdrop: 'glow', coverMotion: 'none', particles: false, coverStrength: 0, ringStrength: 0, scene: 'none', glow: 0.3 } },
];

const ENUM = { backdrop: BACKDROPS, coverMotion: MOTIONS, partPreset: PART_PRESETS, quality: QUALITIES, scene: { auto: 1, ...SCENES }, nowBg: { cover: 1, design: 1 } };
const NUM = { partCount: [0.5, 2], beatSens: [0, 1], coverStrength: [0, 1], ringStrength: [0, 1], glow: [0, 1] };
const BOOL = ['particles', 'animations'];

/** Оставляем только известные поля нужного типа: файл профиля может прийти от кого угодно. */
export function sanitize(v) {
  const out = {};
  for (const k of VKEYS) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    const x = v[k];
    if (ENUM[k]) {
      if (typeof x === 'string' && Object.prototype.hasOwnProperty.call(ENUM[k], x)) out[k] = x;
    } else if (NUM[k]) {
      if (typeof x === 'number' && isFinite(x)) out[k] = Math.min(NUM[k][1], Math.max(NUM[k][0], x));
    } else if (BOOL.includes(k) && typeof x === 'boolean') out[k] = x;
  }
  return out;
}

const customs = () => settings.visualProfiles || [];
const allProfiles = () => [...BUILTIN, ...customs()];

export function applyProfile(id) {
  const p = allProfiles().find((x) => x.id === id);
  if (!p) return;
  Object.assign(settings, sanitize(p.values));
  saveSettings();
  applyVisualSettings();
  syncScene();
  refreshTheme();
  toast(`Профиль «${p.name}» применён`);
}

export async function saveCurrent() {
  const name = await promptModal('Название профиля', '', 'Например: Вечер');
  if (!name) return;
  const values = {};
  for (const k of VKEYS) values[k] = settings[k];
  settings.visualProfiles = [...customs(), { id: 'u' + Date.now().toString(36), name: name.slice(0, 40), values }];
  saveSettings();
  toast('Профиль сохранён');
}

export async function removeProfile(id) {
  const p = customs().find((x) => x.id === id);
  if (!p) return;
  if (!(await confirmModal('Удалить профиль?', `«${esc(p.name)}» будет удалён из списка.`))) return;
  settings.visualProfiles = customs().filter((x) => x.id !== id);
  saveSettings();
}

export async function exportProfile(id) {
  const p = allProfiles().find((x) => x.id === id);
  if (!p) return;
  const content = JSON.stringify({ format: 'glowvis', version: 1, name: p.name, values: sanitize(p.values) }, null, 2);
  try {
    const ok = await invoke('save_profile', { name: `${p.name}.glowvis`, content });
    if (ok) toast('Профиль сохранён в файл');
  } catch (e) {
    toast(`Не удалось сохранить: ${e}`);
  }
}

export async function importProfile() {
  try {
    const path = await invoke('pick_profile');
    if (!path) return;
    const data = JSON.parse(await invoke('read_text', { path }));
    if (!data || data.format !== 'glowvis' || typeof data.values !== 'object') throw new Error('Файл не похож на профиль Glow');
    const name = String(data.name || 'Профиль').slice(0, 40);
    settings.visualProfiles = [...customs(), { id: 'u' + Date.now().toString(36), name, values: sanitize(data.values) }];
    saveSettings();
    toast(`Профиль «${name}» импортирован`);
  } catch (e) {
    toast(`Не удалось импортировать: ${e.message || e}`);
  }
}

/** Карточка профилей для раздела «Вид». */
export function profilesCard() {
  const row = (p, custom) => `<div class="set-row"><div class="lbl"><div>${esc(p.name)}</div>${custom ? '' : '<div class="caption">Встроенный профиль</div>'}</div>
    <div class="actions" style="margin:0">
      <button class="btn" data-cmd="vprof-apply" data-key="${p.id}">Применить</button>
      <button class="btn" data-cmd="vprof-export" data-key="${p.id}">${I.folder}Экспорт</button>
      ${custom ? `<button class="btn" data-cmd="vprof-del" data-key="${p.id}">${I.trash}Удалить</button>` : ''}
    </div></div>`;
  return `<div class="set-group"><div class="heading">Профили визуала</div><div class="set-card">
    <div class="set-row caption">Профиль — набор настроек экрана воспроизведения: фон, движение обложки, частицы, сцена и силы реакций. Свой профиль сохраняется файлом .glowvis и открывается на другом компьютере.</div>
    ${BUILTIN.map((p) => row(p, false)).join('')}
    ${customs().map((p) => row(p, true)).join('')}
    <div class="actions" style="margin:0 0 14px"><button class="btn primary" data-cmd="vprof-save">${I.plus}Сохранить текущие как профиль</button><button class="btn" data-cmd="vprof-import">${I.folder}Импорт .glowvis</button></div>
  </div></div>`;
}
