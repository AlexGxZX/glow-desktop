// Визуал экрана воспроизведения: фоны (свечение, градиенты, световые пятна, волны, частицы)
// и частицы в бит, которые вылетают из-за обложки.

import { rgba, mix, HOLO_COLORS } from './theme.js';
import { stepSpring } from './beat.js';
import { Scenes } from './scenes.js';

export const BACKDROPS = {
  glow: 'Свечение',
  blur: 'Размытая обложка',
  gradient: 'Градиенты',
  lights: 'Световые пятна',
  waves: 'Жидкие волны',
  particles: 'Частицы',
};

// Качество графики: множитель количества частиц (детализация лавы — в scenes.js).
export const QUALITIES = { low: 'Низкое', medium: 'Среднее', high: 'Высокое' };
export const QUALITY_PARTS = { low: 0.5, medium: 1, high: 1.5 };

// Пресеты частиц: форма и поведение. «Как в стиле» — прежние формы каждого стиля.
export const PART_PRESETS = {
  style: 'Как в стиле',
  sparks: 'Искры',
  dust: 'Пыль',
  rings: 'Кольца',
  orbits: 'Орбиты',
  petals: 'Лепестки',
  shards: 'Осколки',
};
const PRESET = {
  sparks: { shape: 'streak', count: 1, speed: 1.4 },
  dust: { shape: 'dot', count: 2.5, speed: 0.5, size: 0.5, life: 1.8 },
  rings: { shape: 'rings', count: 0.25 },
  orbits: { shape: 'orbits', count: 0.6, life: 2 },
  petals: { shape: 'petals', count: 0.7, speed: 0.5, life: 1.4 },
  shards: { shape: 'shards', count: 0.8, speed: 1.6, life: 0.9 },
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
    this.preset = 'style';     // пресет формы частиц (настройка «Форма частиц»)
    this.partMul = 1;          // множитель количества частиц (настройка «Количество частиц»)
    this.dt = 1 / 60;          // реальный шаг кадра, частицы двигаются по времени, а не по кадрам
    this._lastNow = null;
    this._spawnAcc = 0;
    // Реакция самой обложки: пружины для масштаба и поворота, вспышка яркости.
    this.coverStrength = 0.5;
    this.coverFx = { kick: 0, jr: 0, flash: 0 };
    this._kick = { x: 0, v: 0 };
    this._rot = { x: 0, v: 0 };
    this._flash = 0;
    // Реакция на вокал (средние частоты): мягкое свечение и кольца от обложки.
    this.voice = 0;
    this.rings = [];
    this.ringStrength = 0.5;   // настройка «Сила колец на вокале», 0 — выключены
    this._lastRingAt = -Infinity;
    this.anchor = () => ({ x: this.w / 2, y: this.h / 2, r: 160 });
    this.onPulse = () => {};
    this.t0 = performance.now();
    this.scenes = new Scenes();
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
    this.dt = this._lastNow == null ? 1 / 60 : Math.min(0.05, (now - this._lastNow) / 1000);
    this._lastNow = now;
    const lv = this.engine.levels();
    // Звук выходит из колонок чуть позже анализа (особенно по Bluetooth) — задерживаем вспышки.
    const bb = lv.bandBeat || {};
    if (lv.beat || bb.bass || bb.mid || bb.high) this.beatQueue.push({ at: now + this.beatDelay, s: lv.beat || 0, bb });
    while (this.beatQueue.length && this.beatQueue[0].at <= now) {
      const q = this.beatQueue.shift();
      this._onBeat(q.s, q.bb);
    }
    if (this.particlesOn && this.animations && this.theme && lv.level > 0.02) this._ambientSpawn(lv.level, this.dt);
    this.pulse *= Math.pow(0.9, this.dt * 60);
    this._coverStep(this.dt);
    this._voiceStep(this.dt);
    this.onPulse(this.pulse, lv);
    this._draw(this.animations ? t : 0, lv);
    requestAnimationFrame(this._loop);
  }

  _onBeat(s, bb = {}) {
    this.pulse = Math.min(1, this.pulse + s);
    this._coverImpulse(s, bb);
    if (bb.mid) {
      this.voice = Math.min(1, this.voice + bb.mid * 0.8 * this.coverStrength * 2);
      // Кольцо не чаще раза в 300 мс, иначе на каждую вокальную ноту они накладываются.
      const now = performance.now();
      if (this.particlesOn && this.animations && this.theme && this.ringStrength > 0 && now - this._lastRingAt >= 300) {
        this.rings.push({ age: 0, max: 0.7 + bb.mid * 0.4, s: bb.mid, col: this.theme.second || this.theme.accent });
        this._lastRingAt = now;
      }
    }
    if (!this.particlesOn || !this.animations || !this.theme) return;
    const a = this.anchor();
    const m = this.partMul * ((PRESET[this.preset] || {}).count || 1);
    // Удар по всему спектру — основной залп из-за обложки.
    if (s > 0) {
      const n = Math.round((10 + s * 26) * m);
      for (let i = 0; i < n; i++) this._spawn(a, 140 + Math.random() * 320 * (0.6 + s), 0.9 + Math.random() * 0.8, 2 + Math.random() * 4.5);
    }
    // Высокие — мелкие искры поверх залпа.
    if (bb.high) {
      const n = Math.round((4 + bb.high * 10) * m);
      for (let i = 0; i < n; i++) this._spawn(a, 60 + Math.random() * 120, 0.4 + Math.random() * 0.5, 1 + Math.random() * 1.5);
    }
    this._cap();
  }

  /** Постоянный поток частиц, пока звучит музыка: плотность зависит от громкости. */
  _ambientSpawn(level, dt) {
    this._spawnAcc += (6 + level * 40) * this.partMul * ((PRESET[this.preset] || {}).count || 1) * dt;
    const a = this.anchor();
    while (this._spawnAcc >= 1) {
      this._spawnAcc -= 1;
      this._spawn(a, 20 + Math.random() * 50, 1 + Math.random() * 1, 1.5 + Math.random() * 2);
    }
    this._cap();
  }

  _spawn(a, speed, max, size) {
    const ang = Math.random() * Math.PI * 2;
    const P = PRESET[this.preset] || {};
    const p = {
      x: a.x + Math.cos(ang) * a.r * 0.75,
      y: a.y + Math.sin(ang) * a.r * 0.75,
      vx: Math.cos(ang) * speed * (P.speed || 1),
      vy: Math.sin(ang) * speed * (P.speed || 1),
      life: 0,
      max: max * (P.life || 1),
      size: size * (P.size || 1),
      rot: Math.random() * Math.PI,
      col: Math.random() < 0.7 ? this.theme.accent : this.theme.second,
      shape: P.shape || null,
    };
    // Орбиты крутятся вокруг обложки, кольца расходятся от неё.
    if (P.shape === 'orbits') {
      Object.assign(p, { ox: a.x, oy: a.y, orb: a.r * (1.05 + Math.random() * 0.5), ang, w: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.6) });
    } else if (P.shape === 'rings') {
      Object.assign(p, { ox: a.x, oy: a.y, orb: a.r * 0.8, w: 90 + Math.random() * 120, vx: 0, vy: 0 });
    }
    this.parts.push(p);
  }

  /** Удар баса толкает обложку, высокие дают поворот, полный удар даёт вспышку яркости. */
  _coverImpulse(s, bb) {
    const g = this.coverStrength;
    if (bb.bass) this._kick.v += bb.bass * 6.4 * g;
    if (bb.high) this._rot.v += bb.high * 120 * g;
    if (s) this._flash = Math.min(1, this._flash + s * g * 1.2);
  }

  _voiceStep(dt) {
    this.voice *= Math.pow(0.92, dt * 60);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.max);
  }

  _coverStep(dt) {
    stepSpring(this._kick, 260, 16, dt);
    stepSpring(this._rot, 400, 20, dt);
    this._flash *= Math.pow(0.85, dt * 60);
    this.coverFx.kick = Math.max(-0.05, Math.min(0.25, this._kick.x));
    this.coverFx.jr = Math.max(-4, Math.min(4, this._rot.x));
    this.coverFx.flash = this._flash;
  }

  _cap() {
    const limit = Math.round(400 * Math.max(1, this.partMul));
    if (this.parts.length > limit) this.parts.splice(0, this.parts.length - limit);
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

    // Obsidian: затмение — обложка закрывает «солнце», из-за неё выбивается корона.
    if (th.eclipse && !this.scenes.active) {
      const R = a.r * 1.02;
      const cor = cx.createRadialGradient(a.x, a.y, R * 0.96, a.x, a.y, R * (1.9 + level * 0.4 + this.pulse * 0.3));
      cor.addColorStop(0, rgba(mix(acc, '#ffffff', 0.7), 0.95));
      cor.addColorStop(0.08, rgba(mix(acc, '#ffffff', 0.4), 0.55));
      cor.addColorStop(0.35, rgba(acc, 0.16));
      cor.addColorStop(1, rgba(acc, 0));
      cx.fillStyle = cor;
      cx.beginPath(); cx.arc(a.x, a.y, R * 2.4, 0, Math.PI * 2); cx.fill();
      // Протуберанцы: медленные лучи короны, вспыхивают на ударах.
      cx.save(); cx.translate(a.x, a.y);
      cx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const ang = i * (Math.PI * 2 / 14) + t * 0.03 + Math.sin(t * 0.2 + i) * 0.08;
        const len = R * (0.35 + 0.25 * Math.abs(Math.sin(t * 0.4 + i * 1.7)) + this.pulse * 0.4);
        const g = cx.createLinearGradient(Math.cos(ang) * R, Math.sin(ang) * R, Math.cos(ang) * (R + len), Math.sin(ang) * (R + len));
        g.addColorStop(0, rgba(mix(acc, '#ffffff', 0.5), 0.45)); g.addColorStop(1, rgba(acc, 0));
        cx.strokeStyle = g; cx.lineWidth = R * 0.05; cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(Math.cos(ang) * R, Math.sin(ang) * R); cx.lineTo(Math.cos(ang) * (R + len), Math.sin(ang) * (R + len)); cx.stroke();
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
      const r = a.r * (1.9 + this.pulse * 0.35 + level * 0.2 + this.voice * 0.15);
      const g = cx.createRadialGradient(a.x, a.y, a.r * 0.2, a.x, a.y, r);
      const k = (this.mode === 'blur' ? 0.35 : 0.6) * glow;
      g.addColorStop(0, rgba(acc, Math.min(0.85, k)));
      g.addColorStop(0.55, rgba(sec, k * 0.3));
      g.addColorStop(1, rgba(acc, 0));
      cx.fillStyle = g;
      cx.fillRect(0, 0, w, h);
    }

    // Сцена вместо обложки: винил, кассета, матрица, жидкий свет, планета.
    if (this.scenes.active) {
      const e = this.engine;
      this.scenes.draw(cx, a, th, lv, { playing: e.playing, time: e.time || 0, duration: e.duration || 0, spectrum: e.spectrum(32) }, this.animations ? t : 0);
    }

    // Кольца на вокале: расходятся от обложки и гаснут.
    if (this.rings.length) {
      cx.save();
      for (const r of this.rings) {
        const k = 1 - r.age / r.max;
        if (k <= 0) continue;
        const rad = a.r * (1.03 + (1 - k) * (0.4 + r.s * 0.4));
        cx.globalAlpha = k * 0.6 * Math.min(1, this.ringStrength * 2);
        cx.strokeStyle = r.col;
        cx.lineWidth = 1 + 2.5 * k;
        cx.beginPath(); cx.arc(a.x, a.y, rad, 0, Math.PI * 2); cx.stroke();
      }
      cx.restore();
    }

    // Частицы в бит.
    if (this.parts.length) {
      const dt = this.dt;
      const damp = Math.pow(0.985, dt * 60);
      for (const p of this.parts) {
        p.life += dt; p.rot += dt * 2;
        if (p.shape === 'orbits') {
          p.ang += p.w * dt;
          p.x = p.ox + Math.cos(p.ang) * p.orb; p.y = p.oy + Math.sin(p.ang) * p.orb;
        } else if (p.shape !== 'rings') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp;
        }
        const k = 1 - p.life / p.max;
        if (k <= 0) continue;
        cx.globalAlpha = k * 0.9;
        const shape = p.shape || th.particle || 'dot';
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
        } else if (shape === 'rings') {
          // Кольцо расходится от обложки и гаснет.
          cx.strokeStyle = rgba(p.col, 0.9); cx.lineWidth = 1.5;
          cx.beginPath(); cx.arc(p.ox, p.oy, p.orb + p.life * p.w, 0, Math.PI * 2); cx.stroke();
        } else if (shape === 'petals') {
          cx.fillStyle = p.col;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
          cx.beginPath(); cx.ellipse(0, 0, p.size * 1.8, p.size * 0.9, 0, 0, Math.PI * 2); cx.fill();
          cx.restore();
        } else if (shape === 'shards') {
          cx.fillStyle = p.col;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot * 2);
          cx.beginPath(); cx.moveTo(-p.size * 1.5, -p.size); cx.lineTo(p.size * 1.5, 0); cx.lineTo(-p.size * 0.5, p.size * 1.4); cx.closePath(); cx.fill();
          cx.restore();
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
        } else if (shape === 'snow') {
          // Nordic: снежинка с шестью лучами.
          cx.strokeStyle = th.light ? rgba(mix(p.col, '#5a6a7a', 0.4), 0.9) : '#ffffff'; cx.lineWidth = 1;
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
          for (let i = 0; i < 3; i++) { cx.rotate(Math.PI / 3); cx.beginPath(); cx.moveTo(-p.size * 1.4, 0); cx.lineTo(p.size * 1.4, 0); cx.stroke(); }
          cx.restore();
        } else if (shape === 'firefly' || shape === 'pollen' || shape === 'ember') {
          // Soft Dark — светлячки, Sage — пыльца, Copper — угли: мягкие огоньки разного тепла.
          const col = shape === 'firefly' ? mix(p.col, '#f6ff9a', 0.45) : shape === 'ember' ? mix(p.col, '#ff7a33', 0.5) : mix(p.col, '#fff4c8', 0.4);
          if (shape === 'ember') p.vy -= 1.2;
          const blink = shape === 'firefly' ? 0.4 + 0.6 * Math.abs(Math.sin(p.life * 9 + p.rot)) : 1;
          const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.6);
          g.addColorStop(0, rgba('#ffffff', 0.95 * blink)); g.addColorStop(0.3, rgba(col, 0.85 * blink)); g.addColorStop(1, rgba(col, 0));
          cx.fillStyle = g;
          cx.beginPath(); cx.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2); cx.fill();
        } else if (shape === 'frost') {
          // Midnight Blue: холодные четырёхлучевые искры.
          const r = p.size * 1.8;
          cx.strokeStyle = mix(p.col, '#ffffff', 0.6); cx.lineWidth = 1;
          cx.beginPath(); cx.moveTo(p.x - r, p.y); cx.lineTo(p.x + r, p.y); cx.moveTo(p.x, p.y - r); cx.lineTo(p.x, p.y + r); cx.stroke();
          cx.fillStyle = '#ffffff'; cx.beginPath(); cx.arc(p.x, p.y, 1.2, 0, Math.PI * 2); cx.fill();
        } else if (shape === 'crystal') {
          // Amethyst: грани кристалла с бликом.
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
          cx.fillStyle = rgba(p.col, 0.85);
          cx.beginPath(); cx.moveTo(0, -p.size * 2); cx.lineTo(p.size * 0.8, -p.size * 0.4); cx.lineTo(0, p.size * 2); cx.lineTo(-p.size * 0.8, -p.size * 0.4); cx.closePath(); cx.fill();
          cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.lineWidth = 0.8;
          cx.beginPath(); cx.moveTo(0, -p.size * 2); cx.lineTo(0, p.size * 2); cx.stroke();
          cx.restore();
        } else if (shape === 'drop') {
          // Burgundy: капли, которые под своим весом падают вниз.
          p.vy += 6;
          const r = p.size;
          cx.fillStyle = rgba(p.col, 0.9);
          cx.beginPath(); cx.moveTo(p.x, p.y - r * 2.4); cx.quadraticCurveTo(p.x + r, p.y, p.x, p.y + r); cx.quadraticCurveTo(p.x - r, p.y, p.x, p.y - r * 2.4); cx.fill();
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
