// Glow для ПК — сцены экрана плеера: вместо обложки в центре — светящийся винил, кассета,
// светодиодная матрица, жидкий свет или планета. Всё рисуется на холсте экрана плеера,
// берёт цвета из обложки и реагирует на музыку. Частицы рождаются из самого объекта.

import { rgba, mix } from './theme.js';

export const SCENES = {
  none: 'Обложка',
  vinyl: 'Светящийся винил',
  cassette: 'Кассета',
  led: 'Светодиодная матрица',
  lava: 'Жидкий свет',
  planet: 'Светящаяся планета',
};

const TAU = Math.PI * 2;
const ease = (a, b, k) => a + (b - a) * k;
const rnd = (a, b) => a + Math.random() * (b - a);

export class Scenes {
  constructor() {
    this.kind = 'none';
    this.img = null;
    this.imgSrc = null;
    this.ledGrid = null;
    this.prevGrid = null;
    this.ledMorph = 1;
    this.angle = 0;
    this.speed = 0; // 0…1 — разгон и остановка пластинки
    this.arm = 0; // 0 — тонарм на стойке, 1 — на пластинке
    this.reelA = 0;
    this.parts = [];
    this.lavaBalls = null;
    this.lavaCv = null;
    this.last = performance.now();
    this.track = null;
    this.moons = [];
  }

  set(kind) {
    if (kind === this.kind) return;
    this.kind = SCENES[kind] ? kind : 'none';
    this.parts = [];
  }

  get active() { return this.kind !== 'none'; }

  /** Новый трек: обложка (для наклейки, матрицы, планеты) и луны-треки альбома. */
  setTrack(track, src, albumTracks = []) {
    this.track = track;
    this.moons = albumTracks.slice(0, 9).map((t, i) => ({ path: t.path, a: (i / Math.max(1, albumTracks.length)) * TAU, r: 1.55 + (i % 3) * 0.17, s: 0.18 - (i % 3) * 0.035 }));
    if (src === this.imgSrc) return;
    this.imgSrc = src;
    this.prevGrid = this.ledGrid;
    this.ledMorph = 0;
    if (!src) { this.img = null; this.ledGrid = null; return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (this.imgSrc === src) { this.img = img; this.ledGrid = this._sample(img, 32); } };
    img.src = src;
  }

  _sample(img, n) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = n;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, n, n);
      const d = x.getImageData(0, 0, n, n).data;
      const out = [];
      for (let i = 0; i < n * n; i++) out.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
      return out;
    } catch { return null; }
  }

  /** Рисует сцену. a — центр и радиус места обложки, th — тема, lv — уровни звука, st — состояние плеера. */
  draw(cx, a, th, lv, st, t) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const playing = st.playing;
    this.speed = ease(this.speed, playing ? 1 : 0, Math.min(1, dt * (playing ? 1.6 : 1.1)));
    const acc = th.accent, sec = th.second || acc;
    const level = lv.level || 0, beat = lv.beat || 0;
    cx.save();
    switch (this.kind) {
      case 'vinyl': this._vinyl(cx, a, acc, sec, level, beat, st, dt, t); break;
      case 'cassette': this._cassette(cx, a, acc, sec, level, beat, st, dt, t, th); break;
      case 'led': this._led(cx, a, acc, sec, level, beat, st, dt, t); break;
      case 'lava': this._lava(cx, a, acc, sec, level, beat, st, dt, t); break;
      case 'planet': this._planet(cx, a, acc, sec, level, beat, st, dt, t); break;
      default: break;
    }
    cx.restore();
    this._particles(cx, dt);
  }

  // ---------- общие частицы сцен ----------

  _emit(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const ang = opts.ang !== undefined ? opts.ang + rnd(-opts.spread, opts.spread) : rnd(0, TAU);
      const sp = rnd(opts.v0, opts.v1);
      this.parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: rnd(opts.l0, opts.l1), size: rnd(opts.s0, opts.s1), col: opts.col, g: opts.g || 0, kind: opts.kind || 'glow' });
    }
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
  }

  _particles(cx, dt) {
    if (!this.parts.length) return;
    cx.save();
    cx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.99; p.vy *= 0.99;
      const k = 1 - p.life / p.max;
      if (k <= 0) continue;
      if (p.kind === 'spark') {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        cx.strokeStyle = rgba(p.col, 0.9 * k);
        cx.lineWidth = p.size * 0.6;
        cx.lineCap = 'round';
        cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x - (p.vx / sp) * p.size * 4, p.y - (p.vy / sp) * p.size * 4); cx.stroke();
      } else {
        const r = p.size * (p.kind === 'bubble' ? 1 : 2.4);
        const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, rgba('#ffffff', 0.9 * k));
        g.addColorStop(0.25, rgba(p.col, 0.7 * k));
        g.addColorStop(1, rgba(p.col, 0));
        cx.fillStyle = g;
        cx.beginPath(); cx.arc(p.x, p.y, r, 0, TAU); cx.fill();
      }
    }
    cx.restore();
    this.parts = this.parts.filter((p) => p.life < p.max);
  }

  _cover(cx, x, y, r, round = true) {
    if (!this.img) {
      cx.fillStyle = '#2a2633';
      cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fill();
      return;
    }
    cx.save();
    cx.beginPath();
    if (round) cx.arc(x, y, r, 0, TAU); else cx.rect(x - r, y - r, r * 2, r * 2);
    cx.clip();
    cx.drawImage(this.img, x - r, y - r, r * 2, r * 2);
    cx.restore();
  }

  // ---------- Светящийся винил ----------

  _vinyl(cx, a, acc, sec, level, beat, st, dt, t) {
    const R = a.r * 0.98;
    const x = a.x - a.r * 0.08, y = a.y;
    this.angle += dt * this.speed * TAU * (33.33 / 60);
    // Сияние по краю пластинки.
    const halo = cx.createRadialGradient(x, y, R * 0.9, x, y, R * (1.28 + level * 0.12 + beat * 0.08));
    halo.addColorStop(0, rgba(acc, 0.55 + beat * 0.3));
    halo.addColorStop(0.35, rgba(mix(acc, sec, 0.5), 0.22));
    halo.addColorStop(1, rgba(sec, 0));
    cx.fillStyle = halo;
    cx.beginPath(); cx.arc(x, y, R * 1.35, 0, TAU); cx.fill();
    // Сам диск.
    const body = cx.createRadialGradient(x - R * 0.2, y - R * 0.25, R * 0.1, x, y, R);
    body.addColorStop(0, '#1b1a20'); body.addColorStop(0.7, '#0b0b0e'); body.addColorStop(1, '#050507');
    cx.fillStyle = body;
    cx.beginPath(); cx.arc(x, y, R, 0, TAU); cx.fill();
    // Бороздки: тонкие кольца с лёгким цветом обложки.
    cx.lineWidth = 0.6;
    for (let r = R * 0.4; r < R * 0.97; r += R * 0.012) {
      const k = 0.05 + 0.04 * Math.sin(r * 0.9);
      cx.strokeStyle = rgba(r % 7 < 3.5 ? '#ffffff' : acc, k);
      cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.stroke();
    }
    // Пустые дорожки между треками.
    cx.strokeStyle = 'rgba(0,0,0,.65)'; cx.lineWidth = 2;
    for (const k of [0.55, 0.68, 0.82]) { cx.beginPath(); cx.arc(x, y, R * k, 0, TAU); cx.stroke(); }
    // Блики — свет падает сверху и не крутится вместе с пластинкой.
    if (cx.createConicGradient) {
      const sh = cx.createConicGradient(-Math.PI / 2 + 0.6, x, y);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.06, rgba(mix('#ffffff', acc, 0.4), 0.22 + level * 0.15));
      sh.addColorStop(0.12, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0)');
      sh.addColorStop(0.56, rgba(mix('#ffffff', sec, 0.5), 0.16 + level * 0.1));
      sh.addColorStop(0.62, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = sh;
      cx.beginPath(); cx.arc(x, y, R * 0.97, 0, TAU); cx.arc(x, y, R * 0.38, 0, TAU, true); cx.fill();
    }
    // Тонкий цветной ободок.
    cx.strokeStyle = rgba(acc, 0.7); cx.lineWidth = 1.5;
    cx.shadowColor = acc; cx.shadowBlur = 18 + beat * 30;
    cx.beginPath(); cx.arc(x, y, R - 1, 0, TAU); cx.stroke();
    cx.shadowBlur = 0;
    // Наклейка с обложкой крутится вместе с диском.
    cx.save();
    cx.translate(x, y); cx.rotate(this.angle);
    this._cover(cx, 0, 0, R * 0.36);
    cx.strokeStyle = 'rgba(0,0,0,.4)'; cx.lineWidth = 3;
    cx.beginPath(); cx.arc(0, 0, R * 0.36, 0, TAU); cx.stroke();
    cx.fillStyle = '#d8d4de';
    cx.beginPath(); cx.arc(0, 0, R * 0.022, 0, TAU); cx.fill();
    cx.restore();
    // Тонарм: со стойки на край пластинки, дальше медленно к центру по ходу трека.
    const prog = st.duration ? Math.min(1, st.time / st.duration) : 0;
    this.arm = ease(this.arm, st.playing || st.time > 0.5 ? 1 : 0, Math.min(1, dt * 2.4));
    const px = x + R * 1.08, py = y - R * 0.92;
    const rest = 0.08, outer = 0.43, inner = 0.68;
    const ang = rest + (outer + (inner - outer) * prog - rest) * this.arm;
    const len = R * 1.5;
    const hx = px - Math.sin(ang) * len, hy = py + Math.cos(ang) * len;
    // Стойка.
    const base = cx.createRadialGradient(px - 4, py - 4, 2, px, py, R * 0.11);
    base.addColorStop(0, '#f2f0f6'); base.addColorStop(1, '#55525e');
    cx.fillStyle = base;
    cx.beginPath(); cx.arc(px, py, R * 0.1, 0, TAU); cx.fill();
    cx.fillStyle = '#2a2830';
    cx.beginPath(); cx.arc(px, py, R * 0.045, 0, TAU); cx.fill();
    // Трубка.
    const tube = cx.createLinearGradient(px, py, hx, hy);
    tube.addColorStop(0, '#e9e6ef'); tube.addColorStop(0.5, '#9d99a8'); tube.addColorStop(1, '#f5f3f8');
    cx.strokeStyle = tube; cx.lineWidth = Math.max(3, R * 0.022); cx.lineCap = 'round';
    cx.shadowColor = 'rgba(0,0,0,.5)'; cx.shadowBlur = 10; cx.shadowOffsetY = 6;
    cx.beginPath(); cx.moveTo(px, py); cx.lineTo(hx, hy); cx.stroke();
    cx.shadowBlur = 0; cx.shadowOffsetY = 0;
    // Головка с иглой.
    cx.save();
    cx.translate(hx, hy); cx.rotate(ang + 0.35);
    cx.fillStyle = '#d6d2dd';
    cx.fillRect(-R * 0.035, -R * 0.02, R * 0.07, R * 0.1);
    cx.restore();
    // Светится игла, а на ударах с неё срываются искры по касательной к вращению.
    const nx = hx + Math.sin(ang) * R * 0.02, ny = hy + R * 0.06;
    if (this.arm > 0.9 && st.playing) {
      const ng = cx.createRadialGradient(nx, ny, 0, nx, ny, 10 + level * 18);
      ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.3, rgba(acc, 0.9)); ng.addColorStop(1, rgba(acc, 0));
      cx.fillStyle = ng;
      cx.beginPath(); cx.arc(nx, ny, 10 + level * 18, 0, TAU); cx.fill();
      const tang = Math.atan2(ny - y, nx - x) + Math.PI / 2;
      if (beat > 0.15) this._emit(nx, ny, Math.round(4 + beat * 10), { ang: tang, spread: 0.5, v0: 80, v1: 260, l0: 0.3, l1: 0.8, s0: 1, s1: 2.4, col: Math.random() < 0.6 ? acc : sec, kind: 'spark' });
    }
    // Пыль медленно кружится вокруг диска.
    if (Math.random() < 0.15 * (0.3 + this.speed)) {
      const ang2 = rnd(0, TAU), rr = R * rnd(1.02, 1.25);
      this._emit(x + Math.cos(ang2) * rr, y + Math.sin(ang2) * rr, 1, { ang: ang2 + Math.PI / 2, spread: 0.2, v0: 8, v1: 24, l0: 1.5, l1: 3, s0: 0.8, s1: 1.8, col: acc });
    }
  }

  // ---------- Кассета ----------

  _cassette(cx, a, acc, sec, level, beat, st, dt, t, th) {
    const W = a.r * 2.3, H = W * 0.64;
    const x = a.x - W / 2, y = a.y - H / 2;
    const r = H * 0.06;
    const prog = st.duration ? Math.min(1, st.time / st.duration) : 0;
    // Подсветка снизу, будто кассета лежит на светящейся поверхности.
    cx.save();
    cx.translate(a.x, y + H * 0.98); cx.scale(1, 0.32);
    const under = cx.createRadialGradient(0, 0, 0, 0, 0, W * 0.72);
    under.addColorStop(0, rgba(acc, 0.55 + level * 0.3)); under.addColorStop(1, rgba(acc, 0));
    cx.fillStyle = under;
    cx.beginPath(); cx.arc(0, 0, W * 0.72, 0, TAU); cx.fill();
    cx.restore();
    // Корпус.
    cx.shadowColor = 'rgba(0,0,0,.6)'; cx.shadowBlur = 30; cx.shadowOffsetY = 14;
    const body = cx.createLinearGradient(x, y, x, y + H);
    body.addColorStop(0, '#2b2931'); body.addColorStop(1, '#141318');
    cx.fillStyle = body;
    roundRect(cx, x, y, W, H, r); cx.fill();
    cx.shadowBlur = 0; cx.shadowOffsetY = 0;
    cx.strokeStyle = 'rgba(255,255,255,.08)'; cx.lineWidth = 1;
    roundRect(cx, x + 0.5, y + 0.5, W - 1, H - 1, r); cx.stroke();
    // Рёбра по краям.
    cx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let i = 1; i < 6; i++) { cx.beginPath(); cx.moveTo(x + W * 0.03, y + H * (0.1 + i * 0.12)); cx.lineTo(x + W * 0.06, y + H * (0.1 + i * 0.12)); cx.moveTo(x + W * 0.94, y + H * (0.1 + i * 0.12)); cx.lineTo(x + W * 0.97, y + H * (0.1 + i * 0.12)); cx.stroke(); }
    // Наклейка: обложка, название, исполнитель.
    const lx = x + W * 0.08, ly = y + H * 0.08, lw = W * 0.84, lh = H * 0.56;
    const lab = cx.createLinearGradient(lx, ly, lx + lw, ly + lh);
    lab.addColorStop(0, mix(acc, '#ffffff', 0.78)); lab.addColorStop(1, mix(sec, '#ffffff', 0.7));
    cx.fillStyle = lab;
    roundRect(cx, lx, ly, lw, lh, r * 0.6); cx.fill();
    cx.fillStyle = rgba(acc, 0.85);
    cx.fillRect(lx, ly + lh * 0.12, lw, lh * 0.05);
    const tr = this.track || {};
    const cs = lh * 0.3;
    this._cover(cx, lx + lw * 0.04 + cs / 2, ly + lh * 0.2 + cs / 2, cs / 2, false);
    cx.fillStyle = '#1c1a22';
    cx.font = `600 ${Math.round(lh * 0.11)}px "Segoe UI", system-ui, sans-serif`;
    cx.textBaseline = 'top';
    clipText(cx, tr.title || '', lx + lw * 0.06 + cs, ly + lh * 0.2, lw * 0.85 - cs);
    cx.fillStyle = 'rgba(28,26,34,.65)';
    cx.font = `500 ${Math.round(lh * 0.085)}px "Segoe UI", system-ui, sans-serif`;
    clipText(cx, tr.artist || '', lx + lw * 0.06 + cs, ly + lh * 0.34, lw * 0.85 - cs);
    // Окошко со стеклом.
    const wx = x + W * 0.25, wy = y + H * 0.36, ww = W * 0.5, wh = H * 0.22;
    cx.fillStyle = '#08080b';
    roundRect(cx, wx, wy, ww, wh, wh / 2); cx.fill();
    // Катушки: на левой плёнки становится меньше, на правой больше; меньшая крутится быстрее.
    const c1 = { x: x + W * 0.3, y: y + H * 0.47 }, c2 = { x: x + W * 0.7, y: y + H * 0.47 };
    const hub = H * 0.075, full = H * 0.2;
    const rA = hub + (full - hub) * Math.sqrt(1 - prog * 0.92), rB = hub + (full - hub) * Math.sqrt(0.08 + prog * 0.92);
    this.reelA += dt * this.speed * 3.2;
    cx.save();
    roundRect(cx, wx, wy, ww, wh, wh / 2); cx.clip();
    for (const [c, rr, sp] of [[c1, rA, hub / rA], [c2, rB, hub / rB]]) {
      // Плёнка — тёмно-коричневый блин с подсветкой цвета обложки изнутри.
      const g = cx.createRadialGradient(c.x, c.y, hub, c.x, c.y, rr);
      g.addColorStop(0, rgba(acc, 0.85)); g.addColorStop(0.5, '#3a2a22'); g.addColorStop(1, '#1d1612');
      cx.fillStyle = g;
      cx.beginPath(); cx.arc(c.x, c.y, rr, 0, TAU); cx.fill();
      this._reel(cx, c.x, c.y, hub * 1.35, this.reelA / sp * 0.4, acc, level);
    }
    // Плёнка между катушками.
    cx.strokeStyle = '#2e221b'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(c1.x - rA * 0.2, c1.y + rA); cx.lineTo(c2.x + rB * 0.2, c2.y + rB); cx.stroke();
    // Стекло окошка с бликом.
    const glass = cx.createLinearGradient(wx, wy, wx, wy + wh);
    glass.addColorStop(0, 'rgba(255,255,255,.16)'); glass.addColorStop(0.4, 'rgba(255,255,255,.02)'); glass.addColorStop(1, 'rgba(255,255,255,.06)');
    cx.fillStyle = glass; cx.fillRect(wx, wy, ww, wh);
    // На ударах окошко вспыхивает изнутри.
    if (beat > 0.05) { cx.fillStyle = rgba(acc, beat * 0.35); cx.fillRect(wx, wy, ww, wh); }
    cx.restore();
    cx.strokeStyle = rgba(acc, 0.5 + level * 0.4); cx.lineWidth = 1.2;
    cx.shadowColor = acc; cx.shadowBlur = 14 + beat * 24;
    roundRect(cx, wx, wy, ww, wh, wh / 2); cx.stroke();
    cx.shadowBlur = 0;
    // Нижняя трапеция с окошками для головки.
    cx.fillStyle = '#1a191e';
    cx.beginPath();
    cx.moveTo(x + W * 0.2, y + H); cx.lineTo(x + W * 0.25, y + H * 0.78); cx.lineTo(x + W * 0.75, y + H * 0.78); cx.lineTo(x + W * 0.8, y + H); cx.closePath(); cx.fill();
    for (const k of [0.33, 0.47, 0.53, 0.67]) {
      cx.fillStyle = k === 0.47 || k === 0.53 ? rgba(acc, 0.3 + level * 0.5) : '#09090c';
      cx.beginPath(); cx.arc(x + W * k, y + H * 0.88, H * 0.025, 0, TAU); cx.fill();
    }
    // Винты.
    for (const [sx, sy] of [[0.035, 0.06], [0.965, 0.06], [0.035, 0.94], [0.965, 0.94], [0.5, 0.93]]) screw(cx, x + W * sx, y + H * sy, H * 0.022);
    // Светящаяся пыль тянется от вращающихся катушек.
    if (st.playing && Math.random() < 0.35) {
      const c = Math.random() < 0.5 ? c1 : c2;
      this._emit(c.x + rnd(-8, 8), wy + 2, 1, { ang: -Math.PI / 2, spread: 0.6, v0: 14, v1: 40, l0: 1, l1: 2.4, s0: 0.8, s1: 1.8, col: Math.random() < 0.7 ? acc : sec });
    }
  }

  _reel(cx, x, y, r, ang, acc, level) {
    cx.save();
    cx.translate(x, y); cx.rotate(ang);
    cx.fillStyle = '#e9e6ee';
    cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill();
    cx.fillStyle = '#0a0a0d';
    cx.beginPath(); cx.arc(0, 0, r * 0.55, 0, TAU); cx.fill();
    cx.fillStyle = '#e9e6ee';
    for (let i = 0; i < 6; i++) {
      cx.rotate(TAU / 6);
      cx.fillRect(-r * 0.09, r * 0.25, r * 0.18, r * 0.35);
    }
    cx.fillStyle = rgba(acc, 0.6 + level * 0.4);
    cx.beginPath(); cx.arc(0, 0, r * 0.16, 0, TAU); cx.fill();
    cx.restore();
  }

  // ---------- Светодиодная матрица ----------

  _led(cx, a, acc, sec, level, beat, st, dt, t) {
    const N = 32;
    const S = a.r * 1.72;
    const x0 = a.x - S / 2, y0 = a.y - a.r;
    const step = S / N;
    // Панель с рамкой.
    cx.fillStyle = '#060608';
    roundRect(cx, x0 - step, y0 - step, S + step * 2, S + step * 2, step * 1.2); cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,.07)'; cx.lineWidth = 1;
    roundRect(cx, x0 - step + 0.5, y0 - step + 0.5, S + step * 2 - 1, S + step * 2 - 1, step * 1.2); cx.stroke();
    const grid = this.ledGrid;
    this.ledMorph = Math.min(1, this.ledMorph + dt * 1.4);
    const m = this.ledMorph;
    const boost = 0.75 + level * 0.35 + beat * 0.35;
    cx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        let c = grid ? grid[k] : null;
        if (!c) { const g = (Math.sin(i * 0.4 + t) + Math.cos(j * 0.3 - t * 0.7)) * 0.25 + 0.5; c = hexRgb(mix(acc, sec, g)); }
        // Смена трека: точки разлетаются и собираются в новую обложку.
        let px = x0 + (i + 0.5) * step, py = y0 + (j + 0.5) * step;
        if (m < 1) {
          const seed = Math.sin(k * 12.9898) * 43758.5453, fr = seed - Math.floor(seed);
          const ang = fr * TAU, dist = (1 - easeOut(m)) * S * (0.3 + fr * 0.5);
          px += Math.cos(ang) * dist; py += Math.sin(ang) * dist;
        }
        const lum = (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255;
        const twinkle = 0.85 + 0.15 * Math.sin(t * 3 + k);
        const al = Math.min(1, (0.25 + lum * 0.95) * boost * twinkle);
        const col = `rgba(${c[0]},${c[1]},${c[2]},`;
        if (lum > 0.35) {
          cx.fillStyle = col + (al * 0.18) + ')';
          cx.beginPath(); cx.arc(px, py, step * 0.95, 0, TAU); cx.fill();
        }
        cx.fillStyle = col + al + ')';
        cx.beginPath(); cx.arc(px, py, step * 0.34, 0, TAU); cx.fill();
      }
    }
    // Спектр из таких же диодов под матрицей.
    const sp = st.spectrum || [];
    const rows = 5, by = y0 + S + step * 2.4;
    for (let i = 0; i < N; i++) {
      const v = Math.round((sp[i] || 0) * rows * 1.2);
      for (let r = 0; r < rows; r++) {
        const on = r < v;
        cx.fillStyle = on ? rgba(r > 3 ? sec : acc, 0.95) : 'rgba(255,255,255,.05)';
        cx.beginPath(); cx.arc(x0 + (i + 0.5) * step, by + (rows - 1 - r) * step * 0.9, step * 0.3, 0, TAU); cx.fill();
      }
    }
    cx.globalCompositeOperation = 'source-over';
    // На ударах из матрицы вылетают отдельные «диоды».
    if (beat > 0.25) {
      for (let n = 0; n < 3; n++) {
        const i = Math.floor(rnd(0, N)), j = Math.floor(rnd(0, N));
        const c = grid ? grid[j * N + i] : hexRgb(acc);
        this._emit(x0 + (i + 0.5) * step, y0 + (j + 0.5) * step, 1, { v0: 40, v1: 120, l0: 0.5, l1: 1.1, s0: step * 0.3, s1: step * 0.45, col: `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`, kind: 'bubble' });
      }
    }
  }

  // ---------- Жидкий свет ----------

  _lava(cx, a, acc, sec, level, beat, st, dt, t) {
    const R = a.r * 1.3;
    const n = 64;
    if (!this.lavaCv) {
      this.lavaCv = document.createElement('canvas');
      this.lavaCv.width = this.lavaCv.height = n;
      this.lavaBalls = Array.from({ length: 7 }, (_, i) => ({ x: rnd(0.25, 0.75), y: rnd(0.2, 0.9), vy: rnd(-0.05, 0.05), r: rnd(0.09, 0.15), c: i % 2 }));
    }
    const balls = this.lavaBalls;
    const mood = 0.4 + level * 1.2;
    for (const b of balls) {
      // Капли греются внизу и всплывают, остывают вверху и опускаются.
      b.vy += (b.y > 0.6 ? -0.03 : b.y < 0.3 ? 0.03 : 0) * dt * mood;
      b.vy *= 0.995;
      b.y += b.vy * dt * mood;
      b.x += Math.sin(t * 0.3 + b.r * 40) * 0.0008 * mood;
      b.x = Math.max(0.15, Math.min(0.85, b.x));
      b.y = Math.max(0.08, Math.min(0.95, b.y));
    }
    const ctx = this.lavaCv.getContext('2d');
    const img = ctx.createImageData(n, n);
    const ca = hexRgb(acc), cb = hexRgb(sec);
    const swell = 1 + beat * 0.25 + level * 0.15;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = i / n, v = j / n;
        let f = 0, fa = 0;
        for (const b of balls) {
          const dx = u - b.x, dy = v - b.y, rr = b.r * swell;
          const q = (rr * rr) / (dx * dx + dy * dy + 0.0001);
          f += q;
          if (b.c === 0) fa += q;
        }
        const k = (j * n + i) * 4;
        const mixk = fa / (f || 1);
        const alpha = f > 1 ? 0.85 : Math.max(0, (f - 0.5) / 0.5) ** 2 * 0.6;
        const core = f > 1 ? Math.min(1, (f - 1) * 0.35) * 45 : 0;
        img.data[k] = ca[0] * mixk + cb[0] * (1 - mixk) + core;
        img.data[k + 1] = ca[1] * mixk + cb[1] * (1 - mixk) + core;
        img.data[k + 2] = ca[2] * mixk + cb[2] * (1 - mixk) + core;
        img.data[k + 3] = alpha * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cx.save();
    cx.imageSmoothingEnabled = true;
    cx.globalCompositeOperation = 'lighter';
    cx.filter = 'blur(22px)';
    cx.globalAlpha = 0.45;
    cx.drawImage(this.lavaCv, a.x - R, a.y - R, R * 2, R * 2);
    cx.globalCompositeOperation = 'source-over';
    cx.filter = 'blur(2px)';
    cx.globalAlpha = 0.8;
    cx.drawImage(this.lavaCv, a.x - R, a.y - R, R * 2, R * 2);
    cx.restore();
    // Обложка в центре, капли обтекают её.
    cx.save();
    cx.shadowColor = rgba(acc, 0.8); cx.shadowBlur = 40 + beat * 30;
    const cr = a.r * 0.62;
    roundRect(cx, a.x - cr, a.y - cr, cr * 2, cr * 2, cr * 0.18); cx.fillStyle = '#000'; cx.fill();
    cx.restore();
    cx.save();
    roundRect(cx, a.x - cr, a.y - cr, cr * 2, cr * 2, cr * 0.18); cx.clip();
    if (this.img) cx.drawImage(this.img, a.x - cr, a.y - cr, cr * 2, cr * 2);
    cx.restore();
    // От капель на высоких частотах отрываются светящиеся пузырьки.
    const hi = st.spectrum ? st.spectrum.slice(20).reduce((s, v) => s + v, 0) / 12 : 0;
    if (Math.random() < hi * 0.8) {
      const b = balls[Math.floor(rnd(0, balls.length))];
      this._emit(a.x - R + b.x * R * 2, a.y - R + b.y * R * 2, 1, { ang: -Math.PI / 2, spread: 0.4, v0: 20, v1: 60, l0: 1, l1: 2, s0: 1.5, s1: 3.5, col: b.c ? sec : acc, kind: 'bubble' });
    }
  }

  // ---------- Светящаяся планета ----------

  _planet(cx, a, acc, sec, level, beat, st, dt, t) {
    const R = a.r * 0.78;
    const x = a.x, y = a.y;
    const tilt = -0.32;
    const ringR = R * 1.85;
    // Кольцо: задняя половина рисуется до планеты, передняя — после.
    const ring = (front) => {
      cx.save();
      cx.translate(x, y); cx.rotate(tilt);
      // Сплошная полоса кольца — мягкое свечение, поверх неё пыль.
      for (const [rk, wk, al] of [[0.9, 0.16, 0.28], [1.0, 0.05, 0.5]]) {
        cx.strokeStyle = rgba(rk === 1 ? sec : acc, al * (0.7 + level * 0.6));
        cx.lineWidth = ringR * wk * 0.24 * 2;
        cx.beginPath(); cx.ellipse(0, 0, ringR * rk, ringR * rk * 0.24, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); cx.stroke();
      }
      const n = 220;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + t * 0.05 * this.speed + (i % 7) * 0.013;
        const sy = Math.sin(ang);
        if (front ? sy < 0 : sy >= 0) continue;
        const rr = ringR * (0.82 + ((i * 37) % 100) / 100 * 0.22);
        const px = Math.cos(ang) * rr, py = sy * rr * 0.24;
        const al = 0.35 + 0.5 * Math.abs(Math.sin(i * 1.7 + t)) * (0.6 + level);
        cx.fillStyle = rgba(i % 3 ? acc : sec, al);
        cx.beginPath(); cx.arc(px, py, 0.8 + (i % 4) * 0.35 + beat * 1.2, 0, TAU); cx.fill();
      }
      cx.restore();
    };
    // Атмосфера.
    const atm = cx.createRadialGradient(x, y, R * 0.92, x, y, R * (1.5 + level * 0.2 + beat * 0.1));
    atm.addColorStop(0, rgba(acc, 0.65)); atm.addColorStop(0.4, rgba(sec, 0.22)); atm.addColorStop(1, rgba(sec, 0));
    cx.fillStyle = atm;
    cx.beginPath(); cx.arc(x, y, R * 1.6, 0, TAU); cx.fill();
    ring(false);
    // Луны-треки альбома на орбитах: играющая светится и оставляет хвост.
    const cur = this.track && this.track.path;
    const drawMoons = (front) => {
      for (const m of this.moons) {
        m.a += dt * m.s * (0.4 + this.speed);
        const sy = Math.sin(m.a);
        if (front ? sy < 0 : sy >= 0) continue;
        const ox = Math.cos(m.a) * R * m.r, oy = sy * R * m.r * 0.35;
        const px = x + ox * Math.cos(tilt) - oy * Math.sin(tilt), py = y + ox * Math.sin(tilt) + oy * Math.cos(tilt);
        const on = m.path === cur;
        const mr = on ? 6 + level * 4 : 3;
        const g = cx.createRadialGradient(px, py, 0, px, py, mr * 3);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, rgba(on ? acc : mix(acc, '#888', 0.5), on ? 0.95 : 0.6)); g.addColorStop(1, rgba(acc, 0));
        cx.fillStyle = g;
        cx.beginPath(); cx.arc(px, py, mr * 3, 0, TAU); cx.fill();
        if (on && st.playing && Math.random() < 0.6) this._emit(px, py, 1, { v0: 2, v1: 10, l0: 0.8, l1: 1.6, s0: 1, s1: 2.2, col: acc });
      }
    };
    drawMoons(false);
    // Сама планета: обложка медленно «вращается» по сфере.
    cx.save();
    cx.beginPath(); cx.arc(x, y, R, 0, TAU); cx.clip();
    if (this.img) {
      this.angle += dt * 0.02 * (0.3 + this.speed);
      // Плитки чередуются с зеркальными — так на «глобусе» нет шва.
      const w = R * 2.6, span = w * 2, off = ((this.angle * w) % span + span) % span;
      for (let k = -1; k <= 2; k++) {
        const left = x - R - off + k * w;
        if (k % 2 === 0) cx.drawImage(this.img, left, y - R * 1.3, w, R * 2.6);
        else { cx.save(); cx.translate(left + w, 0); cx.scale(-1, 1); cx.drawImage(this.img, 0, y - R * 1.3, w, R * 2.6); cx.restore(); }
      }
    } else {
      cx.fillStyle = mix(acc, '#000', 0.4); cx.fillRect(x - R, y - R, R * 2, R * 2);
    }
    // Объём: свет слева сверху, ночная сторона справа снизу.
    const shade = cx.createRadialGradient(x - R * 0.45, y - R * 0.45, R * 0.1, x, y, R * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,.18)'); shade.addColorStop(0.45, 'rgba(0,0,0,0)'); shade.addColorStop(0.85, 'rgba(0,0,0,.55)'); shade.addColorStop(1, 'rgba(0,0,0,.85)');
    cx.fillStyle = shade; cx.fillRect(x - R, y - R, R * 2, R * 2);
    cx.restore();
    // Светящийся край атмосферы.
    cx.strokeStyle = rgba(mix(acc, '#ffffff', 0.4), 0.55 + beat * 0.4); cx.lineWidth = 2;
    cx.shadowColor = acc; cx.shadowBlur = 20 + beat * 30;
    cx.beginPath(); cx.arc(x, y, R, Math.PI * 0.75, Math.PI * 1.75); cx.stroke();
    cx.shadowBlur = 0;
    ring(true);
    drawMoons(true);
    // Падающая звезда на сильных ударах.
    if (beat > 0.55 && Math.random() < 0.5) {
      const sx = x + rnd(-R * 3, R * 3), sy = y - R * rnd(1.6, 2.4);
      this._emit(sx, sy, 1, { ang: rnd(0.4, 0.9), spread: 0.05, v0: 260, v1: 420, l0: 0.5, l1: 0.8, s0: 1.4, s1: 2, col: '#ffffff', kind: 'spark' });
    }
  }
}

// ---------- помощники рисования ----------

function roundRect(cx, x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

function screw(cx, x, y, r) {
  const g = cx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#d9d6de'); g.addColorStop(1, '#5c5964');
  cx.fillStyle = g;
  cx.beginPath(); cx.arc(x, y, r, 0, TAU); cx.fill();
  cx.strokeStyle = '#2a2830'; cx.lineWidth = Math.max(1, r * 0.3);
  cx.beginPath(); cx.moveTo(x - r * 0.6, y); cx.lineTo(x + r * 0.6, y); cx.stroke();
}

function clipText(cx, s, x, y, w) {
  let t = s;
  while (t.length > 1 && cx.measureText(t).width > w) t = t.slice(0, -1);
  cx.fillText(t === s ? s : t.slice(0, -1) + '…', x, y);
}

function hexRgb(h) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(h));
  if (!m) return [180, 160, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
