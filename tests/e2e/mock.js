// Подмена Tauri для автотестов: медиатека из 54 треков, файлы настроек в sessionStorage.
(() => {
  window.__glowListeners = {};
  window.__glowEmit = (name, payload) => (window.__glowListeners[name] || []).forEach((cb) => cb({ payload }));
  window.__glowCalls = [];
  const artists = ['Neon Coast','Mira Vale','Северный ветер','Kairo','Lumen Drift','Ольга Ночь'];
  const albums = ['Afterglow','Midnight Static','Город спит','Prism','Slow Waves','Тёплые лампы'];
  const genres = ['Synthwave','Indie','Электроника','Lo-fi','Поп','Ambient'];
  const tracks = [];
  let n = 0;
  for (let a = 0; a < 6; a++) for (let k = 1; k <= 9; k++) {
    n++;
    tracks.push({ path: `C:\\Music\\${albums[a]}\\${k}.wav#${n}`, real: `/__media/t${n % 4}.wav`,
      title: ['Свет','Night Drive','Echoes','Blue Hour','Пульс','Glass Heart','Неон','Drift','Последний трамвай'][k-1] + (a ? '' : ''),
      artist: artists[a], album: albums[a], album_artist: '', genre: genres[a], track_no: k, disc_no: 1, year: String(2018 + a),
      duration: 12, cover: `C:\\covers\\c${a}.jpg`, added: 1700000000 + n * 1000, mtime: 0, size: 3e7, format: 'FLAC',
      sample_rate: 44100, bit_depth: 16, channels: 2, bitrate: 1024, rg_track: '-6.2 dB', rg_album: '', folder: `C:\\Music\\${albums[a]}`, has_lyrics: k === 1 });
  }
  tracks[1].rg_track = '';
  if (sessionStorage.getItem('moved')) tracks[35].path = 'C:\\Moved\\Prism\\9.wav';
  if (sessionStorage.getItem('dupes')) tracks.push({ ...tracks[0], path: 'C:\\Music\\Copies\\Свет.mp3', format: 'MP3', bit_depth: 0, bitrate: 320, size: 9e6 });
  const byPath = new Map(tracks.map(t => [t.path, t]));
  if (sessionStorage.getItem('seedHistory') && !sessionStorage.getItem('seeded')) {
    sessionStorage.setItem('seeded', '1');
    // История за два года: самый частый — «Night Drive» Neon Coast.
    const at = (y, m, d, h) => Math.floor(new Date(y, m, d, h).getTime() / 1000);
    const history = [];
    for (let i = 0; i < 30; i++) history.push({ p: tracks[i % 9].path, t: at(2026, i % 12, 1 + (i % 27), 8 + (i % 14)) });
    for (let i = 0; i < 12; i++) history.push({ p: tracks[1].path, t: at(2026, 3, 1 + i, 21) });
    for (let i = 0; i < 5; i++) history.push({ p: tracks[20].path, t: at(2025, 5, 1 + i, 12) });
    history.sort((a, b) => a.t - b.t);
    sessionStorage.setItem('mockFiles', JSON.stringify({ meta: JSON.stringify({ history, plays: {}, last: {}, ratings: {}, playlists: [], favorites: [] }) }));
  }
  const lrc = `[00:00.50]Свет из окна
[00:02.00]рисует на стенах
[00:04.00]тёплые линии ночи
[00:06.00]мы едем без карты
[00:08.00]и город светится
[00:10.00]в такт нашим сердцам`;
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        window.__glowCalls.push(cmd);
        if (cmd === 'load_library' || cmd === 'scan_library') return tracks;
        if (cmd === 'store_read_all') return JSON.parse(sessionStorage.getItem('mockFiles') || '{}');
        if (cmd === 'store_write') { const f = JSON.parse(sessionStorage.getItem('mockFiles') || '{}'); f[args.key] = args.content; sessionStorage.setItem('mockFiles', JSON.stringify(f)); return null; }
        if (cmd === 'store_delete') { const f = JSON.parse(sessionStorage.getItem('mockFiles') || '{}'); delete f[args.key]; sessionStorage.setItem('mockFiles', JSON.stringify(f)); return null; }
        if (cmd === 'pick_cover' || cmd === 'pick_image') return 'C:\\covers\\c4.jpg';
        if (cmd === 'write_tags') { const t = { ...byPath.get(args.path) }; for (const [k, v] of Object.entries(args.edit)) if (v !== null && v !== undefined && k !== 'cover' && k !== 'remove_cover') t[k] = v; if (args.edit.cover) t.cover = args.edit.cover; if (args.edit.remove_cover) t.cover = null; byPath.set(t.path, t); return t; }
        if (cmd === 'online_lyrics') return sessionStorage.getItem('fakeLyrics') ? { text: '[00:00.50]Текст из LRCLIB\n[00:03.00]вторая строка', synced: true, cached: false } : null;
        if (cmd === 'search_covers') return [0, 1, 2, 3].map((i) => ({ path: `C:\\covers\\c${i}.jpg`, source: i % 2 ? 'MusicBrainz' : 'iTunes', title: `Вариант ${i + 1}`, size: '1000×1000' }));
        if (cmd === 'lastfm_available') return true;
        if (cmd === 'lastfm_begin') return { token: 'tok', url: 'https://www.last.fm/api/auth/?api_key=k&token=tok' };
        if (cmd === 'lastfm_finish') return { name: 'tester', key: 'sk123' };
        if (cmd === 'listenbrainz_check') return 'lb-user';
        if (cmd === 'lastfm_scrobble' || cmd === 'listenbrainz_submit') { window.__glowScrobbled = (window.__glowScrobbled || 0) + args.items.length; return args.items.length; }
        if (cmd === 'read_tracks') return args.paths.flatMap((p) => /\.wav|\.flac|\.mp3/i.test(p) ? [{ ...tracks[0], path: p, title: 'Внешний трек', artist: 'Гость' }] : [{ ...tracks[0], path: p + '\\a.flac', title: 'Из папки', artist: 'Гость' }, { ...tracks[1], path: p + '\\b.flac', title: 'Из папки 2', artist: 'Гость' }]);
        if (cmd === 'list_lrc') return ['D:\\Lyrics\\Mira Vale - Night Drive.lrc'];
        if (cmd === 'pick_folder') return 'D:\\Lyrics';
        if (cmd === 'save_file') { sessionStorage.setItem('savedSync', args.content); return true; }
        if (cmd === 'pick_file') return 'D:\\x.glowsync';
        if (cmd === 'read_text') return args.path.endsWith('.lrc') ? '[00:00.00]Текст из папки\n[00:03.00]вторая строка' : sessionStorage.getItem('savedSync');
        if (cmd === 'write_folder_image') return args.folder + '\\folder.jpg';
        if (cmd === 'check_update') return sessionStorage.getItem('fakeUpdate') ? { version: '9.9.9', current: '1.13.0', notes: 'Тестовое обновление\n— пункт', date: '' } : null;
        if (cmd === 'install_update') { window.__glowEmit('update-progress', 0.5); return null; }
        if (cmd === 'read_lyrics') return byPath.get(args.path)?.has_lyrics ? lrc : null;
        return null;
      },
      convertFileSrc: (p) => {
        const t = byPath.get(p); if (t) return t.real;
        const m = p.match(/c(\d)\.jpg$/); if (m) return `/__media/c${m[1]}.svg`;
        return /\.(flac|mp3|wav)$/i.test(p) ? '/__media/t0.wav' : p;
      },
    },
    event: {
      listen: async (name, cb) => { (window.__glowListeners[name] ||= []).push(cb); return () => {}; },
    },
  };
  if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('glow.settings', JSON.stringify({ folders: ['C:\\Music'], scanOnStart: false })); }
})();
