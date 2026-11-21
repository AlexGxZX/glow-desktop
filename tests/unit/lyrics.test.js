import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, lineAt } from '../../src/js/lyrics.js';

test('пустой текст — нет текста', () => {
  assert.equal(parseLrc(''), null);
  assert.equal(parseLrc('   \n '), null);
});

test('синхронный текст сортируется, метки с сотыми и тысячными', () => {
  const l = parseLrc('[00:10.50]вторая\n[00:01.250]первая\n[ar:Кто-то]');
  assert.equal(l.synced, true);
  assert.deepEqual(l.lines.map((x) => x.text), ['первая', 'вторая']);
  assert.equal(l.lines[0].t, 1.25);
  assert.equal(l.lines[1].t, 10.5);
});

test('несколько меток на одной строке — повтор припева', () => {
  const l = parseLrc('[00:05.00][01:05.00]припев');
  assert.equal(l.lines.length, 2);
  assert.equal(l.lines[1].t, 65);
});

test('offset сдвигает текст раньше и не уходит в минус', () => {
  const l = parseLrc('[offset:+500]\n[00:00.20]а\n[00:02.00]б');
  assert.equal(l.lines[0].t, 0);
  assert.equal(l.lines[1].t, 1.5);
});

test('обычный текст без меток', () => {
  const l = parseLrc('строка 1\n\nстрока 2');
  assert.equal(l.synced, false);
  assert.deepEqual(l.lines.map((x) => x.text), ['строка 1', '', 'строка 2']);
  assert.equal(lineAt(l, 10), -1);
});

test('lineAt находит текущую строку', () => {
  const l = parseLrc('[00:01.00]a\n[00:03.00]b\n[00:05.00]c');
  assert.equal(lineAt(l, 0), -1);
  assert.equal(lineAt(l, 1), 0);
  assert.equal(lineAt(l, 4.9), 2); // строка подсвечивается чуть заранее (0,15 с)
  assert.equal(lineAt(l, 4.8), 1);
  assert.equal(lineAt(l, 100), 2);
});
