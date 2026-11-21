import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('версия одинаковая везде: package.json, tauri.conf.json, Cargo.toml, util.js', () => {
  const pkg = JSON.parse(read('package.json')).version;
  const conf = JSON.parse(read('src-tauri/tauri.conf.json')).version;
  const cargo = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1];
  const app = read('src/js/util.js').match(/APP_VERSION = '([^']+)'/)[1];
  assert.deepEqual({ conf, cargo, app }, { conf: pkg, cargo: pkg, app: pkg });
});

test('все модули интерфейса импортируют только существующие экспорты', async () => {
  const dir = new URL('../../src/js/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const exportsOf = {};
  for (const f of files) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    exportsOf[f] = new Set([...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/gm)].map((m) => m[1]));
  }
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/^import \{([^}]*)\} from '\.\/([\w.]+)';/gm)) {
      for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!exportsOf[m[2]]?.has(name)) missing.push(`${f}: ${name} из ${m[2]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
