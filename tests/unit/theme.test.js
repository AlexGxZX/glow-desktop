import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, contrast, md3Scheme, hexToRgb, rgbToHex, mix } from '../../src/js/theme.js';

const isColor = (v) => typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(|var\(|linear-gradient|radial-gradient|transparent)/i.test(v.trim());

test('контраст считается по WCAG', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
});

test('hex ↔ rgb и смешивание', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]);
  assert.equal(rgbToHex([255, 128, 0]), '#ff8000');
  assert.equal(mix('#000000', '#ffffff', 0.5).toLowerCase(), '#808080');
});

test('у каждого встроенного стиля есть имя и основные цвета', () => {
  const ids = Object.keys(STYLES).filter((k) => !STYLES[k].user && k !== '__edit');
  assert.ok(ids.length >= 20, `стилей: ${ids.length}`);
  for (const id of ids) {
    const s = STYLES[id];
    assert.ok(s.name, `${id}: нет имени`);
    for (const k of ['bg', 'text', 'accent']) {
      if (s[k] === undefined) continue; // MD3 и динамические стили берут цвета из схемы
      assert.ok(isColor(s[k]), `${id}.${k} = ${s[k]}`);
    }
  }
});

for (const variant of ['tonal', 'vibrant', 'expressive', 'fidelity', 'mono']) {
  for (const light of [false, true]) {
    test(`MD3 ${variant}${light ? ' светлая' : ''}: текст читается на поверхности`, () => {
      const s = md3Scheme('#6750a4', 'standard', null, variant, light);
      assert.ok(contrast(s.onSurface, s.surface) >= 7, `onSurface/surface = ${contrast(s.onSurface, s.surface).toFixed(1)}`);
      assert.ok(contrast(s.onPrimary, s.primary) >= 3, `onPrimary/primary = ${contrast(s.onPrimary, s.primary).toFixed(1)}`);
      const lightSurface = contrast(s.surface, '#000000') > contrast(s.surface, '#ffffff');
      assert.equal(lightSurface, light);
    });
  }
}

test('MD3 монохромная схема без цвета', () => {
  const s = md3Scheme('#e5383b', 'standard', null, 'mono');
  const [r, g, b] = hexToRgb(s.primary);
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 8, s.primary);
});
