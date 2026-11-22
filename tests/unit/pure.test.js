import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildM3u, parseM3u, matchM3u, joinPath, findDuplicates, qualityScore, computeWrapped, historyYears, firstArtist, normTitle } from '../../src/js/pure.js';

const T = (path, title, artist, extra = {}) => ({ path, title, artist, album: '', duration: 200, ...extra });

test('m3u: сборка и обратный разбор', () => {
  const text = buildM3u([T('C:\\Music\\a.flac', 'Свет', 'Mira'), T('C:\\Music\\b.mp3', 'Ночь', '')]);
  assert.ok(text.startsWith('#EXTM3U'));
  const e = parseM3u(text);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { path: 'C:\\Music\\a.flac', title: 'Свет', artist: 'Mira', duration: 200 });
  assert.equal(e[1].artist, '');
  assert.equal(e[1].title, 'Ночь');
});

test('m3u: относительные пути, file://, ссылки и BOM', () => {
  const e = parseM3u('\uFEFF#EXTM3U\n..\\Rock\\x.mp3\nsub/y.flac\nfile:///D:/Music/z%20z.mp3\nhttp://radio.example/stream\n', 'C:\\Music\\Lists');
  assert.deepEqual(e.map((x) => x.path), ['C:\\Music\\Rock\\x.mp3', 'C:\\Music\\Lists\\sub\\y.flac', 'D:\\Music\\z z.mp3']);
  assert.equal(joinPath('C:\\A\\B', '..\\..\\..\\c.mp3'), 'C:\\c.mp3');
});

test('m3u: сопоставление с медиатекой', () => {
  const lib = [T('C:\\Music\\A\\one.flac', 'One', 'Artist'), T('C:\\Music\\B\\two.mp3', 'Two (Remastered 2011)', 'Band feat. X', { duration: 180 })];
  const { found, missing } = matchM3u([
    { path: 'c:/music/a/ONE.flac', title: '', artist: '', duration: 0 }, // регистр и слеши
    { path: 'E:\\old\\two.mp3', title: '', artist: '', duration: 0 }, // по имени файла
    { path: 'E:\\x.mp3', title: 'Two', artist: 'Band', duration: 181 }, // по тегам
    { path: 'E:\\nope.mp3', title: 'Nope', artist: 'Nobody', duration: 100 },
  ], lib);
  assert.deepEqual(found.map((t) => t.title), ['One', 'Two (Remastered 2011)', 'Two (Remastered 2011)']);
  assert.equal(missing.length, 1);
});

test('нормализация имён для сравнения', () => {
  assert.equal(firstArtist('VELIAL SQUAD/Meep'), 'velial squad');
  assert.equal(firstArtist('Kairo feat. Nova'), 'kairo');
  assert.equal(normTitle('Ёлка (Remastered 2019)'), 'елка');
});

test('дубликаты: группы, качество, разные версии не склеиваются', () => {
  const lib = [
    T('a.mp3', 'Song', 'Band', { format: 'mp3', bitrate: 320, duration: 200 }),
    T('a.flac', 'Song', 'Band', { format: 'flac', bit_depth: 16, sample_rate: 44100, duration: 201 }),
    T('a128.mp3', 'song', 'band, guest', { format: 'mp3', bitrate: 128, duration: 199 }),
    T('live.mp3', 'Song', 'Band', { format: 'mp3', bitrate: 320, duration: 320 }), // другая версия
    T('other.mp3', 'Other', 'Band'),
  ];
  const g = findDuplicates(lib);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map((t) => t.path), ['a.flac', 'a.mp3', 'a128.mp3']);
  assert.ok(qualityScore(lib[1]) > qualityScore(lib[0]));
});

test('итоги года', () => {
  const byPath = new Map([
    ['a', T('a', 'A', 'X', { duration: 180, album: 'Al', genre: 'Rock' })],
    ['b', T('b', 'B', 'Y', { duration: 240, genre: 'Pop' })],
  ]);
  const at = (y, m, d, h = 12) => Math.floor(new Date(y, m, d, h).getTime() / 1000);
  const history = [
    { p: 'b', t: at(2025, 5, 1) },
    { p: 'a', t: at(2026, 0, 1, 9) }, { p: 'a', t: at(2026, 0, 2, 9) }, { p: 'a', t: at(2026, 0, 3, 21) },
    { p: 'b', t: at(2026, 2, 10, 21) }, { p: 'gone', t: at(2026, 2, 11, 21) },
  ];
  assert.deepEqual(historyYears(history), [2026, 2025]);
  const w = computeWrapped(history, byPath, 2026);
  assert.equal(w.plays, 5);
  assert.equal(w.minutes, 13); // 3×3 мин + 4 мин, у удалённого трека длительность неизвестна
  assert.equal(w.topTracks[0][0], 'a');
  assert.equal(w.topArtists[0][0], 'X');
  assert.equal(w.topGenre[0], 'Rock');
  assert.equal(w.streak, 3);
  assert.equal(w.days, 5);
  assert.equal(w.peakHour, 21);
  assert.equal(w.discovery[0], 'X'); // Y слушали ещё в 2025-м
  assert.equal(w.topAlbums[0].album, 'Al');
});
