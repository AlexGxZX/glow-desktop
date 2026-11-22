// Редактор своего стиля.
// Стиль состоит из слоёв: базовая тема, акцент, формы, типографика, эффекты, экран плеера и свой CSS.
// Любой слой и любой параметр можно сбросить к исходному стилю, на котором основан свой.
// Черновик сохраняется сам, у сохранённого стиля хранится история версий, есть отмена шагов.

import { LOCALE } from './util.js';
import { STYLES, md3Scheme, contrast, mix, hexToRgb, rgbToHex, rgbToHsl, hslToHex } from './theme.js';
import { BACKDROPS, MOTIONS } from './visuals.js';

// ---------- Цвета ----------

/** Любой цвет стиля → { hex: '#rrggbb', a: 0…1 }. */
export function parseColor(str) {
  const s = String(str || '').trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return { hex: '#' + m[1].split('').map((c) => c + c).join('').toLowerCase(), a: 1 };
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return { hex: '#' + m[1].toLowerCase(), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { hex: rgbToHex([+m[1], +m[2], +m[3]]), a: m[4] !== undefined ? +m[4] : 1 };
  return { hex: '#808080', a: 1 };
}

export function toColor(hex, a = 1) {
  if (a >= 0.995) return hex;
  return hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
}

const normColor = (c) => { const p = parseColor(c); return toColor(p.hex, p.a); };

// ---------- Схема слоёв ----------

const FONTS = { system: 'Системный', helvetica: 'Helvetica / Arial', bahnschrift: 'Bahnschrift', georgia: 'Georgia (с засечками)', mono: 'Моноширинный', rounded: 'Округлый' };
const PARTICLES = { dot: 'Светящиеся точки', square: 'Квадраты', bubble: 'Пузырьки', spark: 'Искры', streak: 'Неоновые штрихи', star: 'Звёздочки', prism: 'Перламутровые ромбики' };

export const LAYERS = {
  theme: {
    title: 'Базовая тема', hint: 'Фон, поверхности и текст',
    fields: [
      ['bg', 'color', 'Фон'],
      ['surface', 'color', 'Карточки и наведение'],
      ['strong', 'color', 'Панели: плеер, очередь, меню'],
      ['text', 'color', 'Текст'],
      ['muted', 'color', 'Второстепенный текст'],
      ['line', 'color', 'Линии и рамки'],
      ['light', 'toggle', 'Светлая тема'],
    ],
  },
  accent: {
    title: 'Акцент', hint: 'Цвет свечения, прогресса и активных элементов',
    fields: [
      ['source', 'select', 'Откуда цвет', { cover: 'Из обложки', fixed: 'Свой', mix: 'Смешать со своим', md3: 'Вся палитра из обложки (Material You)' }],
      ['color', 'color', 'Свой цвет'],
      ['btn', 'select', 'Главная кнопка', { text: 'Цвета текста', accent: 'Цвета акцента', outline: 'Контур', glass: 'Полупрозрачная' }],
    ],
  },
  shape: {
    title: 'Формы', hint: 'Скругления и набор элементов',
    fields: [
      ['radius', 'range', 'Скругление карточек', 0, 32, 1, 'px'],
      ['cover', 'range', 'Скругление обложек', 0, 48, 1, 'px'],
      ['kit', 'select', 'Элементы', { glow: 'Glow', md3: 'Material 3' }],
    ],
  },
  type: {
    title: 'Типографика', hint: 'Заголовки',
    fields: [
      ['font', 'select', 'Шрифт заголовков', FONTS],
      ['weight', 'range', 'Насыщенность', 300, 900, 100, ''],
      ['upper', 'toggle', 'Заголовки капсом'],
    ],
  },
  effects: {
    title: 'Эффекты', hint: 'Свечение, живой фон, стекло',
    fields: [
      ['glow', 'range', 'Сила свечения', 0, 1.2, 0.05, ''],
      ['fx', 'select', 'Живой фон окна', { none: 'Нет', aurora: 'Северное сияние', space: 'Космос', ambient: 'Цветные пятна', liquid: 'Жидкие пятна под стеклом', holo: 'Перламутр' }],
      ['art', 'select', 'Обложка за окном', { none: 'Нет', glass: 'Яркая, как стекло', mica: 'Приглушённая, как Mica' }],
      ['blur', 'toggle', 'Размытие панелей'],
      ['neon', 'toggle', 'Неоновые контуры'],
      ['borders', 'toggle', 'Рамки вместо теней'],
      ['paper', 'toggle', 'Текстура бумаги'],
      ['holo', 'toggle', 'Голографические акценты'],
    ],
  },
  player: {
    title: 'Экран плеера', hint: 'Фон, обложка и частицы',
    fields: [
      ['backdrop', 'select', 'Фон', BACKDROPS],
      ['motion', 'select', 'Движение обложки', MOTIONS],
      ['particle', 'select', 'Форма частиц', PARTICLES],
      ['particles', 'toggle', 'Частицы в бит'],
    ],
  },
};

// ---------- Пресеты слоёв ----------

const P_SHAPE = {
  swiss: ['Swiss — квадратные', { radius: 0, cover: 0, kit: 'glow' }],
  noir: ['Neo-Noir — почти без скруглений', { radius: 4, cover: 4, kit: 'glow' }],
  paper: ['Paper — карточки каталога', { radius: 6, cover: 3, kit: 'glow' }],
  nordic: ['Nordic — аккуратные', { radius: 10, cover: 10, kit: 'glow' }],
  md3: ['Material 3', { radius: 16, cover: 24, kit: 'md3' }],
  aura: ['Aura — мягкие', { radius: 20, cover: 28, kit: 'glow' }],
  glass: ['Liquid Glass — крупные', { radius: 28, cover: 30, kit: 'glow' }],
  pill: ['Пилюли', { radius: 32, cover: 48, kit: 'glow' }],
};
const P_TYPE = {
  glow: ['Glow — системный жирный', { font: 'system', weight: 700, upper: false }],
  swiss: ['Swiss — плотный капс', { font: 'helvetica', weight: 800, upper: true }],
  paper: ['Paper — с засечками', { font: 'georgia', weight: 400, upper: false }],
  noir: ['Neo-Noir — Bahnschrift капсом', { font: 'bahnschrift', weight: 700, upper: true }],
  md3: ['Material 3 — тонкий', { font: 'system', weight: 400, upper: false }],
  soft: ['Soft — спокойный', { font: 'system', weight: 600, upper: false }],
  studio: ['Studio — моноширинный', { font: 'mono', weight: 600, upper: false }],
  rounded: ['Округлый', { font: 'rounded', weight: 700, upper: false }],
};
const FX0 = { glow: 0.75, fx: 'none', art: 'none', blur: false, neon: false, borders: false, paper: false, holo: false };
const P_EFFECTS = {
  none: ['Без эффектов', { ...FX0, glow: 0 }],
  aura: ['Aura — свечение', { ...FX0, glow: 1 }],
  aurora: ['Aurora — сияние', { ...FX0, glow: 1.1, fx: 'aurora', blur: true }],
  space: ['Deep Space — космос', { ...FX0, glow: 0.95, fx: 'space', blur: true }],
  ambient: ['Ambient — пятна', { ...FX0, glow: 0.7, fx: 'ambient', blur: true }],
  glass: ['Liquid Glass — стекло', { ...FX0, glow: 0, art: 'glass', blur: true }],
  mica: ['Fluent — Mica', { ...FX0, glow: 0.2, art: 'mica', blur: true }],
  noir: ['Neo-Noir — неон', { ...FX0, glow: 0.6, neon: true }],
  holo: ['Holographic — переливы', { ...FX0, glow: 0.6, holo: true }],
  paper: ['Paper — бумага', { ...FX0, glow: 0.1, paper: true, borders: true }],
  soft: ['Soft Dark — рамки', { ...FX0, glow: 0.12, borders: true }],
};
const P_PLAYER = {
  aura: ['Свечение и бит', { backdrop: 'glow', motion: 'beat', particle: 'dot', particles: true }],
  blur: ['Размытая обложка, дыхание', { backdrop: 'blur', motion: 'breathe', particle: 'bubble', particles: true }],
  lights: ['Световые пятна, параллакс', { backdrop: 'lights', motion: 'parallax', particle: 'dot', particles: true }],
  waves: ['Жидкие волны, Ken Burns', { backdrop: 'waves', motion: 'kenburns', particle: 'dot', particles: false }],
  space: ['Частицы и звёзды', { backdrop: 'particles', motion: 'beat', particle: 'star', particles: true }],
  neon: ['Неон', { backdrop: 'glow', motion: 'beat', particle: 'streak', particles: true }],
  calm: ['Спокойный минимум', { backdrop: 'glow', motion: 'none', particle: 'dot', particles: false }],
};
const P_ACCENT = {
  cover: ['Из обложки, кнопка цвета текста', { source: 'cover', btn: 'text' }],
  coverBtn: ['Из обложки, кнопка цвета акцента', { source: 'cover', btn: 'accent' }],
  fixed: ['Свой цвет', { source: 'fixed', btn: 'accent' }],
  neon: ['Неоновый контур', { source: 'fixed', color: '#ff2e63', btn: 'outline' }],
  md3: ['Material You из обложки', { source: 'md3', btn: 'accent' }],
  glass: ['Стеклянная кнопка', { source: 'cover', btn: 'glass' }],
};

// ---------- Преобразования ----------

const clone = (o) => JSON.parse(JSON.stringify(o));
const FONT_OF = { swiss: 'helvetica', noir: 'bahnschrift', paper: 'georgia' };

/** Слои любого стиля — встроенного или своего. */
export function styleToLayers(id, settings) {
  const st = STYLES[id] || STYLES.aura;
  if (st.user && st.layers) return clone(st.layers);
  return {
    theme: {
      bg: normColor(st.bg), surface: normColor(st.surface), strong: normColor(st.strong),
      text: normColor(st.text), muted: normColor(st.muted), line: normColor(st.line), light: !!st.light,
    },
    accent: {
      source: st.mono || st.md3 ? 'fixed' : 'cover', color: parseColor(st.accent).hex,
      btn: st.btnAccent || st.md3 ? 'accent' : st.neon ? 'outline' : st.glass ? 'glass' : 'text',
    },
    shape: { radius: st.radius, cover: st.cover, kit: st.md3 ? 'md3' : 'glow' },
    type: {
      font: FONT_OF[id] || 'system',
      weight: id === 'swiss' ? 800 : id === 'paper' || st.md3 ? 400 : id === 'soft' || id === 'nordic' ? 600 : 700,
      upper: id === 'swiss' || !!st.neon,
    },
    effects: {
      glow: st.glow, fx: st.fx || 'none', art: st.glass ? 'glass' : st.mica ? 'mica' : 'none',
      blur: !!(st.blur || st.glass), neon: !!st.neon, borders: !!st.borders, paper: id === 'paper', holo: false,
    },
    player: {
      backdrop: settings.backdrop || 'glow', motion: settings.coverMotion || 'beat',
      particle: st.particle || 'dot', particles: settings.particles !== false,
    },
  };
}

/** Свой стиль → объект стиля, который понимает applyTheme. */
export function customToStyle(c) {
  const L = c.layers;
  return {
    user: true, layers: c.layers, name: c.name, sub: 'Свой стиль', base: c.base, look: L.look,
    bg: L.theme.bg, text: L.theme.text, muted: L.theme.muted, surface: L.theme.surface,
    strong: L.theme.strong, line: L.theme.line, light: L.theme.light,
    accent: L.accent.color, accentSource: L.accent.source, btnMode: L.accent.btn,
    btn: L.theme.text, onBtn: L.theme.bg,
    glow: L.effects.glow, radius: L.shape.radius, cover: L.shape.cover, kit: L.shape.kit,
    font: L.type.font, weight: L.type.weight, upper: L.type.upper,
    fx: L.effects.fx === 'none' ? null : L.effects.fx,
    glass: L.effects.art === 'glass', mica: L.effects.art === 'mica',
    blur: L.effects.blur, neon: L.effects.neon, borders: L.effects.borders,
    paperTex: L.effects.paper, holo: L.effects.holo,
    particle: L.player.particle, player: L.player, css: c.css || '',
  };
}

// ---------- Хранилище своих стилей ----------

const KEY = 'glow.customStyles';
const DRAFT = 'glow.styleDraft';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } };

export function loadCustom() { return lsGet(KEY, []); }
function saveCustom(list) { lsSet(KEY, list); }

/** Добавляет свои стили в общий список стилей. */
export function registerCustom() {
  for (const k of Object.keys(STYLES)) if (STYLES[k].user && k !== '__edit') delete STYLES[k];
  for (const c of loadCustom()) STYLES[c.id] = customToStyle(c);
}

/** Проверка и нормализация импортированного стиля. */
export function sanitizeImported(obj) {
  if (!obj || typeof obj !== 'object' || !obj.layers) throw new Error('Это не файл стиля Glow');
  const base = styleToLayers('aura', {});
  const out = { name: String(obj.name || 'Импортированный стиль').slice(0, 60), base: STYLES[obj.base] && !STYLES[obj.base].user ? obj.base : 'aura', layers: {}, css: String(obj.css || '').slice(0, 20000) };
  for (const [ln, def] of Object.entries(LAYERS)) {
    out.layers[ln] = {};
    for (const [key, type, , a] of def.fields) {
      const v = obj.layers[ln] ? obj.layers[ln][key] : undefined;
      let ok = false;
      if (type === 'color') ok = typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v);
      else if (type === 'toggle') ok = typeof v === 'boolean';
      else if (type === 'range') ok = typeof v === 'number' && Number.isFinite(v);
      else if (type === 'select') ok = typeof v === 'string' && Object.prototype.hasOwnProperty.call(a, v);
      out.layers[ln][key] = ok ? v : base[ln][key];
    }
  }
  return out;
}

// ---------- Сам редактор ----------

export function createEditor(ctx) {
  const { settings, I, esc, toast, openModal, confirmModal, promptModal, invoke } = ctx;
  let st = null; // { targetId, base, name, layers, css }
  let baseLayers = null;
  let hist = [], hidx = -1, histTimer = null, draftTimer = null, dirty = false, prevStyle = null, draftAt = 0;
  const open = { theme: true, accent: true, shape: false, type: false, effects: false, player: false, css: false };
  const panel = document.getElementById('editor');

  const get = (path) => { const [l, k] = path.split('.'); return st.layers[l][k]; };
  const set = (path, v) => { const [l, k] = path.split('.'); st.layers[l][k] = v; };
  const baseVal = (path) => { const [l, k] = path.split('.'); return baseLayers[l][k]; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function snapshot() { return clone({ name: st.name, layers: st.layers, css: st.css }); }

  let applyRaf = 0, lastPlayer = '';
  function apply() {
    // Ползунки и пипетка шлют десятки событий в секунду — перекрашиваем не чаще одного раза за кадр.
    if (applyRaf) return;
    applyRaf = requestAnimationFrame(() => {
      applyRaf = 0;
      if (!st) return;
      STYLES.__edit = customToStyle({ name: st.name, base: st.base, layers: st.layers, css: st.css });
      ctx.refreshTheme();
      // Экран плеера (фон, частицы) перезапускаем, только если менялся его слой, — иначе частицы дёргаются.
      const pl = JSON.stringify(st.layers.player);
      if (pl !== lastPlayer) { lastPlayer = pl; ctx.applyVisualSettings(); }
    });
  }

  function changed({ rerender = true, history = true } = {}) {
    dirty = true;
    apply();
    if (history) {
      clearTimeout(histTimer);
      histTimer = setTimeout(() => {
        const snap = snapshot();
        if (hidx >= 0 && same(hist[hidx], snap)) return;
        hist = hist.slice(0, hidx + 1);
        hist.push(snap);
        if (hist.length > 100) hist.shift();
        hidx = hist.length - 1;
        renderHead();
      }, 350);
    }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 600);
    if (rerender) renderBody();
  }

  function saveDraft() {
    if (!st) return;
    draftAt = Date.now();
    lsSet(DRAFT, { targetId: st.targetId, base: st.base, at: draftAt, ...snapshot() });
    renderHead();
  }

  // ---------- Открыть / закрыть ----------

  async function openEditor({ targetId = null, base = null } = {}) {
    lastPlayer = '';
    if (st) { toast('Редактор уже открыт'); return; }
    const list = loadCustom();
    const target = targetId ? list.find((c) => c.id === targetId) : null;
    const src = !target && base && STYLES[base] && STYLES[base].user ? list.find((c) => c.id === base) : null;
    let baseId, startLayers, css = '', name;
    if (target) {
      // Правка своего стиля: сброс возвращает к последнему сохранению.
      baseId = target.base; startLayers = clone(target.layers); css = target.css || ''; name = target.name;
    } else if (src) {
      baseId = src.base; startLayers = clone(src.layers); css = src.css || ''; name = `${src.name} (копия)`;
    } else {
      baseId = STYLES[base] ? base : 'aura';
      startLayers = styleToLayers(baseId, settings);
      name = `Мой стиль на основе ${STYLES[baseId].name}`;
    }
    st = { targetId: target ? target.id : null, base: baseId, name, layers: startLayers, css, savedReset: !!target };
    baseLayers = clone(startLayers);

    // Черновик того же стиля — предложить восстановить.
    const draft = lsGet(DRAFT, null);
    if (draft && draft.targetId === st.targetId && (!target || draft.at > (target.updated || 0)) && draft.layers) {
      const ok = await confirmModal('Восстановить черновик?', `Есть несохранённые изменения от ${new Date(draft.at).toLocaleString(LOCALE)}.`, 'Восстановить');
      if (ok) { st.name = draft.name; st.layers = draft.layers; st.css = draft.css || ''; dirty = true; }
    }

    hist = [snapshot()]; hidx = 0; dirty = dirty || false;
    prevStyle = settings.style;
    settings.style = '__edit';
    document.body.classList.add('editing');
    panel.classList.remove('hidden');
    apply();
    render();
  }

  async function close(force = false) {
    if (!st) return;
    if (!force && dirty) {
      const ok = await confirmModal('Закрыть без сохранения?', 'Черновик останется — его можно будет восстановить при следующем открытии.', 'Закрыть');
      if (!ok) return;
    }
    clearTimeout(draftTimer);
    if (dirty && !force) saveDraft();
    st = null;
    settings.style = STYLES[prevStyle] ? prevStyle : 'aura';
    delete STYLES.__edit;
    panel.classList.add('hidden');
    document.body.classList.remove('editing');
    ctx.saveSettings();
    ctx.refreshTheme();
    ctx.applyVisualSettings();
    ctx.afterClose();
  }

  function save() {
    const list = loadCustom();
    const now = Date.now();
    const data = snapshot();
    if (!data.name.trim()) data.name = 'Мой стиль';
    let item = st.targetId ? list.find((c) => c.id === st.targetId) : null;
    if (item) {
      item.versions = item.versions || [];
      item.versions.unshift({ at: item.updated || now, name: item.name, layers: item.layers, css: item.css || '' });
      item.versions = item.versions.slice(0, 20);
      Object.assign(item, data, { updated: now });
    } else {
      item = { id: 'u' + now.toString(36), base: st.base, created: now, updated: now, versions: [], ...data };
      list.push(item);
      st.targetId = item.id;
    }
    saveCustom(list);
    localStorage.removeItem(DRAFT);
    registerCustom();
    prevStyle = item.id;
    dirty = false;
    toast(`Стиль «${item.name}» сохранён`);
    close(true);
  }

  // ---------- Отмена шагов ----------

  function undo() { if (hidx > 0) { hidx--; restore(hist[hidx]); } }
  function redo() { if (hidx < hist.length - 1) { hidx++; restore(hist[hidx]); } }
  function restore(snap) {
    st.name = snap.name; st.layers = clone(snap.layers); st.css = snap.css;
    dirty = true; apply(); render();
  }

  // ---------- История версий ----------

  function showVersions() {
    const item = st.targetId ? loadCustom().find((c) => c.id === st.targetId) : null;
    const versions = item ? item.versions || [] : [];
    const rows = versions.map((v, i) => `<div class="ver-row"><div><div class="body-strong">${esc(v.name)}</div><div class="caption">${new Date(v.at).toLocaleString(LOCALE)}</div></div><button class="btn" data-ver="${i}">Открыть</button></div>`).join('');
    const m = openModal(`<div class="modal-head"><div class="heading">История версий</div><button class="icon-btn" data-close>${I.close}</button></div>
      ${rows ? `<div class="caption" style="margin-bottom:10px">При каждом сохранении предыдущая версия попадает сюда, хранятся последние 20. «Открыть» загружает версию в редактор — сохрани, чтобы закрепить.</div><div class="ver-list">${rows}</div>`
        : '<div class="muted">Пока нет предыдущих версий. Они появятся после второго сохранения стиля.</div>'}`);
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ver]');
      if (!b) return;
      const v = versions[+b.dataset.ver];
      restore({ name: v.name, layers: v.layers, css: v.css });
      changed({ rerender: false });
      m.close();
      toast('Версия загружена в редактор');
    });
  }

  // ---------- Пресеты и сбросы ----------

  function presetOptions(layer) {
    const named = { shape: P_SHAPE, type: P_TYPE, effects: P_EFFECTS, player: P_PLAYER, accent: P_ACCENT }[layer];
    let html = '<option value="">Пресет…</option>';
    if (named) html += Object.entries(named).map(([k, [n]]) => `<option value="n:${k}">${esc(n)}</option>`).join('');
    if (layer === 'theme') {
      html += '<option value="seed">Из одного цвета…</option><option value="cover">Из обложки играющего трека</option>';
    }
    if (layer === 'theme' || layer === 'accent') {
      html += '<optgroup label="Как в стиле">' + Object.keys(STYLES).filter((k) => k !== '__edit').map((k) => `<option value="s:${k}">${esc(STYLES[k].name)}</option>`).join('') + '</optgroup>';
    }
    return html;
  }

  async function applyPreset(layer, val) {
    if (!val) return;
    if (val.startsWith('n:')) {
      const named = { shape: P_SHAPE, type: P_TYPE, effects: P_EFFECTS, player: P_PLAYER, accent: P_ACCENT }[layer];
      Object.assign(st.layers[layer], clone(named[val.slice(2)][1]));
    } else if (val.startsWith('s:')) {
      st.layers[layer] = styleToLayers(val.slice(2), settings)[layer];
    } else if (val === 'seed' || val === 'cover') {
      let seed;
      if (val === 'cover') {
        seed = ctx.getPalette() && ctx.getPalette().vibrant;
        if (!seed) { toast('У играющего трека нет цветной обложки'); return; }
      } else {
        seed = await promptModal('Цвет, из которого строить тему', st.layers.accent.color, '#7c5cff');
        if (!seed) return;
        if (!/^#?[0-9a-f]{6}$/i.test(seed)) { toast('Нужен цвет в формате #RRGGBB'); return; }
        seed = seed.startsWith('#') ? seed : '#' + seed;
      }
      const s = md3Scheme(seed, 'standard');
      Object.assign(st.layers.theme, { bg: s.surface, surface: s.surfaceLow, strong: s.surfaceContainer, text: s.onSurface, muted: s.onSurfaceVariant, line: s.outlineVariant, light: false });
      Object.assign(st.layers.accent, { color: s.primary, source: st.layers.accent.source === 'cover' ? 'fixed' : st.layers.accent.source });
    }
    changed();
  }

  function resetLayer(layer) {
    if (layer === 'css') st.css = '';
    else st.layers[layer] = clone(baseLayers[layer]);
    changed();
    toast(`Слой «${layer === 'css' ? 'Свой CSS' : LAYERS[layer].title}» сброшен`);
  }

  function resetField(path) { set(path, clone(baseVal(path))); changed(); }

  /** Подгоняет светлоту цвета текста, чтобы контраст с фоном был не меньше 4.5. */
  function fixContrast(path) {
    const bg = parseColor(st.layers.theme.bg).hex;
    const p = parseColor(get(path));
    let [h, s, l] = rgbToHsl(hexToRgb(p.hex));
    const lightBg = contrast(bg, '#000000') > contrast(bg, '#ffffff');
    let c = p.hex;
    for (let i = 0; i < 40 && contrast(c, bg) < 4.6; i++) { l = Math.max(0, Math.min(1, l + (lightBg ? -0.025 : 0.025))); c = hslToHex(h, s, l); }
    set(path, toColor(c, Math.max(p.a, 0.95)));
    changed();
  }

  // ---------- Разметка ----------

  function render() {
    panel.innerHTML = `<div class="ed-head" id="ed-head"></div><div class="ed-body" id="ed-body"></div>
      <div class="ed-foot"><button class="btn" data-ed="cancel">Закрыть</button><span class="spacer"></span><button class="btn primary" data-ed="save">${I.check}Сохранить</button></div>`;
    renderHead();
    renderBody();
  }

  function renderHead() {
    const h = document.getElementById('ed-head');
    if (!h || !st) return;
    const baseName = (STYLES[st.base] && STYLES[st.base].name) || 'Aura';
    h.innerHTML = `<div class="ed-top"><input class="ed-name" id="ed-name" value="${esc(st.name)}" spellcheck="false" maxlength="60">
      <button class="icon-btn" data-ed="undo" title="Отменить (Ctrl+Z)" ${hidx > 0 ? '' : 'disabled'}>${I.prev}</button>
      <button class="icon-btn" data-ed="redo" title="Повторить (Ctrl+Y)" ${hidx < hist.length - 1 ? '' : 'disabled'}>${I.next}</button>
      <button class="icon-btn" data-ed="versions" title="История версий">${I.history}</button>
      <button class="icon-btn" data-ed="cancel" title="Закрыть">${I.close}</button></div>
      <div class="caption ed-status">${st.savedReset ? 'Сброс возвращает к последнему сохранению' : `Основан на «${esc(baseName)}»`} · ${dirty ? (draftAt ? `черновик сохранён в ${new Date(draftAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'есть изменения') : 'без изменений'}</div>`;
  }

  function fieldHtml(layer, [key, type, label, a, b, step, unit]) {
    const path = `${layer}.${key}`;
    const v = get(path);
    const changedMark = !same(v, baseVal(path));
    let ctl = '';
    if (type === 'color') {
      const p = parseColor(v);
      ctl = `<input type="color" data-f="${path}" value="${p.hex}"><input class="ed-alpha" type="number" min="0" max="100" data-fa="${path}" value="${Math.round(p.a * 100)}" title="Непрозрачность, %"><span class="ed-pct">%</span>`;
    } else if (type === 'range') {
      ctl = `<input type="range" data-f="${path}" min="${a}" max="${b}" step="${step}" value="${v}"><span class="time ed-val" data-fv="${path}">${v}${unit}</span>`;
    } else if (type === 'select') {
      ctl = `<select class="select" data-f="${path}">${Object.entries(a).map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    } else if (type === 'toggle') {
      ctl = `<button class="toggle${v ? ' on' : ''}" data-ft="${path}"></button>`;
    }
    let badge = '';
    if (layer === 'theme' && (key === 'text' || key === 'muted')) {
      const r = contrast(parseColor(v).hex, parseColor(st.layers.theme.bg).hex);
      badge = r >= 4.5 ? `<span class="ed-ok" title="Контраст с фоном">${r.toFixed(1)}</span>` : `<button class="ed-bad" data-fix="${path}" title="Плохо читается. Нажми, чтобы исправить">${r.toFixed(1)} · исправить</button>`;
    }
    return `<div class="ed-row${changedMark ? ' changed' : ''}"><label>${esc(label)}${badge}</label><div class="ed-ctl">${ctl}</div>
      <button class="ed-reset" data-reset="${path}" title="Вернуть исходное значение" ${changedMark ? '' : 'disabled'}>${I.refresh}</button></div>`;
  }

  function renderBody() {
    const b = document.getElementById('ed-body');
    if (!b || !st) return;
    const scroll = b.scrollTop;
    const note = st.layers.accent.source === 'md3' ? '<div class="caption ed-note">Сейчас цвета базовой темы строит Material You из обложки. Чтобы задать их вручную, смени в «Акценте» источник цвета.</div>' : '';
    let html = '';
    for (const [layer, def] of Object.entries(LAYERS)) {
      const layerChanged = !same(st.layers[layer], baseLayers[layer]);
      html += `<section class="ed-sec${open[layer] ? ' open' : ''}">
        <header><button class="ed-title" data-sec="${layer}">${I.right}<span>${def.title}</span>${layerChanged ? '<i class="ed-dot"></i>' : ''}</button>
          <select class="select ed-preset" data-preset="${layer}">${presetOptions(layer)}</select>
          <button class="icon-btn" data-reset-layer="${layer}" title="Сбросить слой" ${layerChanged ? '' : 'disabled'}>${I.refresh}</button></header>
        ${open[layer] ? `<div class="ed-fields"><div class="caption ed-hint">${def.hint}</div>${layer === 'theme' ? note : ''}${def.fields.map((f) => fieldHtml(layer, f)).join('')}</div>` : ''}
      </section>`;
    }
    html += `<section class="ed-sec${open.css ? ' open' : ''}"><header><button class="ed-title" data-sec="css">${I.right}<span>Свой CSS</span>${st.css ? '<i class="ed-dot"></i>' : ''}</button>
      <span class="spacer"></span><button class="icon-btn" data-reset-layer="css" title="Очистить" ${st.css ? '' : 'disabled'}>${I.refresh}</button></header>
      ${open.css ? `<div class="ed-fields"><div class="caption ed-hint">Для тонкой настройки. Например: <code>.row { height: 44px }</code>. Применяется только в этом стиле.</div><textarea class="field ed-css" id="ed-css" spellcheck="false">${esc(st.css)}</textarea></div>` : ''}</section>`;
    b.innerHTML = html;
    b.scrollTop = scroll;
  }

  // ---------- События ----------

  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (!st) return;
    if (t.id === 'ed-name') { st.name = t.value; changed({ rerender: false }); return; }
    if (t.id === 'ed-css') { st.css = t.value; changed({ rerender: false }); return; }
    if (t.dataset.f && t.type === 'color') {
      const a = parseColor(get(t.dataset.f)).a;
      set(t.dataset.f, toColor(t.value, a));
      if (t.dataset.f === 'theme.bg') autoLightness(t.value);
      changed({ rerender: false });
      updateRowMarks();
      return;
    }
    if (t.dataset.fa) {
      const p = parseColor(get(t.dataset.fa));
      set(t.dataset.fa, toColor(p.hex, Math.max(0, Math.min(100, +t.value || 0)) / 100));
      changed({ rerender: false });
      return;
    }
    if (t.dataset.f && t.type === 'range') {
      const v = parseFloat(t.value);
      set(t.dataset.f, v);
      const lbl = panel.querySelector(`[data-fv="${t.dataset.f}"]`);
      const def = LAYERS[t.dataset.f.split('.')[0]].fields.find((f) => f[0] === t.dataset.f.split('.')[1]);
      if (lbl) lbl.textContent = v + (def[6] || '');
      changed({ rerender: false });
    }
  });

  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (!st) return;
    if (t.dataset.preset !== undefined) { const v = t.value; t.value = ''; applyPreset(t.dataset.preset, v); return; }
    if (t.dataset.f && t.tagName === 'SELECT') { set(t.dataset.f, t.value); changed(); return; }
    if (t.type === 'color' || t.type === 'range' || t.dataset.fa) renderBody();
  });

  panel.addEventListener('click', (e) => {
    const t = e.target;
    if (!st) return;
    const ed = t.closest('[data-ed]');
    if (ed) {
      const c = ed.dataset.ed;
      if (c === 'save') save();
      else if (c === 'cancel') close();
      else if (c === 'undo') undo();
      else if (c === 'redo') redo();
      else if (c === 'versions') showVersions();
      return;
    }
    const sec = t.closest('[data-sec]');
    if (sec) { open[sec.dataset.sec] = !open[sec.dataset.sec]; renderBody(); return; }
    const rl = t.closest('[data-reset-layer]');
    if (rl) { resetLayer(rl.dataset.resetLayer); return; }
    const rf = t.closest('[data-reset]');
    if (rf) { resetField(rf.dataset.reset); return; }
    const fx = t.closest('[data-fix]');
    if (fx) { fixContrast(fx.dataset.fix); return; }
    const tg = t.closest('[data-ft]');
    if (tg) { set(tg.dataset.ft, !get(tg.dataset.ft)); changed(); }
  });

  /**
   * Фон резко сменили на светлый (или обратно), а текст остался прежним — он пропадает на фоне.
   * Переключаем «Светлую тему» и перекрашиваем текст, линии и панели под новый фон.
   */
  function autoLightness(bgHex) {
    const T = st.layers.theme;
    const bgLight = contrast(bgHex, '#000000') > contrast(bgHex, '#ffffff');
    const textHex = parseColor(T.text).hex;
    if (bgLight === !!T.light) return; // граница светлого и тёмного не пересечена — ничего не трогаем
    const ink = bgLight ? '#16161c' : '#ffffff';
    T.light = bgLight;
    if (contrast(textHex, bgHex) < 4.5) {
      T.text = toColor(ink, 1);
      T.muted = toColor(ink, 0.62);
      T.line = toColor(bgLight ? '#000000' : '#ffffff', bgLight ? 0.1 : 0.08);
      T.surface = toColor(bgLight ? '#000000' : '#ffffff', 0.05);
      T.strong = bgLight ? toColor(mix(bgHex, '#ffffff', 0.6), 0.78) : toColor(mix(bgHex, '#000000', 0.35), 0.62);
    }
    syncInputs('theme.bg');
    toast(bgLight ? 'Фон светлый — включил светлую тему и тёмный текст' : 'Фон тёмный — вернул светлый текст', 2200);
  }

  /** Обновить поля панели без перерисовки — иначе закроется открытая пипетка. */
  function syncInputs(except) {
    for (const inp of panel.querySelectorAll('input[type="color"][data-f]')) {
      if (inp.dataset.f === except) continue;
      const c = parseColor(get(inp.dataset.f));
      inp.value = c.hex;
      const al = panel.querySelector(`[data-fa="${inp.dataset.f}"]`);
      if (al) al.value = Math.round(c.a * 100);
    }
    for (const tg of panel.querySelectorAll('[data-ft]')) tg.classList.toggle('on', !!get(tg.dataset.ft));
  }

  function updateRowMarks() {
    for (const inp of panel.querySelectorAll('input[type="color"][data-f]')) {
      const row = inp.closest('.ed-row');
      const ch = !same(get(inp.dataset.f), baseVal(inp.dataset.f));
      row.classList.toggle('changed', ch);
      row.querySelector('.ed-reset').disabled = !ch;
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!st || !e.ctrlKey) return;
    if (e.target.matches('input[type="text"], input:not([type]), textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'я') { e.preventDefault(); e.stopPropagation(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y' || k === 'н') { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (k === 's' || k === 'ы') { e.preventDefault(); e.stopPropagation(); save(); }
  }, true);

  return {
    open: openEditor,
    close,
    get active() { return !!st; },
    get prevStyle() { return prevStyle; },
  };
}

// ---------- Экспорт и импорт ----------

export function exportData(c) {
  return JSON.stringify({ format: 'glowtheme', version: 1, name: c.name, base: c.base, layers: c.layers, css: c.css || '' }, null, 2);
}

export function addImported(obj) {
  const clean = sanitizeImported(obj);
  const list = loadCustom();
  const now = Date.now();
  const item = { id: 'u' + now.toString(36), created: now, updated: now, versions: [], ...clean };
  list.push(item);
  saveCustom(list);
  registerCustom();
  return item;
}

export function duplicateCustom(id) {
  const list = loadCustom();
  const c = list.find((x) => x.id === id);
  if (!c) return null;
  const now = Date.now();
  const item = { ...clone(c), id: 'u' + now.toString(36), name: `${c.name} (копия)`, created: now, updated: now, versions: [] };
  list.push(item);
  saveCustom(list);
  registerCustom();
  return item;
}

export function deleteCustom(id) {
  saveCustom(loadCustom().filter((c) => c.id !== id));
  registerCustom();
}

export function getCustom(id) { return loadCustom().find((c) => c.id === id) || null; }
