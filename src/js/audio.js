// Звуковой движок Glow: два аудио-элемента (для перехода без пауз) → Web Audio:
// ReplayGain → усиление → 10-полосный эквалайзер → баланс → лимитер → анализатор → громкость.
import { binRanges, bandFluxDb, createOnsetDetector } from './beat.js';

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_LABELS = ['31', '62', '125', '250', '500', '1K', '2K', '4K', '8K', '16K'];

export const EQ_PRESETS = {
  flat: { name: 'Ровно', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { name: 'Бас', gains: [5, 4.5, 3.5, 2, 0.5, 0, 0, 0, 0, 0] },
  bassplus: { name: 'Мощный бас', gains: [8, 7, 5.5, 3, 1, 0, -0.5, -0.5, 0, 0] },
  treble: { name: 'Высокие', gains: [0, 0, 0, 0, 0, 0.5, 2, 3.5, 4.5, 5] },
  vocal: { name: 'Вокал', gains: [-2, -1.5, -1, 1, 3, 3.5, 3, 1.5, 0, -1] },
  rock: { name: 'Рок', gains: [4.5, 3.5, 2, 0, -1, -0.5, 1.5, 3, 4, 4.5] },
  pop: { name: 'Поп', gains: [-1, 0, 1.5, 3, 3.5, 2.5, 1, 0, -0.5, -1] },
  electronic: { name: 'Электроника', gains: [5, 4, 1.5, 0, -1.5, 1, 0.5, 1.5, 4, 4.5] },
  hiphop: { name: 'Хип-хоп', gains: [5.5, 4.5, 2, 2.5, -1, -1, 1, -0.5, 1.5, 2.5] },
  classical: { name: 'Классика', gains: [3.5, 3, 2, 1, -1, -1, 0, 2, 3, 3.5] },
  loudness: { name: 'Громкость', gains: [6, 4, 1, 0, -1, 0, -0.5, 1, 4, 5] },
};

const dbToGain = (db) => Math.pow(10, db / 20);

function parseGain(s) {
  if (!s) return null;
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
}

export class Engine extends EventTarget {
  constructor(srcOf) {
    super();
    this.srcOf = srcOf;
    this.els = [new Audio(), new Audio()];
    for (const el of this.els) {
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
    }
    this.cur = 0;
    this.track = null;
    this.nextTrack = null; // подготовленный для перехода без паузы
    this.nextReady = false;
    this.gapless = true;
    this.rgMode = 'track';
    this.rgPreamp = 0;
    this.volume = 0.8;
    this.muted = false;
    this.ctx = null;
    this._advancing = false;
    this._fade = null;
    this.crossfade = 0;
    this._xf = null;
    this.loop = false; // повтор одного трека — живёт в движке и переживает смену трека

    this.els.forEach((el, i) => {
      el.addEventListener('ended', () => { if (i === this.cur) this._onEnded(); });
      el.addEventListener('error', () => {
        if (i === this.cur && el.src) this.dispatchEvent(new CustomEvent('error', { detail: this.track }));
      });
      el.addEventListener('play', () => { if (i === this.cur) this.dispatchEvent(new Event('statechange')); });
      el.addEventListener('pause', () => { if (i === this.cur) this.dispatchEvent(new Event('statechange')); });
      el.addEventListener('loadedmetadata', () => { if (i === this.cur) this.dispatchEvent(new Event('statechange')); });
    });

    // Частый тик: время для интерфейса и переход без паузы на стыке треков.
    setInterval(() => this._tick(), 40);
  }

  get el() { return this.els[this.cur]; }
  get other() { return this.els[1 - this.cur]; }
  get playing() { return !this.el.paused && !this.el.ended && !!this.el.src; }
  get time() { return this.el.currentTime || 0; }
  get duration() { const d = this.el.duration; return Number.isFinite(d) ? d : (this.track?.duration || 0); }

  _ensureGraph() {
    if (this.ctx) return;
    const ctx = new AudioContext({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.trackGains = this.els.map(() => ctx.createGain());
    this.sources = this.els.map((el) => ctx.createMediaElementSource(el));
    this.preamp = ctx.createGain();
    this.bands = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.3;
      b.gain.value = 0;
      return b;
    });
    this.panner = ctx.createStereoPanner();
    this.limiter = ctx.createDynamicsCompressor();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.master = ctx.createGain();

    this.sources.forEach((s, i) => { s.connect(this.trackGains[i]); this.trackGains[i].connect(this.preamp); });
    let node = this.preamp;
    for (const b of this.bands) { node.connect(b); node = b; }
    node.connect(this.panner);
    this.panner.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.master);
    // Отдельный анализатор для ударов: без сглаживания, так резкий удар виден сразу.
    this.beatAnalyser = ctx.createAnalyser();
    this.beatAnalyser.fftSize = 1024;
    this.beatAnalyser.smoothingTimeConstant = 0;
    this.limiter.connect(this.beatAnalyser);
    this.master.connect(ctx.destination);

    // Индикаторы уровня L/R для стиля Studio.
    this.splitter = ctx.createChannelSplitter(2);
    this.limiter.connect(this.splitter);
    this.meterL = ctx.createAnalyser();
    this.meterR = ctx.createAnalyser();
    this.meterL.fftSize = this.meterR.fftSize = 1024;
    this.splitter.connect(this.meterL, 0);
    this.splitter.connect(this.meterR, 1);
    this._td = new Float32Array(1024);
    this._spec = new Uint8Array(this.analyser.frequencyBinCount);

    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this._prevDb = null;
    this._db = new Float32Array(this.beatAnalyser.frequencyBinCount);
    this._onsets = { all: createOnsetDetector(), bass: createOnsetDetector(), mid: createOnsetDetector(), high: createOnsetDetector() };
    this._applyPending();
  }

  _applyPending() {
    if (!this.ctx) return;
    const p = this._pending || {};
    if (p.eq) this.setEq(p.eq);
    if (p.preampDb !== undefined) this.setPreamp(p.preampDb);
    if (p.balance !== undefined) this.setBalance(p.balance);
    this.setLimiter(p.limiter !== false);
    this._applyVolume();
    this._applyTrackGain(this.cur, this.track);
  }

  // ---------- Загрузка и управление ----------

  load(track, { autoplay = true, startAt = 0 } = {}) {
    this._ensureGraph();
    this._cancelFade();
    if (this._xf) this._xf.pending = undefined;
    this._endCrossfade();
    this.other.pause();
    this.nextTrack = null;
    this.nextReady = false;
    const el = this.el;
    this.track = track;
    el.loop = this.loop;
    el.src = this.srcOf(track.path);
    this._applyTrackGain(this.cur, track);
    if (startAt > 0) {
      const seek = () => { try { el.currentTime = startAt; } catch { /* ignore */ } el.removeEventListener('loadedmetadata', seek); };
      el.addEventListener('loadedmetadata', seek);
    }
    if (autoplay) this.play();
    this.dispatchEvent(new Event('statechange'));
  }

  /** Подготовить следующий трек во втором элементе, чтобы переход был без паузы. */
  prepareNext(track) {
    // Пока идёт кроссфейд, второй элемент ещё доигрывает прошлый трек — подготовим позже.
    if (this._xf) { this._xf.pending = track; return; }
    if ((!this.gapless && !(this.crossfade > 0)) || !track) { this.nextTrack = null; this.nextReady = false; this.other.removeAttribute('src'); return; }
    if (this.nextTrack && this.nextTrack.path === track.path) return;
    this.nextTrack = track;
    this.nextReady = false;
    const o = this.other;
    o.pause();
    o.src = this.srcOf(track.path);
    o.currentTime = 0;
    o.load();
    const ready = () => { this.nextReady = true; o.removeEventListener('canplay', ready); };
    o.addEventListener('canplay', ready);
  }

  play() {
    this._ensureGraph();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const p = this.el.play();
    if (p && p.catch) p.catch(() => {});
  }

  pause() { this._endCrossfade(); this.el.pause(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  seek(sec) {
    const d = this.duration;
    if (!d) return;
    this.el.currentTime = Math.max(0, Math.min(d - 0.05, sec));
    this.dispatchEvent(new Event('timeupdate'));
  }

  stop() {
    this.el.pause();
    try { this.el.currentTime = 0; } catch { /* ignore */ }
  }

  setLoop(on) {
    this.loop = !!on;
    this.el.loop = this.loop;
    this.other.loop = false;
  }

  _onEnded() {
    if (this._advancing) return;
    if (this.nextTrack) this._advance();
    else this.dispatchEvent(new Event('ended'));
  }

  _advance(fadeSec = 0) {
    if (!this.nextTrack) return;
    this._advancing = true;
    this._endCrossfade();
    const prev = this.el, prevI = this.cur;
    this.cur = 1 - this.cur;
    this.track = this.nextTrack;
    this.nextTrack = null;
    this.nextReady = false;
    this._applyTrackGain(this.cur, this.track);
    this.el.loop = this.loop;
    prev.loop = false;
    if (fadeSec > 0.2 && this.ctx) {
      // Кроссфейд: новый трек нарастает, старый затихает, оба играют одновременно.
      const t0 = this.ctx.currentTime, gNew = this.trackGains[this.cur].gain, gOld = this.trackGains[prevI].gain;
      const target = this._rgGain(this.track);
      gNew.cancelScheduledValues(t0); gNew.setValueAtTime(0.0001, t0); gNew.linearRampToValueAtTime(target, t0 + fadeSec);
      gOld.cancelScheduledValues(t0); gOld.setValueAtTime(gOld.value, t0); gOld.linearRampToValueAtTime(0.0001, t0 + fadeSec);
      this.play();
      this._xf = { prev, prevI, timer: setTimeout(() => this._endCrossfade(), fadeSec * 1000 + 80) };
    } else {
      this.play();
      prev.pause();
      setTimeout(() => { if (this.els[1 - this.cur] === prev) { try { prev.currentTime = 0; } catch { /* ignore */ } } }, 50);
    }
    this._advancing = false;
    this.dispatchEvent(new CustomEvent('advanced', { detail: this.track }));
  }

  _endCrossfade() {
    const x = this._xf;
    if (!x) return;
    this._xf = null;
    clearTimeout(x.timer);
    x.prev.pause();
    try { x.prev.currentTime = 0; } catch { /* ignore */ }
    if (this.ctx) { const g = this.trackGains[x.prevI].gain; g.cancelScheduledValues(this.ctx.currentTime); g.value = 1; }
    if (x.pending !== undefined) this.prepareNext(x.pending);
  }

  _tick() {
    if (!this.el.src) return;
    if (this.playing) {
      const left = this.duration - this.time;
      const cf = Math.min(this.crossfade || 0, (this.duration || 0) / 3);
      if (cf > 0.2 && this.nextTrack && this.nextReady && !this.el.loop && !this._xf && left > 0 && left <= cf) { this._advance(cf); return; }
      if (this.nextTrack && this.nextReady && !this.el.loop && left > 0 && left < 0.06) this._advance();
      this.dispatchEvent(new Event('timeupdate'));
    }
  }

  // ---------- Громкость, ReplayGain ----------

  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); this._applyVolume(); }
  setMuted(m) { this.muted = !!m; this._applyVolume(); }

  _applyVolume() {
    if (!this.ctx) return;
    // Кривая громкости ближе к слуху: квадрат от положения ползунка.
    const g = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.015);
  }

  setReplayGain(mode, preampDb = 0) {
    this.rgMode = mode;
    this.rgPreamp = preampDb;
    this._applyTrackGain(this.cur, this.track);
  }

  _rgGain(track) {
    if (!track || this.rgMode === 'off') return 1;
    const tg = parseGain(track.rg_track), ag = parseGain(track.rg_album);
    const db = this.rgMode === 'album' ? (ag ?? tg) : (tg ?? ag);
    if (db === null || db === undefined) return 1;
    return dbToGain(db + this.rgPreamp);
  }

  _applyTrackGain(i, track) {
    if (!this.ctx) return;
    const g = this.trackGains[i].gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.value = this._rgGain(track);
  }

  // ---------- Эквалайзер и звук ----------

  _store(k, v) { this._pending = { ...(this._pending || {}), [k]: v }; }

  setEq(gains) {
    this._store('eq', gains);
    if (!this.ctx) return;
    this.bands.forEach((b, i) => b.gain.setTargetAtTime(gains[i] || 0, this.ctx.currentTime, 0.02));
  }

  setPreamp(db) {
    this._store('preampDb', db);
    if (!this.ctx) return;
    this.preamp.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02);
  }

  setBalance(p) {
    this._store('balance', p);
    if (!this.ctx) return;
    this.panner.pan.value = Math.max(-1, Math.min(1, p));
  }

  /** Лимитер не даёт звуку хрипеть, когда эквалайзер сильно поднимает бас. */
  setLimiter(on) {
    this._store('limiter', on);
    if (!this.ctx) return;
    const l = this.limiter;
    if (on) { l.threshold.value = -1.5; l.knee.value = 0; l.ratio.value = 20; l.attack.value = 0.003; l.release.value = 0.12; }
    else { l.threshold.value = 0; l.knee.value = 0; l.ratio.value = 1; }
  }

  /** АЧХ эквалайзера в дБ для рисования кривой. */
  response(freqs, gains) {
    const out = new Float32Array(freqs.length);
    const ctx = this.ctx || new OfflineAudioContext(1, 1, 44100);
    const f = new Float32Array(freqs);
    const mag = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
    EQ_FREQS.forEach((fr, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = fr; b.Q.value = 1.3; b.gain.value = gains[i] || 0;
      b.getFrequencyResponse(f, mag, ph);
      for (let k = 0; k < out.length; k++) out[k] += 20 * Math.log10(mag[k] || 1e-6);
    });
    return out;
  }

  // ---------- Анализ для визуала ----------

  /** Уровни и удары баса. Разрешение на микрофон не нужно — анализируем свой же звук. */
  levels() {
    // Несколько потребителей за кадр (экран плеера и фон окна) получают один и тот же замер.
    const t = performance.now();
    if (this._lv && t - this._lvAt < 12) return this._lv;
    this._lvAt = t;
    try {
      this._lv = this._levels();
    } catch (err) {
      console.warn('beat detector error', err);
      this._lv = { bass: 0, mid: 0, high: 0, level: 0, beat: 0, bandBeat: { bass: 0, mid: 0, high: 0 } };
    }
    return this._lv;
  }

  _levels() {
    if (!this.ctx || !this.playing) {
      this._resetBeats();
      return { bass: 0, mid: 0, high: 0, level: 0, beat: 0, bandBeat: { bass: 0, mid: 0, high: 0 } };
    }
    this.analyser.getByteFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const avg = (a, b) => {
      const i0 = Math.max(1, Math.floor(a / binHz)), i1 = Math.max(i0 + 1, Math.floor(b / binHz));
      let s = 0;
      for (let i = i0; i < i1; i++) s += this.freq[i];
      return s / (i1 - i0) / 255;
    };
    const bass = avg(35, 160), mid = avg(250, 2000), high = avg(4000, 12000);
    const level = bass * 0.5 + mid * 0.35 + high * 0.15;
    // Удар: весь спектр 40 Гц – 12 кГц, плюс отдельно бас, средние и высокие для разных эффектов.
    const [all, bassF, midF, highF] = binRanges([[40, 12000], [35, 160], [250, 2000], [4000, 12000]], binHz, this._db.length);
    this.beatAnalyser.getFloatFrequencyData(this._db);
    const flux = bandFluxDb(this._prevDb, this._db, [all, bassF, midF, highF]);
    this._prevDb = this._prevDb || new Float32Array(this._db.length);
    this._prevDb.set(this._db);
    const now = performance.now();
    const o = this._onsets;
    const beat = o.all.step(flux[0], now);
    const bandBeat = { bass: o.bass.step(flux[1], now), mid: o.mid.step(flux[2], now), high: o.high.step(flux[3], now) };
    return { bass, mid, high, level, beat, bandBeat };
  }

  _resetBeats() {
    this._prevDb = null;
    for (const k in this._onsets) this._onsets[k].reset();
  }

  /** Чувствительность ударов, 0…1: 0 — только сильные удары, 1 — почти любой всплеск. */
  setBeatSensitivity(k) {
    const ratio = 2 - Math.max(0, Math.min(1, k));
    for (const key in this._onsets) this._onsets[key].setRatio(ratio);
  }

  /** Уровни L/R: RMS и пик, 0…1 по шкале от −48 до 0 дБFS. */
  meters() {
    if (!this.ctx || !this.playing) return { l: 0, r: 0, pl: 0, pr: 0 };
    const one = (an) => {
      an.getFloatTimeDomainData(this._td);
      let sum = 0, peak = 0;
      for (let i = 0; i < this._td.length; i++) { const v = this._td[i]; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
      const toK = (x) => Math.max(0, Math.min(1, (20 * Math.log10(x || 1e-6) + 48) / 48));
      return [toK(Math.sqrt(sum / this._td.length)), toK(peak)];
    };
    const [l, pl] = one(this.meterL), [r, pr] = one(this.meterR);
    return { l, r, pl, pr };
  }

  /** Спектр: n полос в логарифмической шкале 40 Гц – 16 кГц, значения 0…1. */
  spectrum(n) {
    const out = new Array(n).fill(0);
    if (!this.ctx || !this.playing) return out;
    this.analyser.getByteFrequencyData(this._spec);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    for (let i = 0; i < n; i++) {
      const f0 = 40 * Math.pow(400, i / n), f1 = 40 * Math.pow(400, (i + 1) / n);
      const a = Math.max(1, Math.floor(f0 / binHz)), b = Math.max(a + 1, Math.ceil(f1 / binHz));
      let m = 0;
      for (let k = a; k < b && k < this._spec.length; k++) m = Math.max(m, this._spec[k]);
      out[i] = m / 255;
    }
    return out;
  }

  // ---------- Плавное затухание (таймер сна) ----------

  fadeOutAndPause(seconds = 12) {
    if (!this.ctx) { this.pause(); return; }
    this._cancelFade();
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + seconds);
    this._fade = setTimeout(() => { this.pause(); this._fade = null; this._applyVolume(); }, seconds * 1000);
  }

  _cancelFade() {
    if (this._fade) { clearTimeout(this._fade); this._fade = null; }
    if (this.ctx) { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this._applyVolume(); }
  }
}
