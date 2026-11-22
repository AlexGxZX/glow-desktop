# Как выпускать версии Glow

Сборка идёт на GitHub, а не у тебя на компьютере: ставишь тег — через 10–15 минут готов черновик релиза с установщиком. После публикации у всех пользователей Glow сам предложит обновиться.

## Один раз: подготовка

### 1. Репозиторий

Создай на GitHub репозиторий `glow-desktop` (сначала **Private**) и залей проект:

```bash
git init
git add .
git commit -m "Glow 1.10.0"
git branch -M main
git remote add origin https://github.com/<ТВОЙ_НИК>/glow-desktop.git
git push -u origin main
```

`node_modules`, `target` и ключи в репозиторий не попадут — они в `.gitignore`.

### 2. Ключ подписи обновлений

Glow ставит только обновления, подписанные твоим ключом, — так никто не подсунет пользователям чужой установщик.

```bash
npx tauri signer generate -w "%USERPROFILE%\.tauri\glow.key"
```

Придумай пароль. Появятся два файла:
- `glow.key` — **секретный**. Никому не показывай и не клади в репозиторий. Сохрани копию (облако, флешка): без него нельзя выпустить обновление для уже установленных Glow.
- `glow.key.pub` — публичный.

### 3. Вписать ключ и адрес в проект

В `src-tauri/tauri.conf.json`, раздел `plugins.updater`:
- `pubkey` — всё содержимое `glow.key.pub`;
- в `endpoints` замени `OWNER/REPO` на `<ТВОЙ_НИК>/glow-desktop`.

Закоммить и отправь.

### 4. Секреты для GitHub

Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:
- `TAURI_SIGNING_PRIVATE_KEY` — всё содержимое `glow.key`;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — пароль из шага 2.
- `GLOW_LASTFM_KEY` и `GLOW_LASTFM_SECRET` — API key и Shared secret приложения Glow на last.fm/api. Они попадают только в собранную программу, в открытом коде их нет. Без них кнопка «Подключить Last.fm» скажет, что в сборке нет ключа.

Для своей сборки у себя на компьютере (необязательно):
```
set GLOW_LASTFM_KEY=...
set GLOW_LASTFM_SECRET=...
npm run build
```

## Каждый релиз

1. Подними версию в **четырёх** местах (тест `npm test` проверит, что они совпадают):
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src/js/util.js` (`APP_VERSION`).
2. `npm test` и `npm run test:e2e` — всё зелёное?
3. Коммит, тег, отправка:
   ```bash
   git commit -am "Glow 1.11.0"
   git tag v1.11.0
   git push && git push origin v1.11.0
   ```
4. Вкладка **Actions** → дождись зелёной галочки у «Release».
5. **Releases** → черновик «Glow 1.11.0»: впиши, что нового, и нажми **Publish release**.

С этого момента Glow у пользователей при запуске предложит обновиться (не чаще раза в сутки), а кнопка «Проверить обновления» в настройках найдёт версию сразу.

## Приватный → публичный

Пока репозиторий приватный, автообновление **не работает**: Glow скачивает `latest.json` без логина, а GitHub отдаёт файлы приватных репозиториев только с ним. Сборка и черновики релизов при этом работают — установщик можно скачать из релиза вручную.

Когда будешь готов показать Glow людям:
1. Проверь, что в репозитории нет ничего личного: `git log -p | findstr /i "key password token"`.
2. **Settings → General → Danger Zone → Change visibility → Public**.
3. Опубликуй релиз — автообновление заработает у всех, у кого стоит версия 1.10.0 и новее.

## Если сборка на GitHub упала

Открой упавший шаг в Actions и пришли текст ошибки. Частое:
- `A public key has been found, but no private key` — не добавлен секрет `TAURI_SIGNING_PRIVATE_KEY`;
- `incorrect updater private key password` — не тот пароль в секрете;
- упали тесты — `npm test` локально покажет, что именно.
