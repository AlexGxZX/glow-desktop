import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binRanges, bandFlux, bandFluxDb, createOnsetDetector, stepSpring } from '../../src/js/beat.js';

test('stepSpring: толчок поднимает значение и возвращает к нулю', () => {
  const s = { x: 0, v: 3.2 };   // как удар баса при силе 50%
  let peak = 0;
  for (let i = 0; i < 600; i++) { stepSpring(s, 260, 16, 1 / 60); peak = Math.max(peak, s.x); }
  assert.ok(peak > 0.07 && peak < 0.11, `peak ${peak}`);
  assert.ok(Math.abs(s.x) < 0.005, `settled ${s.x}`);
});

test('bandFluxDb: резкий рост в дБ даёт большой поток, падение не считается', () => {
  const prev = new Float32Array([-90, -90, -90, -90]);
  const up = new Float32Array([-60, -60, -60, -60]);   // +30 дБ на каждом бине
  assert.equal(bandFluxDb(prev, up, [[0, 4]])[0], 1);
  assert.equal(bandFluxDb(up, prev, [[0, 4]])[0], 0);
  assert.equal(bandFluxDb(null, up, [[0, 4]])[0], 0);
});

test('bandFluxDb: тишина (−Infinity) не даёт ложного потока', () => {
  const silent = new Float32Array([-Infinity, -Infinity]);
  const quiet = new Float32Array([-Infinity, -Infinity]);
  assert.equal(bandFluxDb(silent, quiet, [[0, 2]])[0], 0);
});

test('binRanges: частоты переводятся в бины и зажимаются', () => {
  const r = binRanges([[40, 160], [4000, 12000]], 25, 512);
  assert.deepEqual(r[0], [1, 6]);       // 40/25=1, 160/25=6
  assert.deepEqual(r[1], [160, 480]);
  const edge = binRanges([[0, 1e9]], 25, 512);
  assert.deepEqual(edge[0], [1, 512]);
});

test('bandFlux: без предыдущего кадра все полосы нулевые', () => {
  const cur = new Uint8Array([200, 200, 200, 200]);
  assert.deepEqual(bandFlux(null, cur, [[0, 4]]), [0]);
});

test('bandFlux: учитываются только нарастания, результат 0…1', () => {
  const prev = new Uint8Array([100, 100, 100, 100]);
  const cur = new Uint8Array([255, 50, 100, 150]);   // +155, −50, 0, +50
  const [f] = bandFlux(prev, cur, [[0, 4]]);
  assert.ok(Math.abs(f - (155 + 50) / 4 / 255) < 1e-9);
  const max = bandFlux(new Uint8Array(8), new Uint8Array(8).fill(255), [[0, 8]]);
  assert.equal(max[0], 1);
});

test('detector: стабильный спектр не даёт ударов', () => {
  const d = createOnsetDetector();
  let hits = 0;
  for (let t = 0; t < 2000; t += 16) if (d.step(0.03, t) > 0) hits++;
  assert.equal(hits, 0);
});

test('detector: тихий шум ниже порога не даёт ударов', () => {
  const d = createOnsetDetector();
  let hits = 0;
  for (let t = 0; t < 2000; t += 16) if (d.step(0.004 * (t % 3), t) > 0) hits++;
  assert.equal(hits, 0);
});

test('detector: резкий всплеск даёт удар, силу в пределах 0…1', () => {
  const d = createOnsetDetector();
  for (let t = 0; t < 500; t += 16) d.step(0.02, t);
  const s = d.step(0.3, 520);
  assert.ok(s > 0 && s <= 1, `strength ${s}`);
});

test('detector: пауза между ударами работает', () => {
  const d = createOnsetDetector({ refractory: 150 });
  for (let t = 0; t < 500; t += 16) d.step(0.02, t);
  assert.ok(d.step(0.3, 520) > 0);
  assert.equal(d.step(0.3, 600), 0);   // через 80 мс — ещё внутри паузы
  assert.ok(d.step(0.02, 640) === 0);
  for (let t = 660; t < 900; t += 16) d.step(0.02, t);
  assert.ok(d.step(0.3, 920) > 0);     // через 400 мс — снова удар
});

test('detector: трек с ударами каждые 500 мс даёт примерно столько же ударов', () => {
  const d = createOnsetDetector();
  let hits = 0;
  for (let t = 0; t < 10000; t += 16) {
    const kick = t % 500 < 16;
    const flux = kick ? 0.25 : 0.02 + 0.01 * Math.sin(t / 50);
    if (d.step(flux, t) > 0) hits++;
  }
  assert.ok(hits >= 18 && hits <= 22, `hits ${hits}`);
});

test('detector: reset сбрасывает среднее и паузу, первый кадр снова без удара', () => {
  const d = createOnsetDetector();
  for (let t = 0; t < 500; t += 16) d.step(0.02, t);
  assert.ok(d.step(0.3, 520) > 0);
  d.reset();
  assert.equal(d.step(0.3, 530), 0);   // первый кадр после сброса задаёт среднее
  for (let t = 546; t < 700; t += 16) d.step(0.02, t);
  assert.ok(d.step(0.3, 720) > 0);     // пауза сброшена: удар проходит сразу после разогрева
});
