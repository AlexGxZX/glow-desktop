// Живой фон всего окна для стилей Aurora (переливающиеся туманы) и Deep Space (туманности и звёзды).
// Рисуется на холсте под интерфейсом, примерно 30 кадров в секунду, и засыпает, когда окно свёрнуто.

import { rgba, mix, hueShift, hexToRgb, HOLO_COLORS } from './theme.js';

export const MOTIFS = new Set(['rays', 'embers', 'fireflies', 'snow', 'neonrain', 'pollen', 'frost', 'bubbles', 'crystals', 'drops', 'eclipse', 'velvet', 'dust']);

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
    const k = this.kind === 'space' ? 1 : MOTIFS.has(this.kind) ? 0.6 : 0.25;
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
    if (MOTIFS.has(this.kind)) this._seed();
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
    else if (MOTIFS.has(this.kind)) this._motif(t, level);
  }

  // ================= Мотивы стилей =================
  // Лёгкий слой поверх обычного фона окна: у каждого стиля своё — лучи, угли, снег, светлячки…

  _seed() {
    const { w, h } = this;
    const N = { rays: 34, embers: 46, fireflies: 26, snow: 70, neonrain: 40, pollen: 50, frost: 40, bubbles: 34, crystals: 16, drops: 14, eclipse: 30, velvet: 40, dust: 40 }[this.kind] || 30;
    this.mp = Array.from({ length: N }, () => this._spawn(true));
    this.dpr = w / window.innerWidth;
  }

  _spawn(anywhere) {
    const { w, h } = this;
    const r = Math.random;
    const k = this.kind;
    const p = { x: r() * w, y: anywhere ? r() * h : h + 10, s: r(), p: r() * 6.28, a: r() * 6.28, life: r() };
    if (k === 'snow' || k === 'neonrain' || k === 'drops') p.y = anywhere ? r() * h : -20;
    return p;
  }

  _motif(t, level) {
    const { cx, w, h, theme } = this;
    cx.globalCompositeOperation = 'source-over';
    cx.clearRect(0, 0, w, h);
    const acc = theme.accent, sec = theme.second || acc;
    const light = !!theme.light;
    const sc = Math.max(0.5, this.dpr || 0.6);
    const dt = 1 / 30;
    const k = this.kind;
    cx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    if (k === 'rays' || k === 'eclipse') {
      // Мягкие лучи из верхнего угла (Aura) или корона затмения (Obsidian).
      const ox = k === 'eclipse' ? w * 0.82 : w * 0.18, oy = k === 'eclipse' ? h * 0.12 : -h * 0.1;
      if (k === 'eclipse') {
        const R = Math.min(w, h) * 0.11;
        const g = cx.createRadialGradient(ox, oy, R * 0.95, ox, oy, R * (2.6 + level * 0.6 + this.flash * 0.6));
        g.addColorStop(0, rgba(mix(acc, '#ffffff', 0.5), 0.5)); g.addColorStop(0.25, rgba(acc, 0.18)); g.addColorStop(1, rgba(acc, 0));
        cx.fillStyle = g; cx.beginPath(); cx.arc(ox, oy, R * 3.4, 0, 6.283); cx.fill();
        cx.globalCompositeOperation = 'source-over';
        cx.fillStyle = theme.bg; cx.beginPath(); cx.arc(ox, oy, R, 0, 6.283); cx.fill();
        cx.globalCompositeOperation = 'lighter';
      } else {
        for (let i = 0; i < 5; i++) {
          const ang = 0.5 + i * 0.16 + Math.sin(t * 0.07 + i) * 0.03;
          const len = Math.hypot(w, h) * 1.1, wd = 0.05 + (i % 2) * 0.04;
          const g = cx.createLinearGradient(ox, oy, ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
          g.addColorStop(0, rgba(i % 2 ? sec : acc, 0.16 + level * 0.08)); g.addColorStop(1, rgba(acc, 0));
          cx.fillStyle = g;
          cx.beginPath(); cx.moveTo(ox, oy);
          cx.lineTo(ox + Math.cos(ang - wd) * len, oy + Math.sin(ang - wd) * len);
          cx.lineTo(ox + Math.cos(ang + wd) * len, oy + Math.sin(ang + wd) * len);
          cx.closePath(); cx.fill();
        }
      }
    }
    for (const p of this.mp) {
      let r = 1, col = acc, al = 0.5;
      switch (k) {
        case 'rays': case 'dust': case 'velvet': case 'pollen': {
          // Пылинки медленно плавают в свете.
          p.x += Math.sin(t * 0.3 + p.p) * 0.15 * sc; p.y += (k === 'pollen' ? -0.12 : 0.06) * sc * (0.5 + p.s);
          r = (k === 'velvet' ? 0.7 : k === 'dust' ? 1.5 : 1) * (0.8 + p.s * 1.6) * sc;
          al = (0.15 + 0.45 * Math.abs(Math.sin(t * (0.6 + p.s) + p.p))) * (k === 'velvet' ? 0.9 : 0.7);
          col = k === 'velvet' ? mix(acc, '#fff3d0', 0.4) : k === 'dust' ? mix(acc, '#8a6a4a', 0.4) : p.s > 0.6 ? sec : acc;
          break;
        }
        case 'embers': {
          p.y -= (0.4 + p.s * 0.9) * sc * (1 + level); p.x += Math.sin(t * 1.2 + p.p) * 0.35 * sc;
          p.life += dt * 0.12;
          r = (1.4 + p.s * 2.6) * sc;
          al = Math.min(1, Math.max(0, 1 - p.life) * (0.65 + 0.35 * Math.sin(t * 6 + p.p)) * (1.1 + level));
          col = p.s > 0.5 ? mix(acc, '#ffb070', 0.5) : mix(acc, '#ff5a2a', 0.4);
          if (p.y < -10 || p.life > 1) Object.assign(p, this._spawn(false), { life: 0 });
          break;
        }
        case 'fireflies': {
          p.a += (Math.random() - 0.5) * 0.3;
          p.x += Math.cos(p.a) * 0.35 * sc; p.y += Math.sin(p.a) * 0.35 * sc;
          r = (1.4 + p.s * 1.4) * sc;
          al = Math.max(0, Math.sin(t * (0.8 + p.s) + p.p)) ** 3 * (0.8 + level * 0.4);
          col = mix(acc, '#f6ff9a', 0.35);
          break;
        }
        case 'snow': {
          p.y += (0.25 + p.s * 0.5) * sc; p.x += Math.sin(t * 0.5 + p.p) * 0.25 * sc;
          r = (0.8 + p.s * 1.6) * sc; al = light ? 0.35 + p.s * 0.3 : 0.25 + p.s * 0.4;
          col = light ? mix(acc, '#6f7f8f', 0.5) : '#ffffff';
          break;
        }
        case 'neonrain': {
          p.y += (4 + p.s * 6) * sc * (1 + level * 0.6);
          const len = (18 + p.s * 40) * sc;
          cx.strokeStyle = rgba(p.s > 0.7 ? sec : acc, 0.12 + p.s * 0.25 + this.flash * 0.2);
          cx.lineWidth = Math.max(0.6, sc * (0.6 + p.s));
          cx.beginPath(); cx.moveTo(p.x, p.y - len); cx.lineTo(p.x, p.y); cx.stroke();
          if (p.y - len > h) Object.assign(p, this._spawn(false));
          continue;
        }
        case 'frost': case 'crystals': {
          // Холодные искры-звёздочки (Midnight Blue) и грани кристаллов (Amethyst) вспыхивают и гаснут.
          const tw = Math.max(0, Math.sin(t * (0.5 + p.s * 0.8) + p.p));
          const size = (k === 'crystals' ? 4 + p.s * 6 : 2 + p.s * 3) * sc * (0.6 + tw);
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a + t * 0.05);
          cx.globalAlpha = tw * (k === 'crystals' ? 0.35 : 0.55);
          if (k === 'crystals') {
            cx.fillStyle = rgba(p.s > 0.5 ? acc : sec, 0.8);
            cx.beginPath(); cx.moveTo(0, -size * 1.6); cx.lineTo(size * 0.6, 0); cx.lineTo(0, size * 1.6); cx.lineTo(-size * 0.6, 0); cx.closePath(); cx.fill();
            cx.strokeStyle = rgba('#ffffff', 0.5); cx.lineWidth = 0.6; cx.stroke();
          } else {
            cx.strokeStyle = mix(acc, '#ffffff', 0.6); cx.lineWidth = Math.max(0.6, sc * 0.8);
            cx.beginPath(); cx.moveTo(-size, 0); cx.lineTo(size, 0); cx.moveTo(0, -size); cx.lineTo(0, size); cx.stroke();
          }
          cx.restore();
          if (tw < 0.01 && Math.random() < 0.02) Object.assign(p, this._spawn(true));
          continue;
        }
        case 'bubbles': {
          p.y -= (0.3 + p.s * 0.6) * sc; p.x += Math.sin(t + p.p) * 0.2 * sc;
          const br = (2 + p.s * 5) * sc;
          cx.strokeStyle = rgba(mix(acc, '#ffffff', 0.4), 0.18 + p.s * 0.2); cx.lineWidth = Math.max(0.6, sc * 0.8);
          cx.beginPath(); cx.arc(p.x, p.y, br, 0, 6.283); cx.stroke();
          cx.fillStyle = rgba('#ffffff', 0.25); cx.beginPath(); cx.arc(p.x - br * 0.35, p.y - br * 0.35, br * 0.22, 0, 6.283); cx.fill();
          if (p.y < -10) Object.assign(p, this._spawn(false));
          continue;
        }
        case 'drops': {
          p.y += (0.6 + p.s * 0.8) * sc;
          const dr = (2.5 + p.s * 3) * sc;
          cx.fillStyle = rgba(acc, 0.12 + p.s * 0.18);
          cx.beginPath(); cx.moveTo(p.x, p.y - dr * 2.4); cx.quadraticCurveTo(p.x + dr, p.y, p.x, p.y + dr); cx.quadraticCurveTo(p.x - dr, p.y, p.x, p.y - dr * 2.4); cx.fill();
          if (p.y > h + 10) Object.assign(p, this._spawn(false));
          continue;
        }
        case 'eclipse': {
          // Искры, сорванные с короны.
          p.x += Math.cos(p.a) * 0.3 * sc; p.y += Math.sin(p.a) * 0.3 * sc;
          r = (0.7 + p.s) * sc; al = 0.2 + 0.4 * Math.abs(Math.sin(t + p.p));
          col = mix(acc, '#ffffff', 0.5);
          break;
        }
        default: break;
      }
      if (p.x < -20) p.x = w + 10; else if (p.x > w + 20) p.x = -10;
      if (p.y < -20) p.y = h + 10; else if (p.y > h + 20) p.y = -10;
      const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      g.addColorStop(0, rgba(light ? col : mix(col, '#ffffff', 0.35), al));
      g.addColorStop(0.4, rgba(col, al * 0.5));
      g.addColorStop(1, rgba(col, 0));
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(p.x, p.y, r * 3, 0, 6.283); cx.fill();
    }
    cx.globalCompositeOperation = 'source-over';
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
