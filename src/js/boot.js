// Загрузчик Glow: настройки, медиатека-метаданные, плейлисты, свои стили хранятся в файлах
// %APPDATA%\Glow\*.json (их не трогает установщик при обновлении).
// Перед запуском интерфейса файлы копируются в localStorage, а каждое изменение
// localStorage с ключом glow.* сразу записывается обратно в файл.

const T = window.__TAURI__;
const KEYS = ['settings', 'meta', 'resume', 'customStyles', 'styleDraft'];
const chains = {};

function persist(key, value) {
  if (!T) return Promise.resolve();
  // Записи одного ключа идут строго по очереди, чтобы старые данные не перезаписали новые.
  const prev = chains[key] || Promise.resolve();
  const next = prev.then(() => (value === null
    ? T.core.invoke('store_delete', { key })
    : T.core.invoke('store_write', { key, content: value }))).catch((e) => console.warn('store', key, e));
  chains[key] = next;
  return next;
}

/** Дождаться, пока все изменения записаны на диск (перед закрытием окна). */
window.__glowFlush = () => Promise.all(Object.values(chains));

async function boot() {
  if (T) {
    try {
      const files = (await T.core.invoke('store_read_all')) || {};
      for (const k of KEYS) {
        const lsKey = 'glow.' + k;
        if (files[k] !== undefined) {
          localStorage.setItem(lsKey, files[k]);
        } else {
          // Первый запуск новой версии: переносим то, что было во внутреннем хранилище.
          const cur = localStorage.getItem(lsKey);
          if (cur) persist(k, cur);
        }
      }
    } catch (e) {
      console.warn('Не удалось прочитать данные Glow из файлов', e);
    }
    const setItem = Storage.prototype.setItem;
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) {
      setItem.call(this, k, v);
      if (this === localStorage && typeof k === 'string' && k.startsWith('glow.')) {
        const key = k.slice(5);
        if (KEYS.includes(key)) persist(key, String(v));
      }
    };
    Storage.prototype.removeItem = function (k) {
      removeItem.call(this, k);
      if (this === localStorage && typeof k === 'string' && k.startsWith('glow.')) {
        const key = k.slice(5);
        if (KEYS.includes(key)) persist(key, null);
      }
    };
  }
  await import('./main.js');
}

boot();
