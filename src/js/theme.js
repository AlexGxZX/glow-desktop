// Стили Glow — те же значения, что в Theme.kt Android-версии (и в дизайн-системе Glow).

export const STYLES = {
  aura: {
    name: 'Aura', sub: 'Свечение',
    bg: '#0b0b0f', text: '#f4f4f6', muted: '#9a9aa6',
    surface: 'rgba(255,255,255,0.06)', strong: 'rgba(28,28,36,0.92)', line: 'rgba(255,255,255,0.07)',
    accent: '#7c5cff', btn: '#f4f4f6', onBtn: '#0b0b0f',
    glow: 1, radius: 20, cover: 28, particle: 'dot',

    motif: 'rays',
  },
  dynamic: {
    name: 'Dynamic Art', sub: 'Цвет обложки', dynamic: true,
    bg: '#512a22', text: '#ffffff', muted: 'rgba(255,208,197,0.85)',
    surface: 'rgba(255,255,255,0.08)', strong: 'rgba(53,27,22,0.95)', line: 'rgba(255,255,255,0.10)',
    accent: '#ff7a59', btn: '#ffffff', onBtn: '#311914',
    glow: 0.8, radius: 24, cover: 32, particle: 'dot',
  },
  premium: {
    name: 'Dark Premium', sub: 'Золото на чёрном',
    bg: '#050505', text: '#f5f1e8', muted: '#9c968a',
    surface: '#121211', strong: 'rgba(22,22,20,0.95)', line: '#22211e',
    accent: '#e2b857', btn: '#e2b857', onBtn: '#16120a',
    glow: 0.45, radius: 18, cover: 18, particle: 'spark',

    motif: 'velvet', scene: 'vinyl',
  },
  light: {
    name: 'Clean Light', sub: 'Светлая', light: true,
    bg: '#f6f6f3', text: '#16161a', muted: '#6b6b73',
    surface: '#ffffff', strong: 'rgba(255,255,255,0.97)', line: '#e6e6e1',
    accent: '#3f6bff', btn: '#16161a', onBtn: '#ffffff',
    glow: 0.35, radius: 22, cover: 26, particle: 'dot',
  },
  swiss: {
    name: 'Swiss', sub: 'Типографика',
    bg: '#0e0e0e', text: '#f2f0eb', muted: '#a3a19b',
    surface: '#1c1c1b', strong: '#1c1c1b', line: '#2a2a28',
    accent: '#ff4a1c', btn: '#f4f4f6', onBtn: '#0b0b0f',
    glow: 0, radius: 0, cover: 0, particle: 'square',
  },
  glass: {
    name: 'Liquid Glass', sub: 'Стекло', glass: true,
    bg: '#07070b', text: '#ffffff', muted: 'rgba(255,255,255,0.78)',
    surface: 'rgba(255,255,255,0.10)', strong: 'rgba(255,255,255,0.14)', line: 'rgba(255,255,255,0.22)',
    accent: '#5b7cff', btn: 'rgba(255,255,255,0.28)', onBtn: '#ffffff',
    glow: 0, radius: 28, cover: 30, particle: 'bubble', liquid: true, fx: 'liquid',
  },
  holo: {
    name: 'Holographic', sub: 'Перламутр и перелив', holo: true, holoStyle: true, fx: 'holo',
    bg: '#0c0b16', text: '#f4f2ff', muted: '#a9a6c4',
    surface: 'rgba(255,255,255,0.05)', strong: 'rgba(18,16,32,0.86)', line: 'rgba(200,190,255,0.12)',
    accent: '#a8c0ff', btn: '#f4f2ff', onBtn: '#0c0b16',
    glow: 0.7, radius: 22, cover: 30, particle: 'prism',
    preview: 'conic-gradient(from 200deg at 30% 40%, #ff9ad5, #a8c0ff, #8ffff0, #fff6a8, #ff9ad5)',
  },
  mglass: {
    ...md3Style('Material Glass', 'Material 3 и стекло', '#111015', '#c9a8ff', '#4a3a78'),
    mglass: true, liquid: true, blur: true, floatBar: true, fx: 'liquid', particle: 'bubble', radius: 20, cover: 28,
    preview: 'radial-gradient(55% 70% at 25% 35%, #9a6bffaa, transparent 70%), radial-gradient(50% 60% at 80% 70%, #ff8ad888, transparent 70%), #111015',
  },
  aurora: {
    name: 'Aurora', sub: 'Северное сияние', fx: 'aurora', blur: true,
    bg: '#06070d', text: '#f3f4fa', muted: '#959aae',
    surface: 'rgba(255,255,255,0.05)', strong: 'rgba(12,14,26,0.62)', line: 'rgba(255,255,255,0.08)',
    accent: '#4fe3c1', btn: '#f3f4fa', onBtn: '#06070d',
    glow: 1.1, radius: 22, cover: 26, particle: 'dot',
    preview: 'radial-gradient(70% 90% at 15% 20%, #4fe3c1aa, transparent 70%), radial-gradient(60% 90% at 85% 70%, #8b5cffaa, transparent 70%), radial-gradient(50% 60% at 60% 0%, #ff5cc866, transparent 70%), #06070d',
  },
  noir: {
    name: 'Neo-Noir', sub: 'Неоновый минимализм', neon: true, sideNow: true,
    bg: '#050505', text: '#f4f4f5', muted: '#8b8b92',
    surface: '#0e0e10', strong: 'rgba(9,9,11,0.97)', line: '#1d1d21',
    accent: '#ff2e63', btn: 'rgba(0,0,0,0)', onBtn: '#ff2e63',
    glow: 0.6, radius: 4, cover: 4, particle: 'streak',

    motif: 'neonrain',
  },
  space: {
    name: 'Deep Space', sub: 'Космическая глубина', fx: 'space', blur: true,
    bg: '#05061a', text: '#eef0ff', muted: '#9195c4',
    surface: 'rgba(140,150,255,0.07)', strong: 'rgba(10,12,38,0.7)', line: 'rgba(150,160,255,0.13)',
    accent: '#8b7bff', btn: '#eef0ff', onBtn: '#05061a',
    glow: 0.95, radius: 20, cover: 24, particle: 'star',
    preview: 'radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 20%, #fff, transparent), radial-gradient(1px 1px at 85% 75%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 85%, #fff, transparent), radial-gradient(55% 75% at 75% 35%, #8b7bff77, transparent 70%), radial-gradient(45% 60% at 15% 80%, #3fb5ff55, transparent 70%), #05061a',

    scene: 'planet',
  },
  soft: {
    name: 'Soft Minimal', sub: 'Мягкий минимализм', light: true, soften: 0.35,
    bg: '#f3efe8', text: '#2b2824', muted: '#6f695f',
    surface: '#faf8f4', strong: 'rgba(250,248,244,0.96)', line: '#e3ddd2',
    accent: '#a07850', btn: '#2b2824', onBtn: '#faf8f4',
    glow: 0.25, radius: 16, cover: 18, particle: 'dot',
  },
  nordic: {
    name: 'Nordic', sub: 'Скандинавский минимализм', light: true, soften: 0.2, softenTo: '#7a8590',
    bg: '#eef0f1', text: '#1f2326', muted: '#5f666c',
    surface: '#f8f9f9', strong: 'rgba(248,249,249,0.96)', line: '#dde1e4',
    accent: '#5b7a99', btn: '#1f2326', onBtn: '#f8f9f9',
    glow: 0.15, radius: 10, cover: 10, particle: 'dot',

    motif: 'snow', particle: 'snow',
  },
  fluent: {
    name: 'Fluent', sub: 'Windows 11, Mica', mica: true, blur: true, btnAccent: true,
    bg: '#202020', text: '#ffffff', muted: '#c5c5c5',
    surface: 'rgba(255,255,255,0.055)', strong: 'rgba(44,44,44,0.78)', line: 'rgba(255,255,255,0.08)',
    accent: '#60cdff', btn: '#60cdff', onBtn: '#000000',
    glow: 0.2, radius: 8, cover: 8, particle: 'dot',
    preview: 'linear-gradient(135deg, #2b2b33, #1d2027 60%, #262230)',
  },
  mono: {
    name: 'Monochrome', sub: 'Строгий монохром', mono: true,
    bg: '#0a0a0a', text: '#f2f2f2', muted: '#8c8c8c',
    surface: '#141414', strong: 'rgba(12,12,12,0.97)', line: '#262626',
    accent: '#f2f2f2', btn: '#f2f2f2', onBtn: '#0a0a0a',
    glow: 0, radius: 6, cover: 4, particle: 'dot',

    particle: 'streak',
  },
  ambient: {
    name: 'Ambient', sub: 'Атмосферный минимализм', fx: 'ambient', blur: true,
    bg: '#0d0e12', text: '#ecebf0', muted: '#a3a2ad',
    surface: 'rgba(255,255,255,0.04)', strong: 'rgba(13,14,18,0.35)', line: 'rgba(255,255,255,0.05)',
    accent: '#c08bff', btn: '#ecebf0', onBtn: '#0d0e12',
    glow: 0.7, radius: 18, cover: 22, particle: 'dot',
    preview: 'radial-gradient(45% 60% at 25% 35%, #c08bff66, transparent 70%), radial-gradient(45% 60% at 75% 65%, #ff9a7a55, transparent 70%), radial-gradient(40% 50% at 70% 15%, #6fd3ff44, transparent 70%), #0d0e12',

    scene: 'lava',
  },
  softdark: {
    name: 'Soft Dark', sub: 'Мягкая тёмная', borders: true,
    bg: '#1e1f22', text: '#dcdde0', muted: '#9a9ca3',
    surface: '#26272b', strong: '#232428', line: '#34363b',
    accent: '#8ab4f8', btn: '#dcdde0', onBtn: '#1e1f22',
    glow: 0.12, radius: 10, cover: 12, particle: 'dot',

    motif: 'fireflies', particle: 'firefly',
  },
  studio: {
    name: 'Studio', sub: 'Музыкальная студия', studio: true,
    bg: '#141619', text: '#e6e8eb', muted: '#8b9099',
    surface: '#1b1e22', strong: '#181a1e', line: '#2a2e34',
    accent: '#3ddc84', btn: '#e6e8eb', onBtn: '#141619',
    glow: 0.2, radius: 4, cover: 4, particle: 'square',

    scene: 'cassette',
  },
  paper: {
    name: 'Warm Paper', sub: 'Тёплая бумага', light: true, soften: 0.4, softenTo: '#b5532c',
    bg: '#f4ece0', text: '#3b2a20', muted: '#7a6655',
    surface: '#fbf6ec', strong: 'rgba(251,246,236,0.97)', line: '#e6d9c6',
    accent: '#c4643a', btn: '#3b2a20', onBtn: '#fbf6ec',
    glow: 0.12, radius: 8, cover: 4, particle: 'dot',
    motif: 'dust',
  },

  // ---- Material You (MD3): тёмные темы, палитра строится по тональным уровням ----
  amethyst: { ...md3Style('Amethyst', 'Material You · кристаллы', '#17131d', '#d0bcff', '#493b60'), motif: 'crystals', particle: 'crystal' },
  teal: { ...md3Style('Deep Teal', 'Material You · глубина', '#101a1a', '#80d5c8', '#294442'), motif: 'bubbles', particle: 'bubble' },
  graphite: { ...md3Style('Graphite', 'Material You · графит и лайм', '#151617', '#c6f26b', '#3a412c'), particle: 'square', scene: 'led' },
  midnight: { ...md3Style('Midnight Blue', 'Material You · лунный свет', '#0b1220', '#9ecbff', '#1f3a5f'), motif: 'frost', particle: 'frost' },
  burgundy: { ...md3Style('Burgundy', 'Material You · вино и бархат', '#1d1418', '#f2b8c6', '#57333f'), motif: 'drops', particle: 'drop' },
  forest: { ...md3Style('Sage', 'Material You · шалфей', '#141a16', '#b2cba8', '#3d4f3e'), motif: 'pollen', particle: 'pollen' },
  obsidian: { ...md3Style('Obsidian', 'Material You · затмение', '#0e0e10', '#e6e1d6', '#303030'), motif: 'eclipse', particle: 'spark', eclipse: true },
  copper: { ...md3Style('Copper', 'Material You · угли', '#1c1714', '#e6b89c', '#654638'), motif: 'embers', particle: 'ember' },
  youcustom: { ...md3Style('Material You', 'Свой цвет → вся палитра', '#141218', '#d0bcff', '#4f378b'), custom: true },
};

export const FONT_STACKS = {
  system: '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif',
  helvetica: '"Helvetica Neue", Arial, "Segoe UI", sans-serif',
  bahnschrift: 'Bahnschrift, "Segoe UI", sans-serif',
  georgia: 'Georgia, Cambria, "Times New Roman", serif',
  mono: '"Cascadia Mono", Consolas, ui-monospace, monospace',
  rounded: '"Segoe UI Variable Display", "Arial Rounded MT Bold", "Segoe UI", sans-serif',
};

/** Сдвиг оттенка цвета на deg градусов (для переливов Aurora и туманностей). */
export function hueShift(hex, deg) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslToHex((h + deg + 360) % 360, s, l);
}

export function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

// ---------- Тональные палитры Material 3 ----------
// Тон = светлота L* (CIELAB), как в MD3/HCT: тон 90 на тоне 6 всегда читается,
// какого бы цвета ни была обложка. Насыщенность снижается, пока цвет не влезет в sRGB.

// Объявлены функциями, а не константами: ими пользуется STYLES выше при загрузке модуля.
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
function delin(c) { return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055); }
function XN() { return 0.95047; }
function ZN() { return 1.08883; }

export function hexToLch(hex) {
  const [r, g, b] = hexToRgb(hex).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / XN(), Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / ZN();
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(Y) - 16, A = 500 * (f(X) - f(Y)), B = 200 * (f(Y) - f(Z));
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}

function lchToRgb(L, C, h) {
  const A = C * Math.cos(h * Math.PI / 180), B = C * Math.sin(h * Math.PI / 180);
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = inv(fx) * XN(), Y = inv(fy), Z = inv(fz) * ZN();
  return [
    delin(3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    delin(-0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    delin(0.0557 * X - 0.2040 * Y + 1.0570 * Z),
  ];
}

/** Цвет с заданным оттенком, насыщенностью и тоном (0…100). */
export function tone(h, C, T) {
  let c = C, rgb = lchToRgb(T, c, h);
  while (c > 0 && rgb.some((v) => v < -0.5 || v > 255.5)) { c = Math.max(0, c - 1.5); rgb = lchToRgb(T, c, h); }
  return rgbToHex(rgb);
}

function contrastTones() { return {
  standard: { primary: 80, onSurface: 90, onVar: 80, outline: 60, outlineVar: 30 },
  medium: { primary: 86, onSurface: 94, onVar: 86, outline: 70, outlineVar: 40 },
  high: { primary: 92, onSurface: 100, onVar: 95, outline: 85, outlineVar: 60 },
}; }

/** Тёмная схема MD3 из одного исходного цвета. over — точные цвета фиксированной темы. */
/**
 * Схема MD3 из одного исходного цвета.
 * variant: tonal (спокойная), vibrant (яркая), expressive (выразительная — оттенки сдвинуты),
 * fidelity (верная обложке — контейнер ровно цвета исходника), mono (монохромная).
 * light: светлая схема. over — точные цвета фиксированной темы (только для тёмной).
 */
export function md3Scheme(seed, level = 'standard', over = null, variant = 'tonal', light = false) {
  const [sL, C, h0] = hexToLch(seed);
  const gray = C < 6 || variant === 'mono';
  let pC, sC, nC, nvC, h = h0, hs = h0;
  if (gray) { pC = 0; sC = 0; nC = 0; nvC = 0; }
  else if (variant === 'vibrant') { pC = Math.max(C, 60); sC = Math.min(pC / 2, 30); nC = 8; nvC = 14; }
  else if (variant === 'expressive') { pC = Math.max(C, 44); sC = 28; nC = 7; nvC = 12; h = (h0 + 240) % 360; hs = (h0 + 30) % 360; }
  else if (variant === 'fidelity') { pC = Math.max(C, 20); sC = Math.min(C / 2.5, 24); nC = Math.min(C / 8, 6); nvC = Math.min(C / 6, 10); }
  else { pC = Math.min(Math.max(C, 32), 48); sC = Math.min(pC / 3, 18); nC = 4; nvC = 9; }
  const ct = contrastTones();
  const k = ct[level] || ct.standard;
  const P = (T) => tone(h, pC, T), S = (T) => tone(hs, sC, T), N = (T) => tone(h0, nC, T), NV = (T) => tone(h0, nvC, T);
  let sch;
  if (light) {
    const d = level === 'high' ? 15 : level === 'medium' ? 8 : 0;
    sch = {
      primary: P(40 - d), onPrimary: P(100),
      primaryContainer: P(90), onPrimaryContainer: P(10),
      secondaryContainer: S(90), onSecondaryContainer: S(10),
      surface: N(98), surfaceLow: N(96), surfaceContainer: N(94), surfaceHigh: N(92), surfaceHighest: N(90),
      onSurface: N(Math.max(0, 10 - d)), onSurfaceVariant: NV(30 - d), outline: NV(50 - d), outlineVariant: NV(80 - d),
    };
  } else {
    sch = {
      primary: P(k.primary), onPrimary: P(20),
      primaryContainer: P(30), onPrimaryContainer: P(92),
      secondaryContainer: S(level === 'high' ? 35 : 30), onSecondaryContainer: S(level === 'standard' ? 90 : 96),
      surface: N(6), surfaceLow: N(10), surfaceContainer: N(12), surfaceHigh: N(17), surfaceHighest: N(22),
      onSurface: N(k.onSurface), onSurfaceVariant: NV(k.onVar), outline: NV(k.outline), outlineVariant: NV(k.outlineVar),
    };
  }
  if (variant === 'fidelity' && !gray) {
    // Контейнер — сам цвет обложки, текст на нём — чёрный или белый.
    sch.primaryContainer = seed;
    sch.onPrimaryContainer = sL > 60 ? '#000000' : '#ffffff';
  }
  if (over && !light && variant === 'tonal') {
    // Фиксированная тема: фон и контейнер — ровно те, что задуманы; поверхности строим от фона.
    const [bL, bC, bH] = hexToLch(over.bg);
    const B = (dT) => tone(bH, bC < 1.5 ? 0 : Math.max(bC, 3), bL + dT);
    Object.assign(sch, { surface: over.bg, surfaceLow: B(4), surfaceContainer: B(6), surfaceHigh: B(11), surfaceHighest: B(16) });
    sch.primaryContainer = over.container;
    sch.secondaryContainer = over.container;
    if (level === 'standard') sch.primary = over.primary;
  }
  return sch;
}

function md3Style(name, sub, bg, primary, container) {
  const s = md3Scheme(primary, 'standard', { bg, primary, container });
  return {
    name, sub, md3: { bg, primary, container },
    bg, text: s.onSurface, muted: s.onSurfaceVariant,
    surface: s.surfaceLow, strong: s.surfaceContainer, line: s.outlineVariant,
    accent: primary, btn: primary, onBtn: s.onPrimary,
    glow: 0.3, radius: 16, cover: 24, particle: 'dot',
  };
}

/** Голографические цвета — те же, что в Android-версии. */
export const HOLO_COLORS = ['#ff9ad5', '#a8c0ff', '#8ffff0', '#fff6a8'];

export function md3IsLight(settings) {
  const m = settings.md3Mode || 'dark';
  if (m === 'light') return true;
  if (m === 'system') return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  return false;
}

export const MD3_SEEDS = [
  '#6750a4', '#7d5260', '#b3261e', '#e8590c', '#c77c02', '#6b8e23',
  '#2e7d32', '#00796b', '#0288d1', '#3949ab', '#5e35b1', '#8e24aa',
];

export const ACCENTS = [
  '#7c5cff', '#9b5cff', '#b45cff', '#d05cff', '#ff5cc8',
  '#ff5c8a', '#ff6b6b', '#ff7a59', '#ffb547', '#e2b857',
  '#4cd97b', '#2ec5b6', '#3fb5ff', '#3f6bff', '#5b7cff',
];

// ---------- Цвет ----------

export function hexToRgb(hex) {
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [124, 92, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function lum(hex) {
  const ch = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---------- Плавная смена палитры ----------

const shown = {};
let tweenRaf = 0;

/** Цвет из любой записи стиля: hex, rgba() или «r g b» → {r,g,b,a,triple}. */
function parseAny(v) {
  const s = String(v).trim();
  let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) { const n = parseInt(m[1], 16); return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 }; }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) { const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16)); return { r, g, b, a: 1 }; }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  m = s.match(/^(\d+) (\d+) (\d+)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1, triple: true };
  return null;
}

/** Записывает CSS-переменные; цвета плавно перетекают за 0,65 с (как смена палитры в Android). */
function setVars(root, vars, animate) {
  cancelAnimationFrame(tweenRaf);
  const moving = [];
  for (const [k, v] of Object.entries(vars)) {
    const to = parseAny(v), from = shown[k] !== undefined ? parseAny(shown[k]) : null;
    if (animate && to && from && !!to.triple === !!from.triple && shown[k] !== v) moving.push([k, from, to, v]);
    else root.style.setProperty(k, v);
    shown[k] = v;
  }
  if (!moving.length) return;
  const t0 = performance.now(), D = 650;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / D);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    for (const [k, f, t, fin] of moving) {
      if (p >= 1) { root.style.setProperty(k, fin); continue; }
      const r = Math.round(f.r + (t.r - f.r) * e), g = Math.round(f.g + (t.g - f.g) * e), b = Math.round(f.b + (t.b - f.b) * e);
      root.style.setProperty(k, t.triple ? `${r} ${g} ${b}` : `rgba(${r},${g},${b},${(f.a + (t.a - f.a) * e).toFixed(3)})`);
    }
    if (p < 1) tweenRaf = requestAnimationFrame(step);
  };
  tweenRaf = requestAnimationFrame(step);
}

/**
 * Уровень контрастности для остальных стилей: второстепенный текст и линии
 * подтягиваются к основному тексту, основной текст становится чисто белым/чёрным.
 */
function applyContrastLevel(t, level, light) {
  if (!level || level === 'standard') return;
  const k = level === 'high' ? 1 : 0.5;
  const pure = light ? '#000000' : '#ffffff';
  if (t.text.startsWith('#')) t.text = mix(t.text, pure, 0.6 * k);
  if (t.muted.startsWith('#')) t.muted = mix(t.muted, t.text, 0.45 * k);
  else t.muted = light ? `rgba(0,0,0,${0.62 + 0.25 * k})` : `rgba(255,255,255,${0.78 + 0.17 * k})`;
  if (t.line.startsWith('#')) t.line = mix(t.line, t.muted, 0.35 * k);
  else t.line = light ? `rgba(0,0,0,${0.12 + 0.12 * k})` : `rgba(255,255,255,${0.12 + 0.14 * k})`;
}

/** Акцент, подогнанный для читаемости текста на фоне стиля. */
function readable(accent, bg, light) {
  let c = accent;
  for (let i = 0; i < 12 && contrast(c, bg) < 4.5; i++) c = mix(c, light ? '#000000' : '#ffffff', 0.12);
  return c;
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// ---------- Палитра обложки ----------

const paletteCache = new Map();

/** Достаёт цвета из обложки: яркий (vibrant), второй для градиентов и общий (dominant). */
export function extractPalette(url) {
  if (!url) return Promise.resolve(null);
  if (paletteCache.has(url)) return Promise.resolve(paletteCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const N = 48;
        const cv = document.createElement('canvas');
        cv.width = N; cv.height = N;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, 0, 0, N, N);
        const data = cx.getImageData(0, 0, N, N).data;
        const buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        let ar = 0, ag = 0, ab = 0, n = 0, satSum = 0, lightSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          ar += r; ag += g; ab += b; n++;
          const [h, s, l] = rgbToHsl([r, g, b]);
          satSum += s; lightSum += l;
          if (s < 0.22 || l < 0.16 || l > 0.88) continue;
          const w = s * (1 - Math.abs(l - 0.55));
          const k = Math.floor(h / 30) % 12;
          const B = buckets[k];
          B.w += w; B.r += r * w; B.g += g * w; B.b += b * w;
        }
        const sorted = buckets.filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
        const col = (x) => rgbToHex([x.r / x.w, x.g / x.w, x.b / x.w]);
        const dominant = rgbToHex([ar / n, ag / n, ab / n]);
        const vibrant = sorted[0] && sorted[0].w > 2 ? col(sorted[0]) : null;
        const second = sorted[1] && sorted[1].w > 1 ? col(sorted[1]) : vibrant ? mix(vibrant, '#000000', 0.35) : dominant;
        const p = { vibrant, second, dominant, saturation: satSum / n, lightness: lightSum / n };
        if (paletteCache.size > 400) paletteCache.delete(paletteCache.keys().next().value);
        paletteCache.set(url, p);
        resolve(p);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ---------- Применение стиля ----------

/**
 * Считает итоговые цвета и записывает CSS-переменные.
 * Возвращает объект с итоговыми значениями (для визуала и частиц).
 */
export function applyTheme(settings, palette) {
  const st = STYLES[settings.style] || STYLES.aura;
  const coverAccent = palette && palette.vibrant;
  let accent;
  if (st.user) {
    // Свой стиль: откуда брать акцент, решает слой «Акцент».
    const own = st.accent;
    accent = st.accentSource === 'fixed' ? own
      : st.accentSource === 'mix' ? (coverAccent ? mix(own, coverAccent, 0.5) : own)
        : (coverAccent || own);
  } else switch (settings.accentMode) {
    case 'custom': accent = settings.customAccent || st.accent; break;
    case 'mix': accent = coverAccent ? mix(settings.customAccent || st.accent, coverAccent, 0.5) : (settings.customAccent || st.accent); break;
    default: accent = coverAccent || st.accent;
  }

  // Soft Minimal приглушает цвет обложки, чтобы акцент не кричал на светлом фоне.
  if (st.soften) accent = mix(accent, st.softenTo || '#8a8073', st.soften);
  // Monochrome: никаких цветных акцентов — цветными остаются только обложки.
  if (st.mono) accent = st.accent;

  const t = { ...st };
  if (st.neon) t.onBtn = accent;
  if (st.btnAccent) {
    t.btn = accent;
    t.onBtn = contrast(accent, '#000000') >= contrast(accent, '#ffffff') ? '#000000' : '#ffffff';
  }
  if (st.user) {
    if (st.btnMode === 'text') { t.btn = t.text; t.onBtn = t.bg; }
    else if (st.btnMode === 'accent') { t.btn = accent; t.onBtn = contrast(accent, '#000000') >= contrast(accent, '#ffffff') ? '#000000' : '#ffffff'; }
    else if (st.btnMode === 'outline') { t.btn = 'rgba(0,0,0,0)'; t.onBtn = accent; }
    else { t.btn = st.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.28)'; t.onBtn = t.text; }
  }
  if (st.dynamic) {
    t.bg = mix('#07070a', accent, 0.30);
    t.muted = rgba(mix(accent, '#ffffff', 0.65), 0.85);
    t.strong = rgba(mix(t.bg, '#000000', 0.35), 0.95);
    t.onBtn = mix(t.bg, '#000000', 0.4);
  }

  // Material You: вся схема из одного цвета — своего, из обложки или заданного темой.
  let sch = null;
  let mdLight = false;
  if (st.user && st.accentSource === 'md3') {
    // Свой стиль с палитрой Material You из обложки: цвета темы строит генератор.
    sch = md3Scheme(coverAccent || st.accent, settings.contrast || 'standard', null);
    accent = sch.primary;
    Object.assign(t, {
      bg: sch.surface, text: sch.onSurface, muted: sch.onSurfaceVariant,
      surface: sch.surfaceLow, strong: sch.surfaceContainer, line: sch.outlineVariant,
    });
    if (st.btnMode === 'accent' || st.btnMode === 'text') { t.btn = sch.primary; t.onBtn = sch.onPrimary; }
    if (st.btnMode === 'outline') t.onBtn = accent;
  } else if (st.md3) {
    const dyn = settings.md3Dynamic && coverAccent;
    const seed = dyn ? coverAccent : st.custom ? (settings.md3Seed || '#6750a4') : st.md3.primary;
    mdLight = !st.mglass && md3IsLight(settings);
    sch = md3Scheme(seed, settings.contrast || 'standard', dyn || st.custom ? null : st.md3, settings.md3Variant || 'tonal', mdLight);
    accent = sch.primary;
    Object.assign(t, {
      bg: sch.surface, text: sch.onSurface, muted: sch.onSurfaceVariant,
      surface: sch.surfaceLow, strong: sch.surfaceContainer, line: sch.outlineVariant,
      btn: sch.primary, onBtn: sch.onPrimary,
    });
  } else {
    applyContrastLevel(t, settings.contrast, !!st.light);
  }

  // Стекло: прозрачность, подкраска и толщина задаются в настройках.
  if (st.liquid) {
    const a = settings.glassAlpha ?? 0.14;
    const tint = settings.glassTint ? mix(accent, '#000000', 0.45) : (st.mglass ? '#2a2340' : '#ffffff');
    t.strong = rgba(tint, settings.glassTint || st.mglass ? Math.min(0.9, a + 0.32) : a);
    t.surface = rgba('#ffffff', Math.max(0.03, a * 0.55));
    t.line = rgba('#ffffff', Math.min(0.4, 0.1 + a * 0.8));
  }
  const isLight = !!st.light || mdLight;

  const accentText = readable(accent, t.bg.startsWith('#') ? t.bg : '#0b0b0f', isLight);
  const glow = st.glow * (settings.glow ?? 0.75);
  const [ar, ag, ab] = hexToRgb(accent);
  // Для Aurora и Deep Space второй цвет должен быть ярким: сдвигаем оттенок, а не затемняем.
  let second = (palette && palette.second) || (st.fx ? hueShift(accent, 55) : mix(accent, st.light ? '#ffffff' : '#000000', 0.4));
  if (st.fx && rgbToHsl(hexToRgb(second))[2] < 0.3) second = hueShift(accent, 55);
  if (st.soften) second = mix(second, st.softenTo || '#8a8073', st.soften);
  if (st.mono) second = '#8c8c8c';

  const root = document.documentElement;
  const vars = {
    '--bg': t.bg, '--text': t.text, '--muted': t.muted,
    '--surface': t.surface, '--strong': t.strong, '--line': t.line,
    '--accent': accent, '--accent-rgb': `${ar} ${ag} ${ab}`, '--accent-text': accentText,
    '--second': second,
    '--btn': t.btn, '--on-btn': t.onBtn,
    '--radius': `${st.radius}px`, '--cover-radius': `${st.cover}px`,
    '--row-radius': st.radius <= 6 ? `${st.radius}px` : '10px',
    '--chip-radius': st.radius <= 6 ? `${st.radius}px` : '999px',
    '--glow': String(glow),
    '--text-rgb': t.text.startsWith('#') ? hexToRgb(t.text).join(' ') : (st.light ? '0 0 0' : '255 255 255'),
    '--container': sch ? sch.secondaryContainer : t.surface,
    '--on-container': sch ? sch.onSecondaryContainer : t.text,
    '--p-container': sch ? sch.primaryContainer : t.surface,
    '--on-p-container': sch ? sch.onPrimaryContainer : t.text,
    '--surface-high': sch ? sch.surfaceHigh : t.surface,
    '--outline': sch ? sch.outline : t.line,
    '--gblur': `${settings.glassBlur ?? 30}px`,
  };
  setVars(root, vars, settings.animations !== false && settings.style !== '__edit');

  const b = document.body.classList;
  for (const id of Object.keys(STYLES)) b.toggle(`style-${id}`, id === settings.style);
  b.toggle('light', isLight);
  b.toggle('holo-style', !!st.holoStyle);
  b.toggle('liquid', !!st.liquid);
  b.toggle('float-bar', !!st.floatBar);
  b.toggle('lens', !!st.liquid && !!settings.glassLens);
  b.toggle('glass', !!st.glass);
  b.toggle('square', st.radius === 0);
  b.toggle('no-anim', settings.animations === false);
  b.toggle('fx-on', !!st.fx);
  b.toggle('fx-aurora', st.fx === 'aurora');
  b.toggle('fx-space', st.fx === 'space');
  b.toggle('neon', !!st.neon);
  b.toggle('blur-ui', !!st.blur);
  b.toggle('fx-ambient', st.fx === 'ambient');
  b.toggle('mica', !!st.mica);
  b.toggle('studio', !!st.studio);
  b.toggle('borders', !!st.borders);
  b.toggle('mono', !!st.mono);
  b.toggle('md3', !!st.md3 || st.kit === 'md3');
  b.toggle('u-style', !!st.user);
  b.toggle('paper-tex', !!st.paperTex);
  b.toggle('holo', !!st.holo);
  b.toggle('btn-outline', !!st.user && st.btnMode === 'outline');
  const bs = document.body.style;
  if (st.user) {
    bs.setProperty('--font-display', FONT_STACKS[st.font] || FONT_STACKS.system);
    bs.setProperty('--dw', String(st.weight || 700));
    bs.setProperty('--dt', st.upper ? 'uppercase' : 'none');
  } else {
    bs.removeProperty('--font-display'); bs.removeProperty('--dw'); bs.removeProperty('--dt');
  }
  let css = document.getElementById('user-css');
  if (!css) { css = document.createElement('style'); css.id = 'user-css'; document.head.appendChild(css); }
  css.textContent = st.user ? st.css || '' : '';
  b.toggle('contrast-high', settings.contrast === 'high');

  return { ...t, light: isLight, accent, accentText, second, glow, palette };
}
