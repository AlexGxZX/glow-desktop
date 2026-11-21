// Живой фон всего окна для стилей Aurora (переливающиеся туманы) и Deep Space (туманности и звёзды).
// Рисуется на холсте под интерфейсом, примерно 30 кадров в секунду, и засыпает, когда окно свёрнуто.

import { rgba, mix, hueShift, hexToRgb, HOLO_COLORS } from './theme.js';

export class Ambient {
  constructor(canvas, engine) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.engine = engine;
    this.kind = null;
    this.theme = null;
    this.anim = true;
    this.running = false;
    this.last = 0;
    this.t0 = performance.now();
    this.stars = [];
    this.flash = 0;
    this._loop = this._loop.bind(this);
    window.addEventListener('resize', () => this._resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.kind && this.anim) this._kick(); });
  }

  set(kind, theme, animations) {
    const changed = kind !== this.kind;
    this.kind = kind || null;
    this.theme = theme;
    this.anim = animations !== false;
    this.cv.style.display = this.kind ? 'block' : 'none';
    if (!this.kind) { this.running = false; return; }
    if (changed) this._resize();
    if (this.anim) this._kick();
    else { this.running = false; this._draw(0, 0); }
  }

  _kick() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this._loop);
  }

  _resize() {
    // Туманам хватает четверти разрешения — масштабирование само размывает их.
    const k = this.kind === 'space' ? 1 : 0.25;
    this.w = Math.max(1, Math.round(window.innerWidth * k));
    this.h = Math.max(1, Math.round(window.innerHeight * k));
    this.cv.width = this.w;
    this.cv.height = this.h;
    if (this.kind === 'space') {
      this.stars = [];
      const n = Math.round((this.w * this.h) / 5200);
      for (let i = 0; i < n; i++) {
        this.stars.push({ x: Math.random(), y: Math.random(), r: Math.random() < 0.08 ? 1.4 + Math.random() : 0.4 + Math.random() * 0.8, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.6, d: 0.2 + Math.random() * 0.8 });
      }
    }
    if (!this.running && this.kind) this._draw(0, 0);
  }

  _loop(now) {
    if (!this.running || !this.kind) { this.running = false; return; }
    if (document.hidden) { this.running = false; return; }
    if (now - this.last >= 33) {
      this.last = now;
      const lv = this.engine.levels();
      if (lv.beat) this.flash = Math.min(1, this.flash + lv.beat * 0.8);
      this.flash *= 0.9;
      const t = (now - this.t0) / 1000;
      this._draw(t, lv.level || 0);
      if (this.kind === 'ambient' && now - (this.lastDrift || 0) > 500) { this.lastDrift = now; this._drift(t); }
    }
    requestAnimationFrame(this._loop);
  }

  _draw(t, level) {
    if (!this.theme) return;
    if (this.kind === 'aurora') this._aurora(t, level);
    else if (this.kind === 'space') this._space(t, level);
    else if (this.kind === 'ambient') this._ambient(t, level);
    else if (this.kind === 'liquid') this._liquid(t, level);
    else if (this.kind === 'holo') this._holo(t, level);
  }

  /** Liquid Glass: насыщенные пятна цветов обложки плавают за стеклом и сливаются. */
  _liquid(t, level) {
    const { cx, w, h, theme } = this;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = theme.bg;
    cx.fillRect(0, 0, w, h);
    const p = theme.palette || {};
    const cols = [theme.accent, theme.second, p.dominant || hueShift(theme.accent, 120), hueShift(theme.accent, -50), hueShift(theme.second, 70)];
    cx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const px = w * (0.5 + 0.42 * Math.sin(t * (0.05 + i * 0.013) + i * 1.3));
      const py = h * (0.5 + 0.4 * Math.cos(t * (0.043 + i * 0.011) + i * 2.1));
      const r = Math.max(w, h) * (0.24 + 0.06 * Math.sin(t * 0.08 + i * 1.7)) * (1 + level * 0.12 + this.flash * 0.08);
      const g = cx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, rgba(cols[i], 0.55));
      g.addColorStop(0.5, rgba(cols[i], 0.22));
      g.addColorStop(1, rgba(cols[i], 0));
      cx.fillStyle = g;
      cx.fillRect(0, 0, w, h);
    }
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = rgba(theme.bg, 0.18);
    cx.fillRect(0, 0, w, h);
  }

  /** Holographic: перламутровые полосы медленно переливаются по окну. */
  _holo(t, level) {
    const { cx, w, h, theme } = this;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = theme.bg;
    cx.fillRect(0, 0, w, h);
    cx.globalCompositeOperation = 'lighter';
    const ang = t * 0.03;
    const dx = Math.cos(ang) * w, dy = Math.sin(ang) * h;
    const g = cx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
    const off = (t * 0.02) % 1;
    for (let i = 0; i <= 8; i++) {
      const pos = (i / 8 + off) % 1;
      g.addColorStop(pos, rgba(HOLO_COLORS[i % 4], 0.11 + level * 0.05));
    }
    cx.fillStyle = g;
    cx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const px = w * (0.5 + 0.38 * Math.sin(t * 0.03 + i * 2.2)), py = h * (0.5 + 0.35 * Math.cos(t * 0.025 + i * 1.6));
      const r = Math.max(w, h) * 0.35;
      const rg = cx.createRadialGradient(px, py, 0, px, py, r);
      rg.addColorStop(0, rgba(HOLO_COLORS[(i + 1) % 4], 0.16 + this.flash * 0.08));
      rg.addColorStop(1, rgba(HOLO_COLORS[(i + 1) % 4], 0));
      cx.fillStyle = rg;
      cx.fillRect(0, 0, w, h);
    }
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = rgba(theme.bg, 0.35);
    cx.fillRect(0, 0, w, h);
  }

  /** Ambient: акцент медленно плывёт по оттенку (±18°), полный цикл около двух минут. */
  _drift(t) {
    const c = hueShift(this.theme.accent, Math.sin(t * 0.05) * 18);
    const [r, g, b] = hexToRgb(c);
    const root = document.documentElement.style;
    root.setProperty('--accent', c);
    root.setProperty('--accent-rgb', `${r} ${g} ${b}`);
  }

  _ambient(t, level) {
    const { cx, w, h, theme } = this;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = theme.bg;
    cx.fillRect(0, 0, w, h);
    const p = theme.palette || {};
    const cols = [theme.accent, theme.second, p.dominant || mix(theme.accent, theme.bg, 0.4), hueShift(theme.accent, -35)];
    cx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      // Медленные круглые пятна, органично «дышат».
      const px = w * (0.5 + 0.36 * Math.sin(t * (0.012 + i * 0.004) + i * 1.7));
      const py = h * (0.5 + 0.34 * Math.cos(t * (0.010 + i * 0.003) + i * 2.4));
      const r = Math.max(w, h) * (0.36 + 0.05 * Math.sin(t * 0.03 + i)) * (1 + level * 0.08);
      const g = cx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, rgba(cols[i], 0.3));
      g.addColorStop(0.6, rgba(cols[i], 0.08));
      g.addColorStop(1, rgba(cols[i], 0));
      cx.fillStyle = g;
      cx.fillRect(0, 0, w, h);
    }
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = rgba(theme.bg, 0.25);
    cx.fillRect(0, 0, w, h);
  }

  _aurora(t, level) {
    const { cx, w, h, theme } = this;
    cx.globalCompositeOperation = 'source-over';
    cx.fillStyle = theme.bg;
    cx.fillRect(0, 0, w, h);
    // Палитра из обложки, медленно переливается по оттенку.
    const drift = Math.sin(t * 0.025) * 28;
    const cols = [
      hueShift(theme.accent, drift),
      hueShift(theme.second, -drift),
      hueShift(theme.accent, 70 + drift),
      hueShift(theme.second, -60 + drift * 0.5),
      mix(theme.accent, theme.second, 0.5),
    ];
    cx.globalCompositeOperation = 'lighter';
    const boost = 1 + level * 0.35 + this.flash * 0.25;
    for (let i = 0; i < 5; i++) {
      const px = w * (0.5 + 0.42 * Math.sin(t * (0.035 + i * 0.011) + i * 1.9));
      const py = h * (0.35 + 0.4 * Math.cos(t * (0.028 + i * 0.009) + i * 2.6));
      const rx = w * (0.42 + 0.08 * Math.sin(t * 0.05 + i));
      const ry = h * (0.22 + 0.06 * Math.cos(t * 0.04 + i * 2));
      cx.save();
      cx.translate(px, py);
      cx.rotate(Math.sin(t * 0.02 + i) * 0.5);
      cx.scale(1, ry / rx);
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, rgba(cols[i], Math.min(0.5, 0.26 * boost)));
      g.addColorStop(0.5, rgba(cols[i], 0.09 * boost));
      g.addColorStop(1, rgba(cols[i], 0));
      cx.fillStyle = g;
      cx.fillRect(-rx, -rx, rx * 2, rx * 2);
      cx.restore();
    }
    cx.globalCompositeOperation = 'source-over';
    // Затемнение снизу, чтобы текст в списках оставался читаемым.
    const v = cx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, rgba(theme.bg, 0.05));
    v.addColorStop(1, rgba(theme.bg, 0.55));
    cx.fillStyle = v;
    cx.fillRect(0, 0, w, h);
  }

  _space(t, level) {
    const { cx, w, h, theme } = this;
    cx.globalCompositeOperation = 'source-over';
    const bg = cx.createRadialGradient(w * 0.6, h * 0.35, 0, w * 0.6, h * 0.35, Math.max(w, h));
    bg.addColorStop(0, mix(theme.bg, theme.accent, 0.16));
    bg.addColorStop(1, theme.bg);
    cx.fillStyle = bg;
    cx.fillRect(0, 0, w, h);

    // Туманности: большие мягкие облака цвета обложки.
    cx.globalCompositeOperation = 'lighter';
    const neb = [theme.accent, theme.second, hueShift(theme.accent, -40)];
    for (let i = 0; i < 3; i++) {
      const a = t * (0.008 + i * 0.004) + i * 2.1;
      const px = w * (0.5 + 0.3 * Math.cos(a)), py = h * (0.45 + 0.28 * Math.sin(a * 1.3));
      const r = Math.max(w, h) * (0.32 + i * 0.07) * (1 + level * 0.12);
      cx.save();
      cx.translate(px, py);
      cx.rotate(a * 0.5);
      cx.scale(1, 0.55);
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(neb[i], 0.2 + this.flash * 0.06));
      g.addColorStop(0.45, rgba(neb[i], 0.07));
      g.addColorStop(1, rgba(neb[i], 0));
      cx.fillStyle = g;
      cx.fillRect(-r, -r, r * 2, r * 2);
      cx.restore();
    }

    // Звёзды мерцают и чуть дрейфуют; на ударах баса вспыхивают.
    cx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      const x = ((s.x + t * 0.0015 * s.d) % 1) * w;
      const y = s.y * h;
      cx.globalAlpha = Math.min(1, (0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.p))) * (0.55 + s.d * 0.45) + this.flash * 0.3);
      cx.beginPath();
      cx.arc(x, y, s.r, 0, 6.283);
      cx.fill();
    }
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
  }
}
