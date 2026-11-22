// Детектор ударов по спектральному потоку. Чистые функции: без DOM и Web Audio,
// поэтому их можно проверять unit-тестами. Время передаётся снаружи (performance.now()).

/** Шаг пружины с затуханием: s = {x, v}, k — жёсткость, c — демпфирование. Меняет s и возвращает его. */
export function stepSpring(s, k, c, dt) {
  const a = -k * s.x - c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
  return s;
}

/** Диапазоны бинов [i0, i1) для полос частот в герцах. */
export function binRanges(bandsHz, binHz, binCount) {
  return bandsHz.map(([a, b]) => {
    const i0 = Math.min(binCount - 1, Math.max(1, Math.floor(a / binHz)));
    const i1 = Math.min(binCount, Math.max(i0 + 1, Math.floor(b / binHz)));
    return [i0, i1];
  });
}

/**
 * Средний положительный прирост амплитуды в каждой полосе, 0…1.
 * prev и cur — байтовые спектры (0…255). Без prev (первый кадр) все полосы равны 0.
 */
export function bandFlux(prev, cur, ranges) {
  const out = new Array(ranges.length).fill(0);
  if (!prev || !cur) return out;
  ranges.forEach(([i0, i1], b) => {
    let s = 0;
    for (let i = i0; i < i1; i++) {
      const d = cur[i] - prev[i];
      if (d > 0) s += d;
    }
    out[b] = s / Math.max(1, i1 - i0) / 255;
  });
  return out;
}

/**
 * Поток по спектру в децибелах (несглаженный анализатор). Каждый бин даёт прирост до 30 дБ,
 * поэтому резкий удар виден сразу. Результат 0…1 по среднему по полосе.
 */
export function bandFluxDb(prev, cur, ranges) {
  const out = new Array(ranges.length).fill(0);
  if (!prev || !cur) return out;
  ranges.forEach(([i0, i1], b) => {
    let s = 0;
    for (let i = i0; i < i1; i++) {
      const d = Math.max(-120, cur[i]) - Math.max(-120, prev[i]);
      if (d > 0) s += Math.min(d, 30) / 30;
    }
    out[b] = s / Math.max(1, i1 - i0);
  });
  return out;
}

/**
 * Детектор удара: порог следует за скользящим средним потока,
 * между ударами есть пауза. Возвращает силу удара 0…1 или 0.
 */
export function createOnsetDetector({ ratio = 1.6, floor = 0.01, refractory = 150, decay = 0.9, scale = 0.12 } = {}) {
  let avg = 0;
  let last = -Infinity;
  let seen = false;
  let r = ratio;
  return {
    step(flux, now) {
      // Первый кадр только задаёт среднее: иначе любой поток сразу считается ударом.
      if (!seen) { seen = true; avg = flux; return 0; }
      const thr = avg * r + floor;
      let strength = 0;
      if (flux > thr && now - last >= refractory) {
        strength = Math.min(1, (flux - thr) / scale + 0.35);
        last = now;
      }
      avg = avg * decay + flux * (1 - decay);
      return strength;
    },
    /** Чем меньше порог, тем чаще удары. Меняется без сброса состояния. */
    setRatio(v) {
      r = v;
    },
    reset() {
      avg = 0;
      last = -Infinity;
      seen = false;
    },
  };
}
