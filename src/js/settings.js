// Glow для ПК — settings.js (часть интерфейса, вынесена из main.js).

import { I } from './icons.js';
import { STYLES, ACCENTS, MD3_SEEDS, md3Scheme } from './theme.js';
import { BACKDROPS, MOTIONS, PART_PRESETS, QUALITIES } from './visuals.js';
import { profilesCard } from './vprofiles.js';
import { checkTimeStyle } from './timestyle.js';
import { SCENES } from './scenes.js';
import { loadCustom, getCustom, exportData, addImported, duplicateCustom, deleteCustom } from './editor.js';
import { confirmModal, showMenu } from './dialogs.js';
import { applyDesktop, scan, watchFolders } from './library.js';
import { prepareNext, prev, renderNowRight } from './player.js';
import { S, curTrack, editor, flushNow, meta, saveSettings, settings, track } from './state.js';
import { applyAudio, applyVisualSettings, refreshTheme, viewHead } from './ui.js';
import { $, APP_VERSION, esc, invoke, toast, tracksWord } from './util.js';
import { pendingScrobbles, scheduleFlush, updateDiscord } from './online.js';
import { render } from './views.js';

// ================= Настройки =================

export function md3Card(id) {
  const s = STYLES[id];
  const sc = md3Scheme(s.custom ? settings.md3Seed : s.md3.primary, 'standard', s.custom ? null : s.md3);
  const sig = s.motif ? ` sig-${s.motif}` : '';
  const scene = s.scene ? ` scene-${s.scene}` : '';
  return `<button class="style-card md3-card${settings.style === id ? ' on' : ''}${sig}${scene}" data-style="${id}" style="--sa:${sc.primary};--sb:${sc.tertiary || sc.primary}">
    <div class="style-prev" style="background:${sc.surface}">
      ${s.scene ? `<span class="sc-tag">${SCENES[s.scene]}</span>` : ''}
      <div style="position:absolute;left:14px;top:16px;width:64px;height:18px;border-radius:9px;background:${sc.secondaryContainer}"></div>
      <div style="position:absolute;left:14px;top:42px;width:44px;height:6px;border-radius:3px;background:${sc.onSurfaceVariant};opacity:.6"></div>
      <div style="position:absolute;left:14px;top:56px;width:52px;height:6px;border-radius:3px;background:${sc.onSurfaceVariant};opacity:.6"></div>
      <div style="position:absolute;right:16px;top:14px;width:62px;height:62px;border-radius:16px;background:${sc.primaryContainer}"></div>
      <div style="position:absolute;left:14px;bottom:14px;width:58px;height:20px;border-radius:10px;background:${sc.primary}"></div>
      <div style="position:absolute;left:82px;right:16px;bottom:22px;height:4px;border-radius:2px;background:${sc.surfaceHighest}"><div style="width:55%;height:100%;border-radius:2px;background:${sc.primary}"></div></div>
    </div>
    <div class="sc-name"><div class="body-strong">${s.name}</div><div class="caption">${s.sub}</div></div></button>`;
}

// Группы в сетке стилей. Стиль, которого нет в списке, попадает в «Свечение».
const STYLE_GROUPS = [
  ['Свечение', ['aura', 'dynamic', 'premium', 'aurora', 'noir', 'space', 'holo', 'ambient']],
  ['Стекло', ['glass', 'mglass', 'fluent']],
  ['Спокойные', ['softdark', 'studio', 'mono', 'swiss']],
  ['Светлые', ['light', 'soft', 'nordic', 'paper']],
];

const HOURS = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h), String(h).padStart(2, '0') + ':00']));
const todStyles = () => Object.fromEntries(Object.keys(STYLES).filter((k) => !STYLES[k].user && k !== '__edit').map((k) => [k, STYLES[k].name]));

function styleGroups() {
  const ids = Object.keys(STYLES).filter((k) => !STYLES[k].md3 && !STYLES[k].user && k !== '__edit');
  const listed = new Set(STYLE_GROUPS.flatMap((g) => g[1]));
  return STYLE_GROUPS.map(([name, list], i) => {
    const items = list.filter((k) => STYLES[k]).concat(i === 0 ? ids.filter((k) => !listed.has(k)) : []);
    return `<div class="overline sg-title">${name}</div><div class="styles-grid">${items.map(styleCard).join('')}</div>`;
  }).join('');
}

export function styleCard(id) {
  const s = STYLES[id];
  if (s.md3) return md3Card(id);
  const acc = s.accent;
  const r = s.cover ? Math.round(s.cover / 2.4) : 0;
  const sig = s.motif ? ` sig-${s.motif}` : '';
  const scene = s.scene ? ` scene-${s.scene}` : '';
  return `<button class="style-card${settings.style === id ? ' on' : ''}${sig}${scene}" data-style="${id}" style="--sa:${acc};--sb:${s.second || acc}">
    <div class="style-prev" style="background:${s.preview || s.bg}">
      ${s.scene ? `<span class="sc-tag">${SCENES[s.scene]}</span>` : ''}
      ${s.glow && !s.preview && !s.soften ? `<div style="position:absolute;left:-10px;top:-10px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle, ${acc}99, transparent 70%)"></div>` : ''}
      ${s.glass ? `<div style="position:absolute;inset:0;background:radial-gradient(60% 80% at 20% 30%, ${acc}88, transparent), radial-gradient(50% 70% at 90% 80%, #ff5cc866, transparent)"></div>` : ''}
      <div class="sp-cover" style="background:${s.dynamic ? 'linear-gradient(135deg,#ff7a59,#ffb547)' : acc};border-radius:${r}px;${s.glass ? 'border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.2)' : ''}${s.neon ? `background:transparent;border:1.5px solid ${acc};box-shadow:0 0 14px ${acc}, inset 0 0 10px ${acc}66` : ''}${s.fx === 'space' ? `box-shadow:0 0 0 10px ${acc}22, 0 0 30px ${acc}` : ''}${s.light && s.soften ? 'box-shadow:0 10px 20px -8px rgba(70,55,35,.35)' : ''}"></div>
      <div class="sp-line" style="top:28px;width:70px;background:${s.text};border-radius:${s.radius ? 4 : 0}px"></div>
      <div class="sp-line" style="top:44px;width:46px;background:${s.muted};border-radius:${s.radius ? 4 : 0}px"></div>
      <div class="sp-bar" style="background:${s.line}"><div style="width:45%;height:100%;background:${s.fx === 'aurora' ? `linear-gradient(90deg,#8b5cff,${acc})` : acc};border-radius:${s.radius ? 4 : 0}px;${s.fx || s.neon ? `box-shadow:0 0 8px ${acc}` : ''}"></div></div>
    </div>
    <div class="sc-name"><div class="body-strong">${s.name}</div><div class="caption">${s.sub}</div></div></button>`;
}

export const APP_ICONS = {
  glow: 'Glow', sunset: 'Sunset', gold: 'Gold', clean: 'Clean', swiss: 'Swiss', frost: 'Frost',
  prism: 'Prism', moss: 'Moss', pulse: 'Pulse', capsule: 'Capsule', neon: 'Neon', vinyl: 'Vinyl',
};

export async function setAppIcon(name, shortcuts) {
  try {
    await invoke('set_app_icon', { name, shortcuts });
    if (shortcuts) toast('Иконка изменена. Ярлыки обновятся через пару секунд');
  } catch (e) {
    if (shortcuts) toast(`Не удалось сменить иконку: ${e}`);
  }
}

export const tog = (key, on) => `<button class="toggle${on ? ' on' : ''}" data-toggle="${key}"></button>`;
export const sel = (key, opts) => `<select class="select" data-set="${key}">${Object.entries(opts).map(([k, n]) => `<option value="${k}" ${String(settings[key]) === k ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
export const row = (label, hint, control) => `<div class="set-row"><div class="lbl"><div>${label}</div>${hint ? `<div class="caption">${hint}</div>` : ''}</div>${control}</div>`;
export const range = (key, min, max, step, val, label) => `<input type="range" data-range="${key}" min="${min}" max="${max}" step="${step}" value="${val}" style="width:220px;accent-color:var(--accent)"><span class="time" data-range-v="${key}" style="width:64px;text-align:right">${label}</span>`;

// Вкладки настроек: какая группа где. Группы без записи попадают во «Вид».
const SET_TABS = [
  ['look', 'Вид', 'palette', ['Язык', 'Мои стили', 'Стиль', 'Стиль по времени суток', 'Material You', 'Цвет', 'Стекло', 'Свечение и анимации', 'Профили визуала', 'Экран воспроизведения', 'Иконка приложения']],
  ['player', 'Звук и плеер', 'eq', ['Звук и воспроизведение']],
  ['library', 'Медиатека', 'folder', ['Медиатека', 'Боковое меню']],
  ['online', 'Онлайн', 'globe', ['Интернет', 'Скробблинг', 'Discord']],
  ['system', 'Система', 'settings', ['Трей и панель задач', 'Горячие клавиши', 'Обмен с Android', 'Данные и резервные копии']],
  ['about', 'О программе', 'info', ['О программе']],
];
const tabOf = (heading) => (SET_TABS.find((t) => t[3].includes(heading)) || SET_TABS[0])[0];

/** Показать группы активной вкладки или, если идёт поиск, все строки, где он нашёлся. */
function applySettingsFilter(c) {
  const q = (S.setQuery || '').trim().toLowerCase();
  for (const g of c.querySelectorAll('.set-group')) {
    if (!q) {
      g.hidden = g.dataset.tab !== S.setTab;
      for (const r of g.querySelectorAll('.set-row, .styles-grid > *, .keys > *')) r.hidden = false;
      continue;
    }
    const inHead = g.querySelector('.heading').textContent.toLowerCase().includes(q);
    let any = inHead;
    for (const r of g.querySelectorAll('.set-row')) {
      const hit = inHead || r.textContent.toLowerCase().includes(q);
      r.hidden = !hit;
      any ||= hit;
    }
    g.hidden = !any;
  }
  for (const b of c.querySelectorAll('[data-settab]')) b.classList.toggle('on', !q && b.dataset.settab === S.setTab);
  const empty = c.querySelector('.set-empty');
  if (empty) empty.hidden = !q || !!c.querySelector('.set-group:not([hidden])');
}

export function renderSettings(c) {
  if (!S.setTab) S.setTab = 'look';
  const folders = settings.folders.map((f, i) => `<div class="folder-row">${I.folder}<div class="grow">${esc(f)}</div><button class="icon-btn" data-cmd="rm-folder" data-i="${i}" title="Убрать">${I.close}</button></div>`).join('');
  const excl = settings.excluded.map((f, i) => `<div class="folder-row">${I.folder}<div class="grow">${esc(f)}</div><button class="icon-btn" data-cmd="rm-excl" data-i="${i}" title="Убрать">${I.close}</button></div>`).join('');
  c.innerHTML = `<div class="settings">${viewHead({ title: 'Настройки', noCover: true, actions: false })}
    <div class="set-tabs">
      ${SET_TABS.map(([id, name, icon]) => `<button class="set-tab" data-settab="${id}">${I[icon] || ''}<span>${name}</span></button>`).join('')}
      <label class="set-search">${I.search}<input id="set-q" placeholder="Поиск" value="${esc(S.setQuery || '')}" spellcheck="false"></label>
    </div>
    <div class="set-empty muted" hidden>Ничего не нашлось</div>
    <div class="set-group"><div class="heading">Медиатека</div><div class="set-card">
      ${row('Папки с музыкой', `${tracksWord(S.tracks.length)} в медиатеке`, `<button class="btn" data-cmd="add-folder">${I.plus}Добавить</button><button class="btn" data-cmd="rescan">${I.refresh}Пересканировать</button>`)}
      ${folders || '<div class="folder-row muted">Пока нет ни одной папки</div>'}
      ${row('Исключённые папки', 'Эти папки и всё внутри них не сканируются', `<button class="btn" data-cmd="add-excl">${I.plus}Исключить</button>`)}
      ${excl}
      ${row('Сканировать при запуске', 'При открытии Glow проверяет папки целиком', tog('scanOnStart', settings.scanOnStart))}
      ${row('Следить за папками', 'Скачал или скопировал трек — он появится в медиатеке сам, без перезапуска. Удалённые и изменённые файлы тоже обновятся', tog('watchFolders', settings.watchFolders))}
      ${row('Папка с текстами .lrc', settings.lyricsFolder ? `${esc(settings.lyricsFolder)} · найдено ${S.lrcIndex ? S.lrcIndex.size : 0}` : 'Тексты ищутся по имени файла или «Исполнитель - Название»', `<button class="btn" data-cmd="lrc-folder">${I.folder}${settings.lyricsFolder ? 'Сменить' : 'Выбрать'}</button>${settings.lyricsFolder ? `<button class="icon-btn" data-cmd="lrc-folder-clear" title="Убрать">${I.close}</button>` : ''}`)}
      ${row('Дубликаты', 'Одинаковые треки в нескольких копиях: покажет, какая лучше по качеству, лишние можно отправить в корзину', `<button class="btn" data-go="dupes">${I.search}Найти</button>`)}
      ${row('Плейлисты из других плееров', 'Импорт .m3u и .m3u8 — или просто перетащи файл плейлиста в окно Glow', `<button class="btn" data-cmd="m3u-import">${I.playlist}Импорт .m3u</button>`)}
      ${row('Пропавшие треки', 'Если файлы переместили или переименовали, Glow найдёт их по тегам и перенесёт плейлисты, оценки и историю', `<button class="btn" data-cmd="relink">${I.search}Найти</button>`)}
    </div></div>

    <div class="set-group"><div class="heading">Мои стили</div>
      <div class="caption" style="margin:-4px 0 12px">Собери свой дизайн из слоёв: тема, акцент, формы, шрифт, эффекты, экран плеера. Правый клик по любому стилю ниже — «Создать на его основе».</div>
      <div class="actions" style="margin:0 0 14px"><button class="btn primary" data-cmd="style-new">${I.plus}Создать свой стиль</button><button class="btn" data-cmd="style-import">${I.folder}Импорт .glowtheme</button></div>
      ${loadCustom().length ? `<div class="styles-grid">${loadCustom().map((c) => `<div class="ucard">${styleCard(c.id)}<button class="icon-btn ucard-more" data-umore="${esc(c.id)}" title="Действия">${I.more}</button></div>`).join('')}</div>` : ''}
    </div>

    <div class="set-group"><div class="heading">Стиль</div>${styleGroups()}</div>
    <div class="set-group"><div class="heading">Стиль по времени суток</div><div class="set-card">
      ${row('Включить', 'В выбранные часы включается свой стиль, после окна возвращается прежний', tog('todOn', settings.todOn))}
      ${row('С', 'Начало окна', sel('todFrom', HOURS))}
      ${row('До', 'Конец окна; если он раньше начала, окно идёт через полночь', sel('todTo', HOURS))}
      ${row('Стиль в это время', '', sel('todStyle', todStyles()))}
    </div></div>
    <div class="set-group"><div class="heading">Material You</div>
      <div class="caption" style="margin:-4px 0 12px">Тёмные темы на системе Material 3: поверхности и выделения строятся по тональным уровням, поэтому текст всегда читается.</div>
      <div class="styles-grid">${Object.keys(STYLES).filter((k) => STYLES[k].md3).map(styleCard).join('')}</div></div>

    <div class="set-group"><div class="heading">Иконка приложения</div>
      <div class="caption" style="margin:-4px 0 12px">Меняется сразу в окне и на панели задач, а также у ярлыков Glow на рабочем столе и в меню «Пуск».</div>
      <div class="icon-grid">${Object.entries(APP_ICONS).map(([k, n]) => `<button class="icon-pick${settings.appIcon === k ? ' on' : ''}" data-appicon="${k}"><img src="icons/app/${k}.png" alt="" draggable="false"><span>${n}</span></button>`).join('')}</div></div>

    <div class="set-group"><div class="heading">Цвет</div><div class="set-card">
      ${STYLES[settings.style] && STYLES[settings.style].md3 ? `
      ${row('Палитра из обложки', 'Dynamic Artwork: вся схема — поверхности, выделения, прогресс — строится из обложки текущего трека', tog('md3Dynamic', settings.md3Dynamic))}
      ${STYLES[settings.style].custom ? `${row('Исходный цвет', 'Accent Seed: из одного цвета Glow строит всю тёмную палитру' + (settings.md3Dynamic ? '. Пока включена палитра из обложки, используется она' : ''), '')}
      <div class="swatches">${MD3_SEEDS.map((a) => `<button class="swatch${settings.md3Seed === a ? ' on' : ''}" data-md3seed="${a}" style="background:${a}"></button>`).join('')}
        <span class="spacer"></span><input class="hex" id="md3hex" value="${esc(settings.md3Seed)}" maxlength="7" spellcheck="false" title="Свой цвет HEX"></div>`
        : row('Свой исходный цвет', 'Выбери тему «Material You», чтобы задать любой цвет', '')}`
      : `${row('Откуда брать цвет', 'Цвет свечения, прогресса и активных кнопок', `<div class="chips">${[['cover', 'Из обложки'], ['custom', 'Свой'], ['mix', 'Смешать']].map(([k, n]) => `<button class="chip${settings.accentMode === k ? ' on' : ''}" data-accent-mode="${k}">${n}</button>`).join('')}</div>`)}
      <div class="swatches">${ACCENTS.map((a) => `<button class="swatch${settings.customAccent === a ? ' on' : ''}" data-accent="${a}" style="background:${a}"></button>`).join('')}
        <span class="spacer"></span><input class="hex" id="hex" value="${esc(settings.customAccent)}" maxlength="7" spellcheck="false" title="Свой цвет HEX"></div>`}
      ${STYLES[settings.style] && STYLES[settings.style].md3 ? `
      ${row('Схема Material You', 'Спокойная — как в Android по умолчанию; яркая и выразительная — насыщеннее; «верная обложке» — контейнеры ровно цвета обложки', sel('md3Variant', { tonal: 'Спокойная', vibrant: 'Яркая', expressive: 'Выразительная', fidelity: 'Верная обложке', mono: 'Монохромная' }))}
      ${STYLES[settings.style].mglass ? '' : row('Светлая или тёмная', '«Как в Windows» переключается вместе с темой системы', sel('md3Mode', { dark: 'Тёмная', light: 'Светлая', system: 'Как в Windows' }))}` : ''}
      ${row('Контрастность', 'Для всех стилей: средняя и высокая делают второстепенный текст и линии заметнее', sel('contrast', { standard: 'Стандартная', medium: 'Средняя', high: 'Высокая' }))}
    </div></div>

    ${STYLES[settings.style] && STYLES[settings.style].liquid ? `<div class="set-group"><div class="heading">Стекло</div><div class="set-card">
      ${row('Толщина стекла', 'Сила размытия фона под панелями', range('glassBlur', 6, 60, 1, settings.glassBlur, settings.glassBlur + ' px'))}
      ${row('Прозрачность', 'Насколько стекло затемнено', range('glassAlpha', 0.04, 0.45, 0.01, settings.glassAlpha, Math.round(settings.glassAlpha * 100) + '%'))}
      ${row('Подкрасить цветом обложки', 'Стекло берёт оттенок играющего трека', tog('glassTint', settings.glassTint))}
      ${row('Эффект линзы', 'Фон по краям стекла слегка искажается. Может нагружать слабые видеокарты', tog('glassLens', settings.glassLens))}
    </div></div>` : ''}

    <div class="set-group"><div class="heading">Свечение и анимации</div><div class="set-card">
      ${row('Сила свечения', 'Swiss и Liquid Glass не светятся', range('glow', 0, 1, 0.05, settings.glow, Math.round(settings.glow * 100) + '%'))}
      ${row('Анимации', 'Плавные переходы, частицы, движение обложки', tog('animations', settings.animations))}
      ${row('Живые детали стиля', 'Лучи у Aura, снег у Nordic, угли у Copper, светлячки у Soft Dark и другие — лёгкий слой поверх фона окна', tog('styleMotifs', settings.styleMotifs !== false))}
    </div></div>

    ${profilesCard()}
    <div class="set-group"><div class="heading">Экран воспроизведения</div><div class="set-card">
      ${STYLES[settings.style] && STYLES[settings.style].user ? '<div class="set-row caption">У своего стиля экран плеера настраивается в редакторе стиля (слой «Экран плеера»). Ниже — настройки для остальных стилей.</div>' : ''}
      ${row('Сцена', 'Что в центре вместо обложки. «Как в стиле» — у Dark Premium винил, у Studio кассета, у Deep Space планета…', sel('scene', { auto: 'Как в стиле', ...SCENES }))}
      ${row('Фон', '', sel('backdrop', BACKDROPS))}
      ${row('Фон открытой песни', 'Цвет дизайна — цвет стиля, а не обложки. Размытая обложка при этом скрывается', sel('nowBg', { cover: 'Из обложки', design: 'Цвет дизайна' }))}
      ${row('Движение обложки', '«Бит» — обложка и свечение пульсируют на ударах баса', sel('coverMotion', MOTIONS))}
      ${row('Караоке-подсветка', 'Текущая строка заполняется по мере пения; если в .lrc есть метки на словах, подсвечиваются слова', tog('karaoke', settings.karaoke !== false))}
      ${row('Частицы в бит', 'Вылетают из-за обложки на ударах; у каждого стиля свои', tog('particles', settings.particles))}
      ${row('Качество графики', 'Меньше — легче для слабых видеокарт: меньше частиц и детализация жидкого света', sel('quality', QUALITIES))}
      ${row('Форма частиц', 'Как выглядят частицы на ударах и в потоке. «Как в стиле» — прежние формы стиля', sel('partPreset', PART_PRESETS))}
      ${row('Количество частиц', 'Сколько частиц на ударах и в потоке под музыку', range('partCount', 0.5, 2, 0.1, settings.partCount, Math.round(settings.partCount * 100) + '%'))}
      ${row('Чувствительность к ударам', 'Выше — чаще срабатывает на всплески (в том числе на хай-хетах)', range('beatSens', 0, 1, 0.05, settings.beatSens, Math.round(settings.beatSens * 100) + '%'))}
      ${row('Сила колец на вокале', 'Кольца от обложки на средних частотах; 0% — выключить', range('ringStrength', 0, 1, 0.05, settings.ringStrength, Math.round(settings.ringStrength * 100) + '%'))}
      ${row('Сила реакции обложки','Масштаб, поворот и вспышка обложки на ударах (работает при «Движении обложки: Бит»)', range('coverStrength', 0, 1, 0.05, settings.coverStrength, Math.round(settings.coverStrength * 100) + '%'))}
      ${row('Синхронизация вспышек', 'Если вспышки опережают удары, прибавь. Для Bluetooth обычно 150–300 мс', range('beatDelay', 0, 600, 10, settings.beatDelay, settings.beatDelay + ' мс'))}
      ${row('Справа от обложки', '', sel('nowSide', { lyrics: 'Текст песни', queue: 'Очередь' }))}
    </div></div>

    <div class="set-group"><div class="heading">Звук и воспроизведение</div><div class="set-card">
      ${row('Эквалайзер, усиление, баланс', '10 полос, пресеты и свои пресеты, лимитер', `<button class="btn" data-cmd="open-eq">${I.eq}Открыть</button>`)}
      ${row('ReplayGain', 'Выравнивание громкости по тегам', sel('replayGain', { off: 'Выкл', track: 'По треку', album: 'По альбому' }))}
      ${row('Без пауз между треками', 'Следующий трек загружается заранее', tog('gapless', settings.gapless))}
      ${row('Плавный переход между треками', 'Кроссфейд: конец трека плавно перетекает в начало следующего. 0 — выключен', range('crossfade', 0, 12, 1, settings.crossfade, settings.crossfade ? settings.crossfade + ' с' : 'выкл'))}
      ${row('Громкость для файлов без ReplayGain', `Glow сам измерит громкость (как ReplayGain 2, −18 LUFS). Посчитано: ${Object.keys(meta.rgCalc || {}).length}`, `<button class="btn" data-cmd="rg-scan">${I.eq}${S.rgScan ? 'Остановить' : 'Посчитать все'}</button>`)}
      ${row('Считать громкость при проигрывании', 'Для трека без ReplayGain громкость измеряется в фоне при первом запуске', tog('rgAuto', settings.rgAuto))}
      ${row('Продолжать похожими', 'Когда очередь кончилась — тот же исполнитель, жанр и любимые', tog('autoContinue', settings.autoContinue))}
      ${row('Продолжать с места', 'После перезапуска очередь и позиция восстанавливаются', tog('resume', settings.resume))}
    </div></div>

    <div class="set-group"><div class="heading">Боковое меню</div><div class="set-card">
      ${row('Вид меню', 'Кнопка слева в заголовке окна или Ctrl+B прячет и возвращает меню', `<div class="chips">${[['full', 'Полное'], ['compact', 'Только иконки'], ['hidden', 'Скрыто']].map(([k, n]) => `<button class="chip${settings.sidebar.mode === k ? ' on' : ''}" data-navmode="${k}">${n}</button>`).join('')}</div>`)}
      ${row('Пункты и группы', 'Порядок, скрытые пункты, свои группы, закреплённые альбомы, исполнители и папки', `<button class="btn" data-cmd="nav-edit">${I.edit}Настроить</button>`)}
    </div></div>

    <div class="set-group"><div class="heading">Язык</div><div class="set-card">
      ${row('Язык интерфейса', 'Interface language · окно перезапустится', sel('lang', { auto: 'Как в системе', ru: 'Русский', en: 'English' }))}
    </div></div>

    <div class="set-group"><div class="heading">Интернет</div><div class="set-card">
      ${row('Без интернета', 'Glow не ходит в сеть совсем: ни тексты, ни обложки, ни скробблинг. Прослушивания копятся и уйдут, когда выключишь', tog('offline', settings.offline))}
      ${row('Тексты песен из LRCLIB', 'Если у трека нет своего текста, Glow найдёт синхронный в открытой базе LRCLIB и сохранит у себя — дальше он работает без сети', tog('onlineLyrics', settings.onlineLyrics))}
      ${row('Обложки из интернета', 'Правый клик по альбому или треку → «Изменить название и обложку» → «Найти в интернете». Источники: iTunes и MusicBrainz', '')}
    </div></div>

    <div class="set-group"><div class="heading">Скробблинг</div><div class="set-card">
      ${row('Last.fm', settings.lfmSession ? `Подключён: ${esc(settings.lfmUser)}. Трек засчитывается, когда дослушан до половины или 4 минут` : 'Прослушивания попадут в твой профиль Last.fm. Откроется страница входа в браузере',
        settings.lfmSession ? `<button class="btn" data-cmd="lfm-disconnect">${I.close}Отключить</button>` : `<button class="btn" data-cmd="lfm-connect">${I.globe}Подключить</button>`)}
      ${row('ListenBrainz', settings.lbToken ? `Подключён: ${esc(settings.lbUser)}` : 'Открытая альтернатива Last.fm. Токен — на listenbrainz.org → Settings → User token',
        settings.lbToken ? `<button class="btn" data-cmd="lb-disconnect">${I.close}Отключить</button>` : `<input class="field lb-token" id="lb-token" placeholder="Токен" spellcheck="false"><button class="btn" data-cmd="lb-connect">${I.check}Подключить</button>`)}
      ${pendingScrobbles() ? row('Ждут отправки', `${pendingScrobbles()} прослушиваний — уйдут сами, когда появится интернет`, `<button class="btn" data-cmd="scrobble-flush">${I.refresh}Отправить сейчас</button>`) : ''}
    </div></div>

    <div class="set-group"><div class="heading">Discord</div><div class="set-card">
      ${row('Статус «Слушает» в Discord', 'Друзья видят трек, исполнителя и сколько осталось. Нужен запущенный Discord на этом компьютере', tog('discord', settings.discord))}
      ${row('Обложка в статусе', 'Glow ищет обложку альбома в iTunes, чтобы Discord её показал. Без этого — значок Glow', tog('discordCover', settings.discordCover))}
    </div></div>

    <div class="set-group"><div class="heading">Обмен с Android</div><div class="set-card">
      ${row('Файл обмена .glowsync', 'Плейлисты, избранное, оценки, счётчики и история. Треки сопоставляются по исполнителю и названию, поэтому пути к файлам на телефоне и ПК могут отличаться', `<button class="btn" data-cmd="sync-export">${I.folder}Экспорт</button><button class="btn" data-cmd="sync-import">${I.refresh}Импорт</button>`)}
    </div></div>

    <div class="set-group"><div class="heading">Данные и резервные копии</div><div class="set-card">
      ${row('Где хранятся данные', 'Настройки, папки, плейлисты, избранное, оценки, история и свои стили лежат в %APPDATA%\\Glow — обновление и переустановка их не трогают. При каждой смене версии Glow сам делает копию в папку backups.', '')}
      ${row('Резервная копия', 'Всё одним файлом .glowbackup — для переноса на другой компьютер или на всякий случай', `<button class="btn" data-cmd="backup-save">${I.folder}Сохранить копию</button><button class="btn" data-cmd="backup-restore">${I.refresh}Восстановить</button>`)}
    </div></div>

    <div class="set-group"><div class="heading">Трей и панель задач</div><div class="set-card">
      ${row('Закрывать в трей', 'Крестик прячет Glow к часам, музыка играет дальше. Выйти — правой кнопкой по значку в трее', tog('closeToTray', settings.closeToTray))}
      ${row('Глобальные горячие клавиши', `Работают, даже когда Glow свёрнут: Ctrl+Alt+Пробел — пауза, Ctrl+Alt+← → — треки, Ctrl+Alt+↑ ↓ — громкость, Ctrl+Alt+L — в избранное${S.hotkeysBusy && S.hotkeysBusy.length ? `. Заняты другой программой: ${esc(S.hotkeysBusy.join(', '))}` : ''}`, tog('globalHotkeys', settings.globalHotkeys))}
      ${row('Перехватывать мультимедиа-клавиши', 'Обычно клавиши ⏯ ⏭ ⏮ на клавиатуре и так работают через Windows. Включи, если они не реагируют', tog('mediaKeys', settings.mediaKeys))}
      ${row('Кнопки на миниатюре', 'Наведи на Glow в панели задач — под превью есть «Назад», «Играть/Пауза» и «Вперёд»', '')}
    </div></div>

    <div class="set-group"><div class="heading">Горячие клавиши</div><div class="set-card"><div class="keys">
      <div><span class="kbd">Пробел</span></div><div>Пауза / продолжить</div>
      <div><span class="kbd">←</span><span class="kbd">→</span></div><div>Перемотка на 5 секунд</div>
      <div><span class="kbd">Ctrl</span><span class="kbd">←</span><span class="kbd">→</span></div><div>Предыдущий / следующий трек</div>
      <div><span class="kbd">↑</span><span class="kbd">↓</span></div><div>Громкость</div>
      <div><span class="kbd">Ctrl</span><span class="kbd">F</span></div><div>Поиск</div>
      <div><span class="kbd">Ctrl</span><span class="kbd">B</span></div><div>Показать / скрыть боковое меню</div>
      <div><span class="kbd">N</span></div><div>Экран воспроизведения</div>
      <div><span class="kbd">Q</span> <span class="kbd">S</span> <span class="kbd">R</span></div><div>Очередь, перемешать, повтор</div>
      <div><span class="kbd">L</span> <span class="kbd">M</span></div><div>В избранное, без звука</div>
      <div><span class="kbd">1</span>–<span class="kbd">5</span></div><div>Оценка играющему треку</div>
      <div>Медиаклавиши</div><div>Работают через системную панель Windows</div>
    </div></div></div>

    <div class="set-group"><div class="heading">О программе</div><div class="set-card">
      ${row(`Glow ${APP_VERSION.split('.').slice(0, 2).join('.')} для ПК`, `Версия ${APP_VERSION} · свечение от обложки, теперь на компьютере`, `<button class="btn" data-cmd="update-check">${I.refresh}Проверить обновления</button>`)}
      ${row('Проверять обновления при запуске', 'Не чаще раза в сутки. Glow спросит, прежде чем что-то ставить', tog('autoUpdate', settings.autoUpdate))}
    </div></div>
  </div>`;
  // Раскладываем группы по вкладкам и в порядке, заданном в SET_TABS.
  const order = SET_TABS.flatMap((t) => t[3]);
  const groups = [...c.querySelectorAll('.set-group')];
  for (const g of groups) g.dataset.tab = tabOf(g.querySelector('.heading').textContent.trim());
  const rank = (g) => { const i = order.indexOf(g.querySelector('.heading').textContent.trim()); return i < 0 ? 999 : i; };
  const box = c.querySelector('.settings');
  groups.sort((a, b) => rank(a) - rank(b)).forEach((g) => box.appendChild(g));
  applySettingsFilter(c);
  const tabs = c.querySelector('.set-tabs');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-settab]');
    if (!b) return;
    S.setTab = b.dataset.settab;
    S.setQuery = '';
    c.querySelector('#set-q').value = '';
    applySettingsFilter(c);
    const top = tabs.offsetTop - 12;
    if (c.scrollTop > top) c.scrollTop = top;
  });
  const q = c.querySelector('#set-q');
  q.addEventListener('input', () => { S.setQuery = q.value; applySettingsFilter(c); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; S.setQuery = ''; applySettingsFilter(c); q.blur(); } });
}

export function userStyleMenu(id, x, y) {
  const c = getCustom(id);
  if (!c) return;
  showMenu(`<button class="mi" data-m="use">${I.check}Применить</button>
    <button class="mi" data-m="edit">${I.edit}Изменить</button>
    <button class="mi" data-m="dup">${I.plus}Создать копию</button>
    <button class="mi" data-m="export">${I.folder}Экспорт .glowtheme</button>
    <div class="mi-sep"></div><button class="mi" data-m="del">${I.trash}Удалить</button>`, x, y, async (cmd) => {
    if (cmd === 'use') { settings.style = id; afterSetting('style'); }
    else if (cmd === 'edit') editor.open({ targetId: id });
    else if (cmd === 'dup') { duplicateCustom(id); render($('#content').scrollTop); toast('Копия создана'); }
    else if (cmd === 'export') {
      try {
        const ok = await invoke('save_theme', { name: `${c.name}.glowtheme`, content: exportData(c) });
        if (ok) toast('Стиль сохранён в файл');
      } catch (e) { toast(`Не удалось сохранить: ${e}`); }
    } else if (cmd === 'del') {
      if (!(await confirmModal('Удалить стиль?', `«${esc(c.name)}» и его история версий будут удалены.`))) return;
      deleteCustom(id);
      if (settings.style === id) { settings.style = c.base && STYLES[c.base] ? c.base : 'aura'; afterSetting('style'); }
      else render($('#content').scrollTop);
    }
  });
}

export async function importStyle() {
  try {
    const path = await invoke('pick_theme');
    if (!path) return;
    const text = await invoke('read_text', { path });
    const item = addImported(JSON.parse(text));
    settings.style = item.id;
    afterSetting('style');
    toast(`Импортирован стиль «${item.name}»`);
  } catch (e) {
    toast(`Не удалось импортировать: ${e.message || e}`);
  }
}

export function afterSetting(key, rerender = true) {
  saveSettings();
  if (['style', 'styleMotifs', 'accentMode', 'nowBg', 'customAccent', 'glow', 'animations', 'contrast', 'md3Dynamic', 'md3Seed', 'md3Variant', 'md3Mode', 'glassBlur', 'glassAlpha', 'glassTint', 'glassLens'].includes(key)) refreshTheme();
  if (['replayGain', 'gapless', 'rgPreamp', 'crossfade'].includes(key)) { applyAudio(); prepareNext(); }
  if (key === 'lang') { flushNow(); (window.__glowFlush ? window.__glowFlush() : Promise.resolve()).then(() => location.reload()); return; }
  if (['todOn', 'todFrom', 'todTo', 'todStyle'].includes(key)) checkTimeStyle();
  if (key === 'watchFolders') { watchFolders(); if (settings.watchFolders) scan(true); }
  if (['discord', 'discordCover', 'offline'].includes(key)) updateDiscord(curTrack());
  if (key === 'offline' && !settings.offline) scheduleFlush(2000);
  if (['closeToTray', 'globalHotkeys', 'mediaKeys'].includes(key)) { applyDesktop().then(() => { if (S.view.name === 'settings') render($('#content').scrollTop); }); return; }
  if (['backdrop', 'coverMotion', 'particles', 'partPreset', 'quality', 'partCount', 'beatSens', 'coverStrength', 'ringStrength', 'beatDelay', 'animations', 'scene'].includes(key)) applyVisualSettings();
  if (key === 'nowSide' && S.nowOpen) renderNowRight();
  if (key === 'sort') { render(0); return; }
  if (rerender && S.view.name === 'settings') render($('#content').scrollTop);
}

