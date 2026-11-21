// Визуал экрана воспроизведения: фоны (свечение, градиенты, световые пятна, волны, частицы)
// и частицы в бит, которые вылетают из-за обложки.

import { rgba, mix, HOLO_COLORS } from './theme.js';

export const BACKDROPS = {
  glow: 'Свечение',
  blur: 'Размытая обложка',
  gradient: 'Градиенты',
  lights: 'Световые пятна',
  waves: 'Жидкие волны',
  particles: 'Частицы',
};

export const MOTIONS = {
  none: 'Нет',
  breathe: 'Дыхание',
  parallax: 'Параллакс',
  kenburns: 'Ken Burns',
  beat: 'Бит',
};

export class Visuals {
  constructor(canvas, engine) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.engine = engine;
    this.mode = 'glow';
    this.theme = null;
    this.running = false;
    this.parts = [];
    this.ambient = [];
    this.pulse = 0;
    this.beatDelay = 0;
    this.beatQueue = [];
    this.particlesOn = true;
    this.animations = true;
    this.anchor = () => ({ x: this.w / 2, y: this.h / 2, r: 160 });
    this.onPulse = () => {};
    this.t0 = performance.now();
    this._loop = this._loop.bind(this);
    new ResizeObserver(() => this._resize()).observe(canvas);
  }

  _resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.cv.width = Math.max(1, Math.round(r.width * dpr));
    this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.running) this._draw(0, { level: 0 });
  }

  setTheme(theme) { this.theme = theme; if (!this.running) this._draw(0, { level: 0 }); }
  setMode(m) { this.mode = m; this.ambient = []; }

  start() {
    if (this.running) return;
    this.running = true;
    this._resize();
    requestAnimationFrame(this._loop);
  }

  stop() { this.running = false; }

  _loop(now) {
    if (!this.running) return;
    const t = (now - this.t0) / 1000;
    const lv = this.engine.levels();
    // Звук выходит из колонок чуть позже анализа (особенно по Bluetooth) — задерживаем вспышки.
    if (lv.beat) this.beatQueue.push({ at: now + this.beatDelay, s: lv.beat });
    while (this.beatQueue.length && this.beatQueue[0].at <= now) this._onBeat(this.beatQueue.shift().s);
    this.pulse *= 0.9;
    this.onPulse(this.pulse, lv);
    this._draw(this.animations ? t : 0, lv);
    requestAnimationFrame(this._loop);
  }

  _onBeat(s) {
    this.pulse = Math.min(1, this.pulse + s);
    if (!this.particlesOn || !this.animations || !this.theme) return;
    const a = this.anchor();
    const n = Math.round(6 + s * 10);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 190 * (0.6 + s);
      this.parts.push({
        x: a.x + Math.cos(ang) * a.r * 0.75,
        y: a.y + Math.sin(ang) * a.r * 0.75,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0,
        max: 0.9 + Math.random() * 0.8,
        size: 2 + Math.random() * 4.5,
        rot: Math.random() * Math.PI,
        col: Math.random() < 0.7 ? this.theme.accent : this.theme.second,
      });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  _draw(t, lv) {
    const { cx, w, h } = this;
    const th = this.theme;
    if (!w || !h || !th) return;
    cx.clearRect(0, 0, w, h);
    const acc = th.accent, sec = th.second || acc;
    const glow = Math.max(0.15, th.glow || 0);
    const a = this.anchor();
    const level = lv.level || 0;

    switch (this.mode) {
      case 'gradient': {
        const ang = t * 0.08;
        const x = Math.cos(ang) * w, y = Math.sin(ang) * h;
        const g = cx.createLinearGradient(w / 2 - x / 2, h / 2 - y / 2, w / 2 + x / 2, h / 2 + y / 2);
        g.addColorStop(0, rgba(acc, 0.55));
        g.addColorStop(0.5, rgba(mix(acc, sec, 0.5), 0.25));
        g.addColorStop(1, rgba(sec, 0.5));
        cx.fillStyle = g; cx.fillRect(0, 0, w, h);
        break;
      }
      case 'lights': {
        cx.globalCompositeOperation = th.light ? 'multiply' : 'lighter';
        for (let i = 0; i < 5; i++) {
          const px = w * (0.5 + 0.38 * Math.sin(t * (0.11 + i * 0.03) + i * 1.7));
          const py = h * (0.5 + 0.36 * Math.cos(t * (0.09 + i * 0.025) + i * 2.3));
          const r = Math.max(w, h) * (0.22 + 0.05 * i) * (1 + level * 0.25);
          const g = cx.createRadialGradient(px, py, 0, px, py, r);
          g.addColorStop(0, rgba(i % 2 ? sec : acc, 0.32));
          g.addColorStop(1, rgba(i % 2 ? sec : acc, 0));
          cx.fillStyle = g; cx.fillRect(0, 0, w, h);
        }
        cx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'waves': {
        for (let k = 0; k < 4; k++) {
          const base = h * (0.62 + k * 0.09);
          const amp = 18 + k * 6 + level * 40;
          cx.beginPath();
          cx.moveTo(0, h);
          for (let x = 0; x <= w; x += 12) {
            const y = base + Math.sin(x / (180 + k * 40) + t * (0.6 + k * 0.15) + k) * amp
              + Math.sin(x / 90 - t * 0.4 + k * 2) * amp * 0.3;
            cx.lineTo(x, y);
          }
          cx.lineTo(w, h);
          cx.closePath();
          cx.fillStyle = rgba(k % 2 ? sec : acc, 0.16 + k * 0.03);
          cx.fill();
        }
        break;
      }
      case 'particles': {
        if (!this.ambient.length) {
          for (let i = 0; i < 70; i++) this.ambient.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 2.2, v: 0.01 + Math.random() * 0.03, p: Math.random() * 6 });
        }
        for (const p of this.ambient) {
          const y = ((p.y - t * p.v) % 1 + 1) % 1;
          const x = p.x + Math.sin(t * 0.5 + p.p) * 0.01;
          cx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.7 + p.p));
          cx.fillStyle = p.s > 1.8 ? sec : acc;
          cx.beginPath();
          cx.arc(x * w, y * h, p.s * (1 + level), 0, Math.PI * 2);
          cx.fill();
        }
        cx.globalAlpha = 1;
        break;
      }
      default:
        break;
    }

    // Deep Space: тонкие орбиты вокруг обложки и спутники на них.
    if (th.fx === 'space') {
      cx.save();
      cx.translate(a.x, a.y);
      for (let k = 0; k < 3; k++) {
        const rx = a.r * (1.32 + k * 0.3), ry = rx * (0.3 + k * 0.06);
        const rot = -0.35 + k * 0.32 + Math.sin(t * 0.05 + k) * 0.05;
        cx.strokeStyle = rgba(k === 1 ? sec : acc, 0.22 - k * 0.04);
        cx.lineWidth = 1;
        cx.beginPath();
        cx.ellipse(0, 0, rx, ry, rot, 0, Math.PI * 2);
        cx.stroke();
        const ang = t * (0.25 - k * 0.06) + k * 2.1;
        const ex = Math.cos(ang) * rx, ey = Math.sin(ang) * ry;
        const px = ex * Math.cos(rot) - ey * Math.sin(rot), py = ex * Math.sin(rot) + ey * Math.cos(rot);
        // Холст лежит под обложкой, поэтому спутник сам «уходит» за неё.
        {
          const g = cx.createRadialGradient(px, py, 0, px, py, 7 + this.pulse * 4);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.3, rgba(k === 1 ? sec : acc, 0.9));
          g.addColorStop(1, rgba(acc, 0));
          cx.fillStyle = g;
          cx.beginPath(); cx.arc(px, py, 7 + this.pulse * 4, 0, Math.PI * 2); cx.fill();
        }
      }
      cx.restore();
    }

    // Studio: аккуратный спектр над панелью управления.
    if (th.studio) {
      const n = 72, sp = this.engine.spectrum(n);
      const x0 = w * 0.12, bw = (w * 0.76) / n, base = h - 126;
      for (let i = 0; i < n; i++) {
        const v = Math.pow(sp[i], 1.3) * 44;
        cx.fillStyle = rgba(acc, 0.18 + sp[i] * 0.45);
        cx.fillRect(x0 + i * bw + 1, base - v, Math.max(1, bw - 2), v);
        cx.fillStyle = rgba(acc, 0.12);
        cx.fillRect(x0 + i * bw + 1, base + 3, Math.max(1, bw - 2), 1);
      }
    }

    // Свечение от обложки есть почти во всех режимах; в «Размытой обложке» оно мягче.
    if (this.mode !== 'gradient') {
      const r = a.r * (1.9 + this.pulse * 0.35 + level * 0.2);
      const g = cx.createRadialGradient(a.x, a.y, a.r * 0.2, a.x, a.y, r);
      const k = (this.mode === 'blur' ? 0.35 : 0.6) * glow;
      g.addColorStop(0, rgba(acc, Math.min(0.85, k)));
      g.addColorStop(0.55, rgba(sec, k * 0.3));
      g.addColorStop(1, rgba(acc, 0));
      cx.fillStyle = g;
      cx.fillRect(0, 0, w, h);
    }

    // Частицы в бит.
    if (this.parts.length) {
      const dt = 1 / 60;
      const shape = th.particle || 'dot';
      for (const p of this.parts) {
        p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; p.rot += dt * 2;
        const k = 1 - p.life / p.max;
        if (k <= 0) continue;
        cx.globalAlpha = k * 0.9;
        if (shape === 'square') {
          cx.fillStyle = p.col;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
          cx.fillRect(-p.size, -p.size, p.size * 2, p.size * 2);
          cx.restore();
        } else if (shape === 'bubble') {
          cx.strokeStyle = rgba('#ffffff', 0.8); cx.lineWidth = 1.2;
          cx.beginPath(); cx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2); cx.stroke();
        } else if (shape === 'streak') {
          // Neo-Noir: короткие неоновые штрихи по направлению полёта.
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const lx = (p.vx / sp) * p.size * 4, ly = (p.vy / sp) * p.size * 4;
          cx.lineCap = 'round';
          cx.strokeStyle = rgba(p.col, 0.35); cx.lineWidth = p.size * 1.6;
          cx.beginPath(); cx.moveTo(p.x - lx, p.y - ly); cx.lineTo(p.x, p.y); cx.stroke();
          cx.strokeStyle = '#ffffff'; cx.lineWidth = Math.max(1, p.size * 0.4);
          cx.beginPath(); cx.moveTo(p.x - lx * 0.6, p.y - ly * 0.6); cx.lineTo(p.x, p.y); cx.stroke();
        } else if (shape === 'star') {
          // Deep Space: звёздочки с лучами.
          const r = p.size * 0.9;
          cx.fillStyle = '#ffffff';
          cx.beginPath(); cx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2); cx.fill();
          cx.strokeStyle = rgba(p.col, 0.9); cx.lineWidth = 1;
          cx.beginPath();
          cx.moveTo(p.x - r * 2.4, p.y); cx.lineTo(p.x + r * 2.4, p.y);
          cx.moveTo(p.x, p.y - r * 2.4); cx.lineTo(p.x, p.y + r * 2.4);
          cx.stroke();
        } else if (shape === 'prism') {
          // Holographic: перламутровые ромбики, каждый своего цвета.
          const c = HOLO_COLORS[Math.floor(p.rot * 10) % 4];
          cx.fillStyle = c;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
          cx.beginPath(); cx.moveTo(0, -p.size * 1.6); cx.lineTo(p.size, 0); cx.lineTo(0, p.size * 1.6); cx.lineTo(-p.size, 0); cx.closePath(); cx.fill();
          cx.restore();
        } else if (shape === 'spark') {
          cx.fillStyle = p.col;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(Math.PI / 4);
          cx.fillRect(-p.size * 0.35, -p.size * 1.4, p.size * 0.7, p.size * 2.8);
          cx.fillRect(-p.size * 1.4, -p.size * 0.35, p.size * 2.8, p.size * 0.7);
          cx.restore();
        } else {
          const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
          g.addColorStop(0, p.col); g.addColorStop(1, rgba(p.col, 0));
          cx.fillStyle = g;
          cx.beginPath(); cx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2); cx.fill();
        }
      }
      cx.globalAlpha = 1;
      this.parts = this.parts.filter((p) => p.life < p.max);
    }
  }
}
