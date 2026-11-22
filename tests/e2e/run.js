// Сквозные тесты интерфейса Glow в настоящем Chromium с подменой Tauri.
// Запуск: npm run test:e2e   (один раз до этого: npm i -D playwright && npx playwright install chromium)
// Скриншоты кладутся в tests/e2e/shots.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../src');
const shots = path.join(here, 'shots');
fs.mkdirSync(shots, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  console.error('Нужен Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

// ---------- тестовые файлы: тон 12 с и обложки ----------
function wav(freq) {
  const sr = 22050, len = sr * 12, buf = Buffer.alloc(44 + len * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(len * 2, 40);
  for (let i = 0; i < len; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * 6000), 44 + i * 2);
  return buf;
}
const COLORS = [['#ff5fa2', '#6b5cff'], ['#21d4fd', '#b721ff'], ['#f6d365', '#fda085'], ['#0f9b8e', '#c6ffdd'], ['#ff9a9e', '#2b1055'], ['#434343', '#e0c3fc']];
const media = {};
[220, 330, 440, 550].forEach((f, i) => { media[`t${i}.wav`] = wav(f); });
COLORS.forEach(([a, b], i) => {
  media[`c${i}.svg`] = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="${120 + i * 30}" cy="150" r="90" fill="#fff" opacity=".25"/></svg>`);
});

// Та же политика безопасности (CSP), что и в собранном приложении: ловит запрещённые скрипты и стили.
const CSP = JSON.parse(fs.readFileSync(path.resolve(here, '../../src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/__media/')) {
    const name = url.slice(9), data = media[name];
    if (!data) { res.writeHead(404); return res.end(); }
    const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
    if (range) {
      const s = +range[1], e = range[2] ? +range[2] : data.length - 1;
      res.writeHead(206, { 'Content-Type': TYPES[path.extname(name)], 'Content-Range': `bytes ${s}-${e}/${data.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
      return res.end(data.subarray(s, e + 1));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)], 'Accept-Ranges': 'bytes', 'Content-Length': data.length });
    return res.end(data);
  }
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  const head = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
  if (file.endsWith('.html') && CSP) head['Content-Security-Policy'] = CSP;
  res.writeHead(200, head);
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

// ---------- сценарии ----------
const browser = await chromium.launch({ executablePath: process.env.GLOW_CHROME || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const results = [];

async function page(init) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', (e) => pg.errors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pg.errors.push(m.text()); });
  pg.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) pg.errors.push('CSP: ' + m.text()); });
  if (init) await pg.addInitScript({ content: init });
  await pg.addInitScript({ path: path.join(here, 'mock.js') });
  await pg.goto(BASE);
  await pg.waitForSelector('.row', { timeout: 10000 });
  return pg;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, msg) => { if (!ok) throw new Error(msg); };

async function scenario(name, fn, { init } = {}) {
  const t0 = Date.now();
  let pg;
  try {
    pg = await page(init);
    await fn(pg);
    check(!pg.errors.length, 'ошибки в консоли:\n  ' + pg.errors.join('\n  '));
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`);
    if (pg) await pg.screenshot({ path: path.join(shots, `FAIL-${name.replace(/[^\wа-яё]+/gi, '_')}.png`) }).catch(() => {});
  } finally {
    if (pg) await pg.context().close();
  }
}

console.log('Glow — сквозные тесты');

await scenario('медиатека загружается, трек играет', async (pg) => {
  check(await pg.$$eval('.row', (r) => r.length) > 5, 'нет строк в списке треков');
  await pg.dblclick('.row[data-i="0"]');
  await sleep(1200);
  check(await pg.evaluate(() => document.body.classList.contains('playing')), 'не играет');
  await pg.screenshot({ path: path.join(shots, 'tracks.png') });
});

await scenario('все разделы меню открываются', async (pg) => {
  const views = await pg.$$eval('#sidebar [data-view]', (els) => [...new Set(els.map((e) => e.dataset.view))]);
  check(views.length >= 6, `разделов: ${views.length}`);
  for (const v of views) {
    await pg.click(`#sidebar [data-view="${v}"]`);
    await sleep(150);
    check((await pg.innerHTML('#content')).length > 50, `пустой раздел ${v}`);
  }
});

await scenario('все стили применяются без ошибок', async (pg) => {
  await pg.click('#sidebar [data-view="settings"]');
  await sleep(200);
  const styles = await pg.$$eval('[data-style]', (els) => els.map((e) => e.dataset.style));
  check(styles.length >= 20, `стилей в настройках: ${styles.length}`);
  for (const s of styles) {
    await pg.click(`[data-style="${s}"]`);
    await sleep(60);
  }
  await pg.click('[data-style="holo"]');
  await sleep(400);
  await pg.screenshot({ path: path.join(shots, 'holo-settings.png') });
});

await scenario('повтор одного трека не сбрасывается при смене трека', async (pg) => {
  await pg.dblclick('.row[data-i="0"]');
  await sleep(300);
  await pg.click('#c-repeat'); // всё
  await pg.click('#c-repeat'); // один
  const icon = await pg.innerHTML('#c-repeat');
  await pg.dblclick('.row[data-i="3"]');
  await sleep(400);
  const title = await pg.textContent('#pb-title');
  check((await pg.innerHTML('#c-repeat')) === icon, 'значок повтора сменился');
  // Перематываем к концу: после окончания должен заиграть тот же трек.
  await pg.keyboard.press('Escape');
  const bar = await pg.$('#progress');
  check(bar, 'не найдена полоса прогресса');
  const box = await bar.boundingBox();
  await pg.mouse.click(box.x + box.width * 0.93, box.y + box.height / 2);
  await sleep(2500);
  check((await pg.textContent('#pb-title')) === title, 'после конца трека заиграл другой — повтор сбросился');
  check(await pg.evaluate(() => document.body.classList.contains('playing')), 'трек не повторился');
});

await scenario('умная подборка создаётся и попадает в меню', async (pg) => {
  await pg.click('#sidebar [data-navcmd="smart-new"]');
  await sleep(200);
  await pg.fill('#sm-name', 'Тестовая подборка');
  await pg.selectOption('.sm-rule[data-ri="0"] [data-rf]', 'year');
  await pg.selectOption('.sm-rule[data-ri="0"] [data-ro]', 'gt');
  await pg.fill('.sm-rule[data-ri="0"] [data-rv]', '2021');
  await sleep(150);
  const cnt = await pg.textContent('#sm-count');
  check(/18 треков/.test(cnt), `ожидалось 18 треков (2022–2023), а: ${cnt}`);
  await pg.click('#sm-save');
  await sleep(300);
  check((await pg.textContent('#sidebar')).includes('Тестовая подборка'), 'подборки нет в меню');
  check(/18 треков/.test(await pg.textContent('#content')), 'в подборке не 18 треков');
});

await scenario('обмен .glowsync: экспорт и импорт', async (pg) => {
  await pg.click('.row[data-i="2"]', { button: 'right' });
  await sleep(150);
  const fav = await pg.$$eval('#menu .mi', (els) => els.find((e) => /избранн/i.test(e.textContent))?.dataset.m);
  if (fav) await pg.click(`#menu .mi[data-m="${fav}"]`);
  await pg.click('#sidebar [data-view="settings"]');
  await sleep(200);
  await pg.click('[data-settab="system"]');
  await pg.click('[data-cmd="sync-export"]');
  await sleep(300);
  const doc = JSON.parse(await pg.evaluate(() => sessionStorage.getItem('savedSync')));
  check(doc.format === 'glowsync' && doc.favorites.length === 1, 'в экспорте нет избранного');
  await pg.click('[data-cmd="sync-import"]');
  await sleep(300);
  check(/Совпало треков: 1/.test(await pg.textContent('#toast')), 'импорт не сопоставил трек');
});

await scenario('новый файл в папке подхватывается сам', async (pg) => {
  const before = await pg.evaluate(() => window.__glowCalls.filter((c) => c === 'scan_library').length);
  await pg.evaluate(() => window.__glowEmit('library-changed', ['C:\\Music\\new.flac']));
  await sleep(1200);
  const after = await pg.evaluate(() => window.__glowCalls.filter((c) => c === 'scan_library').length);
  check(after === before + 1, 'пересканирование не запустилось');
  check(await pg.evaluate(() => window.__glowCalls.includes('watch_folders')), 'слежение за папками не включено');
});

await scenario('команды из трея и клавиш', async (pg) => {
  await pg.dblclick('.row[data-i="0"]');
  await sleep(500);
  const calls = () => pg.evaluate(() => window.__glowCalls.filter((c) => c === 'set_tray_tip').length);
  const n0 = await calls();
  await pg.evaluate(() => window.__glowEmit('media', 'next'));
  await sleep(400);
  check((await calls()) > n0, '«Следующий» из трея не переключил трек');
  await pg.evaluate(() => window.__glowEmit('media', 'play'));
  await sleep(300);
  check(!(await pg.evaluate(() => document.body.classList.contains('playing'))), 'пауза из трея не сработала');
});

await scenario('редактор стиля: светлый фон включает светлую тему', async (pg) => {
  await pg.click('#sidebar [data-view="settings"]');
  await pg.click('[data-style="aurora"]');
  await pg.click('[data-cmd="style-new"]');
  await sleep(400);
  await pg.evaluate(() => {
    const inp = document.querySelector('#editor input[type=color][data-f="theme.bg"]');
    inp.value = '#f4f1ea';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(300);
  check(await pg.evaluate(() => document.querySelector('#editor [data-ft="theme.light"]').classList.contains('on')), 'светлая тема не включилась');
  await pg.screenshot({ path: path.join(shots, 'editor-light.png') });
});

await scenario('настройки: вкладки и поиск', async (pg) => {
  await pg.click('#sidebar [data-view="settings"]');
  await sleep(200);
  const visible = () => pg.$$eval('.set-group:not([hidden]) > .heading', (els) => els.map((e) => e.textContent.trim()));
  check((await visible()).includes('Стиль') && !(await visible()).includes('Горячие клавиши'), 'вкладка «Вид» показывает не то');
  await pg.click('[data-settab="player"]');
  check((await visible()).join() === 'Экран воспроизведения,Звук и воспроизведение' || (await visible()).includes('Звук и воспроизведение'), `вкладка «Звук и плеер»: ${await visible()}`);
  await pg.click('[data-toggle="gapless"]');
  await sleep(200);
  check(await pg.$eval('[data-settab="player"]', (b) => b.classList.contains('on')), 'после переключения настройки вкладка сбросилась');
  await pg.fill('#set-q', 'кроссфейд');
  await sleep(100);
  const rows = await pg.$$eval('.set-row:not([hidden])', (r) => r.filter((x) => x.closest('.set-group:not([hidden])')).length);
  check(rows === 1, `поиск «кроссфейд» нашёл строк: ${rows}`);
  await pg.fill('#set-q', 'трей');
  await sleep(100);
  check((await visible()).includes('Трей и панель задач'), 'поиск не нашёл трей в другой вкладке');
  await pg.fill('#set-q', '');
  await pg.click('[data-settab="system"]');
  await pg.evaluate(() => { document.querySelector('#content').scrollTop = 400; });
  await sleep(200);
  await pg.screenshot({ path: path.join(shots, 'settings-tabs.png') });
});

await scenario('тексты из LRCLIB, если своего текста нет', async (pg) => {
  await pg.evaluate(() => sessionStorage.setItem('fakeLyrics', '1'));
  await pg.reload(); await pg.waitForSelector('.row');
  await pg.dblclick('.row[data-i="1"]'); // у второго трека нет своего .lrc
  await sleep(400);
  await pg.keyboard.press('n');
  await sleep(400);
  if (!(await pg.$('#ly'))) { await pg.click('#now-lyrics'); await sleep(300); }
  check((await pg.textContent('#now-right')).includes('Текст из LRCLIB'), 'текст из LRCLIB не показан');
  check((await pg.textContent('#now-right')).includes('не тот текст'), 'нет кнопки «не тот текст»');
});

await scenario('обложка из интернета в редакторе тегов', async (pg) => {
  await pg.click('.row[data-i="0"]', { button: 'right' });
  await sleep(150);
  await pg.click('#menu .mi[data-m="tags"]');
  await sleep(200);
  await pg.click('#tg-online');
  await sleep(300);
  check(await pg.$$eval('.oc-item', (e) => e.length) === 4, 'нет вариантов обложек');
  await pg.screenshot({ path: path.join(shots, 'covers.png') });
  await pg.click('.oc-item[data-oc="2"]');
  await sleep(200);
  check((await pg.innerHTML('#tg-cover')).includes('c2'), 'выбранная обложка не подставилась');
});

await scenario('скробблинг: подключение и отправка', async (pg) => {
  await pg.click('#sidebar [data-view="settings"]');
  await sleep(200);
  await pg.click('[data-settab="online"]');
  await pg.click('[data-cmd="lfm-connect"]');
  await sleep(300);
  await pg.click('#lfm-done');
  await sleep(300);
  check((await pg.textContent('#content')).includes('Подключён: tester'), 'Last.fm не подключился');
  await pg.fill('#lb-token', 'abc');
  await pg.click('[data-cmd="lb-connect"]');
  await sleep(300);
  check((await pg.textContent('#content')).includes('Подключён: lb-user'), 'ListenBrainz не подключился');
  await pg.screenshot({ path: path.join(shots, 'online-settings.png') });
  // 12-секундные тестовые треки короче 30 с — по правилам Last.fm не скробблятся.
  await pg.click('#sidebar [data-view="tracks"]');
  await pg.dblclick('.row[data-i="0"]');
  await sleep(7000);
  check(!(await pg.evaluate(() => window.__glowScrobbled || 0)), 'короткий трек не должен скробблиться');
});

await scenario('плейлист .m3u: экспорт и импорт', async (pg) => {
  await pg.click('.row[data-i="0"]', { button: 'right' });
  await sleep(150);
  await pg.click('#sidebar [data-navcmd="pl-new"]');
  await sleep(150);
  await pg.fill('#pm-in', 'Экспорт');
  await pg.click('#pm-ok');
  await sleep(200);
  await pg.click('#sidebar .nav >> text=Экспорт');
  await sleep(200);
  check(await pg.$('[data-cmd="pl-export"]'), 'нет кнопки экспорта');
  // Импорт: файл с абсолютным, относительным и чужим путём.
  await pg.evaluate(() => sessionStorage.setItem('savedSync', '#EXTM3U\n#EXTINF:12,Neon Coast - Свет\nC:\\Music\\Afterglow\\1.wav#1\n#EXTINF:12,Mira Vale - Echoes\nE:\\Other\\echoes.mp3\nD:\\nope.mp3\n'));
  await pg.click('#sidebar [data-view="settings"]');
  await pg.click('[data-settab="library"]');
  await pg.click('[data-cmd="m3u-import"]');
  await sleep(500);
  check(/Импортировано плейлистов: 1, треков: 2, не найдено в медиатеке: 1/.test(await pg.textContent('#toast')), `импорт: ${await pg.textContent('#toast')}`);
});

await scenario('перетаскивание файлов в окно', async (pg) => {
  await pg.evaluate(() => window.__glowEmit('tauri://drag-enter', {}));
  await sleep(100);
  check(await pg.$eval('.drop-over', (e) => e.classList.contains('show')), 'нет подсказки при перетаскивании');
  await pg.screenshot({ path: path.join(shots, 'drop.png') });
  await pg.evaluate(() => window.__glowEmit('tauri://drag-drop', { paths: ['E:\\New Music', 'E:\\single.flac'] }));
  await sleep(500);
  check((await pg.textContent('.modal')).includes('3 трека'), 'окно с треками не появилось');
  check(await pg.$('#dr-add'), 'нет кнопки «добавить папку»');
  await pg.click('#dr-play');
  await sleep(400);
  check((await pg.textContent('#pb-title')).includes('Из папки'), 'перетащенное не заиграло');
});

await scenario('дубликаты', async (pg) => {
  await pg.evaluate(() => sessionStorage.setItem('dupes', '1'));
  await pg.reload(); await pg.waitForSelector('.row');
  await pg.click('#sidebar [data-view="settings"]');
  await pg.click('[data-settab="library"]');
  await pg.click('[data-go="dupes"]');
  await sleep(300);
  check(await pg.$$eval('.dupe-group', (g) => g.length) === 1, 'группа дубликатов не найдена');
  check((await pg.textContent('.dupe-row.best')).includes('FLAC'), 'лучшей должна быть FLAC-копия');
  await pg.screenshot({ path: path.join(shots, 'dupes.png') });
});

await scenario('итоги года', async (pg) => {
  check((await pg.textContent('#sidebar')).includes('Итоги года'), 'нет пункта в меню');
  await pg.click('#sidebar [data-view="wrapped"]');
  await sleep(400);
  const txt = await pg.textContent('#content');
  const dbg = await pg.evaluate(() => { const m = JSON.parse(localStorage.getItem('glow.meta') || '{}'); return `history=${(m.history || []).length} files=${(sessionStorage.getItem('mockFiles') || '').length}`; });
  check(txt.includes('Итоги 2026') && txt.includes('Night Drive'), 'итоги не посчитались: ' + dbg);
  check(await pg.$('[data-go="wrapped"][data-key="2025"]'), 'нет переключателя годов');
  await pg.screenshot({ path: path.join(shots, 'wrapped.png'), fullPage: false });
}, { init: "sessionStorage.setItem('seedHistory', '1');" });

await scenario('обновление: кнопка в настройках показывает новую версию', async (pg) => {
  await pg.evaluate(() => sessionStorage.setItem('fakeUpdate', '1'));
  await pg.click('#sidebar [data-view="settings"]');
  await sleep(200);
  await pg.click('[data-settab="about"]');
  await pg.click('[data-cmd="update-check"]');
  await sleep(400);
  check((await pg.textContent('.modal')).includes('9.9.9'), 'окно обновления не появилось');
  await pg.screenshot({ path: path.join(shots, 'update.png') });
  await pg.click('#upd-skip');
});

await browser.close();
server.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length} из ${results.length} прошли${bad.length ? `, упали: ${bad.map((r) => r.name).join('; ')}` : ''}`);
process.exit(bad.length ? 1 : 0);
