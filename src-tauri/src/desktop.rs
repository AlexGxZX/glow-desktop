//! Интеграция с рабочим столом: значок в трее, глобальные горячие клавиши
//! и кнопки управления на миниатюре в панели задач Windows.
//!
//! Все действия уходят в окно событием "media" со строкой:
//! "prev", "play", "next", "volup", "voldown", "like", "stop".

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Закрывать окно в трей, а не выходить.
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
/// Интерфейс на английском (меню трея, подсказки, диалоги).
pub static UI_EN: AtomicBool = AtomicBool::new(false);

/// Строка на языке интерфейса.
pub fn l(ru: &'static str, en: &'static str) -> &'static str {
    if UI_EN.load(Ordering::Relaxed) {
        en
    } else {
        ru
    }
}

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(
        app,
        "show",
        l("Открыть Glow", "Open Glow"),
        true,
        None::<&str>,
    )?;
    let prev = MenuItem::with_id(
        app,
        "prev",
        l("Предыдущий трек", "Previous track"),
        true,
        None::<&str>,
    )?;
    let play = MenuItem::with_id(
        app,
        "play",
        l("Играть / пауза", "Play / pause"),
        true,
        None::<&str>,
    )?;
    let next = MenuItem::with_id(
        app,
        "next",
        l("Следующий трек", "Next track"),
        true,
        None::<&str>,
    )?;
    let like = MenuItem::with_id(
        app,
        "like",
        l("В избранное", "Add to favorites"),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        l("Выйти из Glow", "Quit Glow"),
        true,
        None::<&str>,
    )?;
    let s1 = PredefinedMenuItem::separator(app)?;
    let s2 = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&show, &s1, &prev, &play, &next, &like, &s2, &quit])
}

/// Язык интерфейса из настроек Glow: перестраиваем меню трея и подсказки кнопок.
#[tauri::command]
pub fn set_ui_lang(app: AppHandle, lang: String) {
    UI_EN.store(lang == "en", Ordering::Relaxed);
    if let (Some(tray), Ok(menu)) = (app.tray_by_id("glow"), tray_menu(&app)) {
        let _ = tray.set_menu(Some(menu));
    }
    #[cfg(windows)]
    thumbbar::refresh(&app);
}

fn emit_media(app: &AppHandle, action: &str) {
    let _ = app.emit("media", action.to_string());
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ---------------- Трей ----------------

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = tray_menu(app)?;

    let mut builder = TrayIconBuilder::with_id("glow")
        .tooltip("Glow")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "quit" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.emit("before-quit", ());
                }
                let app = app.clone();
                // Даём окну долю секунды, чтобы сохранить очередь и настройки.
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(350));
                    app.exit(0);
                });
            }
            id => emit_media(app, id),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Подсказка у значка в трее: что сейчас играет.
#[tauri::command]
pub fn set_tray_tip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id("glow") {
        let t: String = text.chars().take(120).collect();
        let _ = tray.set_tooltip(Some(if t.is_empty() { "Glow".to_string() } else { t }));
    }
}

#[tauri::command]
pub fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

// ---------------- Глобальные горячие клавиши ----------------

static HOTKEYS: Mutex<Vec<(Shortcut, &'static str)>> = Mutex::new(Vec::new());

fn hotkey_table(media: bool) -> Vec<(Shortcut, &'static str, &'static str)> {
    let ca = Some(Modifiers::CONTROL | Modifiers::ALT);
    let mut v = vec![
        (Shortcut::new(ca, Code::Space), "play", "Ctrl+Alt+Space"),
        (Shortcut::new(ca, Code::ArrowRight), "next", "Ctrl+Alt+→"),
        (Shortcut::new(ca, Code::ArrowLeft), "prev", "Ctrl+Alt+←"),
        (Shortcut::new(ca, Code::ArrowUp), "volup", "Ctrl+Alt+↑"),
        (Shortcut::new(ca, Code::ArrowDown), "voldown", "Ctrl+Alt+↓"),
        (Shortcut::new(ca, Code::KeyL), "like", "Ctrl+Alt+L"),
    ];
    if media {
        v.push((
            Shortcut::new(None, Code::MediaPlayPause),
            "play",
            "Play/Pause",
        ));
        v.push((Shortcut::new(None, Code::MediaTrackNext), "next", "Next"));
        v.push((
            Shortcut::new(None, Code::MediaTrackPrevious),
            "prev",
            "Previous",
        ));
        v.push((Shortcut::new(None, Code::MediaStop), "stop", "Stop"));
    }
    v
}

pub fn shortcut_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let action = HOTKEYS
                .lock()
                .ok()
                .and_then(|list| list.iter().find(|(s, _)| s == shortcut).map(|(_, a)| *a));
            if let Some(a) = action {
                emit_media(app, a);
            }
        })
        .build()
}

/// Включить или выключить глобальные клавиши. Возвращает те, что заняты другой программой.
#[tauri::command]
pub fn set_global_hotkeys(app: AppHandle, on: bool, media: bool) -> Vec<String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut failed = Vec::new();
    let mut active = Vec::new();
    if on {
        for (sc, action, label) in hotkey_table(media) {
            match gs.register(sc) {
                Ok(()) => active.push((sc, action)),
                Err(_) => failed.push(label.to_string()),
            }
        }
    }
    if let Ok(mut list) = HOTKEYS.lock() {
        *list = active;
    }
    failed
}

// ---------------- Кнопки на миниатюре в панели задач (Windows) ----------------

#[cfg(windows)]
pub mod thumbbar {
    use super::emit_media;
    use std::cell::RefCell;
    use std::sync::OnceLock;
    use tauri::{AppHandle, Manager};
    use windows::core::w;
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THB_FLAGS,
        THB_ICON, THB_TOOLTIP, THUMBBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIcon, RegisterWindowMessageW, HICON, WM_COMMAND,
    };

    const ID_PREV: u32 = 41;
    const ID_PLAY: u32 = 42;
    const ID_NEXT: u32 = 43;
    const THBN_CLICKED: usize = 0x1800;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    static CREATED_MSG: OnceLock<u32> = OnceLock::new();

    struct Bar {
        list: ITaskbarList3,
        hwnd: HWND,
        icons: [HICON; 4], // prev, play, pause, next
        added: bool,
        playing: bool,
    }

    thread_local! {
        static BAR: RefCell<Option<Bar>> = const { RefCell::new(None) };
    }

    // ---- рисуем белые значки 32×32 со сглаживанием ----

    fn inside(poly: &[(f32, f32)], x: f32, y: f32) -> bool {
        let mut c = false;
        let mut j = poly.len() - 1;
        for i in 0..poly.len() {
            let (xi, yi) = poly[i];
            let (xj, yj) = poly[j];
            if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
                c = !c;
            }
            j = i;
        }
        c
    }

    fn make_icon(shapes: &[Vec<(f32, f32)>]) -> HICON {
        const N: usize = 32;
        let mut xor = vec![0u8; N * N * 4];
        for py in 0..N {
            for px in 0..N {
                let mut hits = 0;
                for sy in 0..4 {
                    for sx in 0..4 {
                        let x = px as f32 + (sx as f32 + 0.5) / 4.0;
                        let y = py as f32 + (sy as f32 + 0.5) / 4.0;
                        if shapes.iter().any(|p| inside(p, x, y)) {
                            hits += 1;
                        }
                    }
                }
                let a = (hits * 255 / 16) as u8;
                let o = (py * N + px) * 4;
                xor[o] = 255;
                xor[o + 1] = 255;
                xor[o + 2] = 255;
                xor[o + 3] = a;
            }
        }
        let and = vec![0u8; N * N / 8];
        unsafe {
            CreateIcon(
                HINSTANCE::default(),
                N as i32,
                N as i32,
                1,
                32,
                and.as_ptr(),
                xor.as_ptr(),
            )
            .unwrap_or_default()
        }
    }

    fn rect(x0: f32, y0: f32, x1: f32, y1: f32) -> Vec<(f32, f32)> {
        vec![(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    }

    fn icons() -> [HICON; 4] {
        let prev = make_icon(&[
            rect(6.0, 7.0, 9.5, 25.0),
            vec![(26.0, 7.0), (26.0, 25.0), (10.5, 16.0)],
        ]);
        let play = make_icon(&[vec![(9.0, 5.5), (9.0, 26.5), (27.0, 16.0)]]);
        let pause = make_icon(&[rect(8.0, 6.0, 13.5, 26.0), rect(18.5, 6.0, 24.0, 26.0)]);
        let next = make_icon(&[
            vec![(6.0, 7.0), (6.0, 25.0), (21.5, 16.0)],
            rect(22.5, 7.0, 26.0, 25.0),
        ]);
        [prev, play, pause, next]
    }

    fn tip(s: &str) -> [u16; 260] {
        let mut out = [0u16; 260];
        for (i, c) in s.encode_utf16().take(259).enumerate() {
            out[i] = c;
        }
        out
    }

    fn buttons(bar: &Bar) -> [THUMBBUTTON; 3] {
        let mk = |id: u32, icon: HICON, t: &str| THUMBBUTTON {
            dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
            iId: id,
            iBitmap: 0,
            hIcon: icon,
            szTip: tip(t),
            dwFlags: THBF_ENABLED,
        };
        [
            mk(ID_PREV, bar.icons[0], super::l("Предыдущий", "Previous")),
            if bar.playing {
                mk(ID_PLAY, bar.icons[2], super::l("Пауза", "Pause"))
            } else {
                mk(ID_PLAY, bar.icons[1], super::l("Играть", "Play"))
            },
            mk(ID_NEXT, bar.icons[3], super::l("Следующий", "Next")),
        ]
    }

    fn sync(bar: &mut Bar) {
        let b = buttons(bar);
        unsafe {
            if bar.added {
                let _ = bar.list.ThumbBarUpdateButtons(bar.hwnd, &b);
            } else if bar.list.ThumbBarAddButtons(bar.hwnd, &b).is_ok() {
                bar.added = true;
            }
        }
    }

    unsafe extern "system" fn subclass(
        hwnd: HWND,
        msg: u32,
        wp: WPARAM,
        lp: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if msg == WM_COMMAND && (wp.0 >> 16) & 0xffff == THBN_CLICKED {
            let action = match (wp.0 & 0xffff) as u32 {
                ID_PREV => Some("prev"),
                ID_PLAY => Some("play"),
                ID_NEXT => Some("next"),
                _ => None,
            };
            if let (Some(a), Some(app)) = (action, APP.get()) {
                emit_media(app, a);
                return LRESULT(0);
            }
        }
        if Some(&msg) == CREATED_MSG.get() {
            // Explorer перезапустился или кнопка в панели задач создана заново.
            BAR.with(|b| {
                if let Some(bar) = b.borrow_mut().as_mut() {
                    bar.added = false;
                    sync(bar);
                }
            });
        }
        DefSubclassProc(hwnd, msg, wp, lp)
    }

    /// Ставим кнопки. Вызывается в главном потоке.
    pub fn install(app: &AppHandle) {
        let _ = APP.set(app.clone());
        let Some(win) = app.get_webview_window("main") else {
            return;
        };
        let Ok(raw) = win.hwnd() else { return };
        let hwnd = HWND(raw.0 as _);
        unsafe {
            let _ = CREATED_MSG.set(RegisterWindowMessageW(w!("TaskbarButtonCreated")));
            let Ok(list) = CoCreateInstance::<_, ITaskbarList3>(
                &TaskbarList,
                None::<&windows::core::IUnknown>,
                CLSCTX_INPROC_SERVER,
            ) else {
                return;
            };
            let _ = list.HrInit();
            let _ = SetWindowSubclass(hwnd, Some(subclass), 0x610, 0);
            let mut bar = Bar {
                list,
                hwnd,
                icons: icons(),
                added: false,
                playing: false,
            };
            sync(&mut bar);
            BAR.with(|b| *b.borrow_mut() = Some(bar));
        }
    }

    pub fn set_playing(app: &AppHandle, playing: bool) {
        let _ = app.run_on_main_thread(move || {
            BAR.with(|b| {
                if let Some(bar) = b.borrow_mut().as_mut() {
                    if bar.playing != playing || !bar.added {
                        bar.playing = playing;
                        sync(bar);
                    }
                }
            });
        });
    }
    /// Обновить подсказки кнопок (после смены языка).
    pub fn refresh(app: &AppHandle) {
        let _ = app.run_on_main_thread(move || {
            BAR.with(|b| {
                if let Some(bar) = b.borrow_mut().as_mut() {
                    sync(bar);
                }
            });
        });
    }
}

/// Сообщить панели задач, играет ли музыка, — чтобы сменить значок «Играть/Пауза».
#[tauri::command]
pub fn set_thumb_playing(app: AppHandle, playing: bool) {
    #[cfg(windows)]
    thumbbar::set_playing(&app, playing);
    #[cfg(not(windows))]
    let _ = (app, playing);
}

pub fn setup(app: &AppHandle) {
    if let Err(e) = setup_tray(app) {
        eprintln!("трей: {e}");
    }
    #[cfg(windows)]
    {
        let h = app.clone();
        let _ = app.run_on_main_thread(move || thumbbar::install(&h));
    }
}

// ---------------- Слежение за папками медиатеки ----------------

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};

static WATCHER: Mutex<Option<Debouncer<RecommendedWatcher>>> = Mutex::new(None);

const WATCH_EXT: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "oga", "opus", "m4a", "aac", "alac", "aiff", "aif", "wma", "ape",
    "wv", "mpc", "lrc", "jpg", "jpeg", "png",
];

/// Следить за папками: появился, удалён или изменён трек — окну приходит "library-changed".
/// Пустой список — перестать следить.
#[tauri::command]
pub fn watch_folders(app: AppHandle, folders: Vec<String>) -> Result<(), String> {
    let mut slot = WATCHER.lock().map_err(|e| e.to_string())?;
    *slot = None; // старый наблюдатель останавливается при удалении
    if folders.is_empty() {
        return Ok(());
    }
    let handle = app.clone();
    let mut deb = new_debouncer(
        std::time::Duration::from_millis(1500),
        move |res: DebounceEventResult| {
            let Ok(events) = res else { return };
            let paths: Vec<String> = events
                .iter()
                .filter(|e| {
                    // Папки (без расширения) тоже считаем: их могли переместить целиком.
                    match e.path.extension().and_then(|x| x.to_str()) {
                        Some(ext) => WATCH_EXT.contains(&ext.to_ascii_lowercase().as_str()),
                        None => true,
                    }
                })
                .map(|e| e.path.to_string_lossy().into_owned())
                .collect();
            if !paths.is_empty() {
                let _ = handle.emit("library-changed", paths);
            }
        },
    )
    .map_err(|e| e.to_string())?;
    for f in &folders {
        let p = std::path::Path::new(f);
        if p.is_dir() {
            let _ = deb.watcher().watch(p, RecursiveMode::Recursive);
        }
    }
    *slot = Some(deb);
    Ok(())
}
