// Разбор текстов в формате LRC: [мм:сс.xx] строка. Поддерживаются несколько меток
// на строке и [offset:±мс]. Текст без меток показывается как обычный.

// Метки слов (расширенный LRC): <мм:сс.xx>слово
const WORD_RE = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>([^<]*)/g;
const stamp = (m, s, f) => parseInt(m, 10) * 60 + parseInt(s, 10) + (f ? parseInt(f, 10) / (f.length === 3 ? 1000 : 100) : 0);

export function parseLrc(text) {
  if (!text || !text.trim()) return null;
  const lines = [];
  let offset = 0;
  const plain = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
    if (off) { offset = parseInt(off[1], 10) / 1000; continue; }
    if (/^\[(ar|ti|al|by|au|length|re|ve|#):/i.test(raw)) continue;
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    const body = raw.replace(/\[[^\]]*\]/g, '');
    const content = body.replace(/<[^>]*>/g, '').trim();
    const words = [...body.matchAll(WORD_RE)].map((w) => ({ t: stamp(w[1], w[2], w[3]), text: w[4] }));
    if (tags.length) {
      for (const m of tags) {
        lines.push({ t: stamp(m[1], m[2], m[3]), text: content, words: words.length ? words : null });
      }
    } else if (raw.trim()) {
      plain.push(raw.trim());
    } else {
      plain.push('');
    }
  }
  if (lines.length) {
    lines.sort((a, b) => a.t - b.t);
    // Смещение из файла: положительное — текст раньше.
    for (const l of lines) {
      l.t = Math.max(0, l.t - offset);
      if (l.words) l.words = l.words.map((w) => ({ t: Math.max(0, w.t - offset), text: w.text }));
    }
    // Конец строки — начало следующей: по нему заполняется подсветка.
    lines.forEach((l, i) => { l.end = i + 1 < lines.length ? lines[i + 1].t : l.t + 4; });
    return { synced: true, lines };
  }
  return { synced: false, lines: plain.map((text) => ({ t: -1, text })) };
}

/** Индекс текущей строки для времени t. */
export function lineAt(lrc, t) {
  if (!lrc || !lrc.synced) return -1;
  let lo = 0, hi = lrc.lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lrc.lines[mid].t <= t + 0.15) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
