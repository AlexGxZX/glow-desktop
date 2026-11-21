// Разбор текстов в формате LRC: [мм:сс.xx] строка. Поддерживаются несколько меток
// на строке и [offset:±мс]. Текст без меток показывается как обычный.

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
    const content = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (tags.length) {
      for (const m of tags) {
        const frac = m[3] ? parseInt(m[3], 10) / (m[3].length === 3 ? 1000 : 100) : 0;
        lines.push({ t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac, text: content });
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
    for (const l of lines) l.t = Math.max(0, l.t - offset);
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
