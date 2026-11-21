import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toColor, sanitizeImported, styleToLayers, customToStyle, exportData } from '../../src/js/editor.js';

test('parseColor понимает #rgb, #rrggbb, #rrggbbaa и rgba()', () => {
  assert.deepEqual(parseColor('#abc'), { hex: '#aabbcc', a: 1 });
  assert.deepEqual(parseColor('#112233'), { hex: '#112233', a: 1 });
  assert.equal(parseColor('#11223380').a.toFixed(2), '0.50');
  const c = parseColor('rgba(255, 0, 0, 0.25)');
  assert.equal(c.hex, '#ff0000');
  assert.equal(c.a, 0.25);
});

test('toColor → parseColor без потерь', () => {
  const c = parseColor(toColor('#336699', 0.4));
  assert.equal(c.hex, '#336699');
  assert.equal(c.a, 0.4);
});

test('стиль → слои → стиль сохраняет цвета', () => {
  const layers = styleToLayers('aurora', {});
  const st = customToStyle({ name: 'Тест', layers, css: '' });
  assert.equal(st.user, true);
  assert.equal(st.bg, layers.theme.bg);
  assert.equal(st.text, layers.theme.text);
});

test('импорт .glowtheme: мусор отклоняется, длина ограничивается', () => {
  assert.throws(() => sanitizeImported(null));
  assert.throws(() => sanitizeImported({ name: 'x' }));
  const out = sanitizeImported({ name: 'x'.repeat(500), base: 'не-существует', layers: { theme: { bg: '#123456', evil: 'zzz' } }, css: 'a'.repeat(50000) });
  assert.equal(out.name.length, 60);
  assert.equal(out.base, 'aura');
  assert.ok(out.css.length <= 20000);
  assert.equal(out.layers.theme.evil, undefined);
});

test('экспорт и обратный импорт стиля', () => {
  const layers = styleToLayers('aurora', {});
  const json = exportData({ name: 'Мой', base: 'aurora', layers, css: '.x{}' });
  const back = sanitizeImported(JSON.parse(json));
  assert.equal(back.name, 'Мой');
  assert.equal(back.layers.theme.bg, layers.theme.bg);
  assert.equal(back.css, '.x{}');
});
