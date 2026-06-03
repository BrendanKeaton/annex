use crate::models::structs::app_state::ProtectedState;
use crate::models::structs::AppStatePayload;
use std::sync::{Mutex, OnceLock};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

pub const TRAY_ID: &str = "main-tray";

#[derive(PartialEq, Clone)]
struct TrayMenuKey {
    is_authenticated: bool,
    protected_state: ProtectedState,
    has_paths: bool,
}

static LAST_TRAY_KEY: OnceLock<Mutex<Option<TrayMenuKey>>> = OnceLock::new();

pub fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
    let signin_hint = MenuItem::with_id(
        app,
        "signin-hint",
        "Sign in to start a session",
        false,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &signin_hint, &separator, &quit_item])?;

    let icon = Image::from_bytes(include_bytes!("../../public/tray-iconTemplate@2x.png"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Annex")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "start-session" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("tray-start-session", ());
            }
            "end-session" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("tray-end-session", ());
            }
            "quit" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.close();
                } else {
                    app.exit(0);
                }
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

pub fn update_tray_menu(app: &tauri::AppHandle, payload: &AppStatePayload) {
    let key = TrayMenuKey {
        is_authenticated: payload.is_authenticated,
        protected_state: payload.protected_state.clone(),
        has_paths: !payload.protected_paths.is_empty(),
    };

    let last = LAST_TRAY_KEY.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = last.lock() {
        if guard.as_ref() == Some(&key) {
            // Nothing the menu cares about has changed — skip rebuild.
            return;
        }
        *guard = Some(key);
    }

    let _ = rebuild_menu(app, payload);
}

fn rebuild_menu(
    app: &tauri::AppHandle,
    payload: &AppStatePayload,
) -> Result<(), Box<dyn std::error::Error>> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("Tray not found")?;

    let show_item = MenuItem::with_id(app, "show", "Show App", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = if payload.is_authenticated {
        match payload.protected_state {
            ProtectedState::Inactive => {
                let enabled = !payload.protected_paths.is_empty();
                let start =
                    MenuItem::with_id(app, "start-session", "Start Session", enabled, None::<&str>)?;
                Menu::with_items(app, &[&show_item, &start, &separator, &quit_item])?
            }
            ProtectedState::Active => {
                let end =
                    MenuItem::with_id(app, "end-session", "End Session", true, None::<&str>)?;
                Menu::with_items(app, &[&show_item, &end, &separator, &quit_item])?
            }
            ProtectedState::InProcess => {
                let status =
                    MenuItem::with_id(app, "status", "Encrypting...", false, None::<&str>)?;
                Menu::with_items(app, &[&show_item, &status, &separator, &quit_item])?
            }
            ProtectedState::Ending => {
                let status =
                    MenuItem::with_id(app, "status", "Decrypting...", false, None::<&str>)?;
                Menu::with_items(app, &[&show_item, &status, &separator, &quit_item])?
            }
            ProtectedState::DeletionBlocked => {
                let status =
                    MenuItem::with_id(app, "status", "Waiting...", false, None::<&str>)?;
                Menu::with_items(app, &[&show_item, &status, &separator, &quit_item])?
            }
            ProtectedState::Failed => {
                Menu::with_items(app, &[&show_item, &separator, &quit_item])?
            }
        }
    } else {
        let hint = MenuItem::with_id(
            app,
            "signin-hint",
            "Sign in to start a session",
            false,
            None::<&str>,
        )?;
        Menu::with_items(app, &[&show_item, &hint, &separator, &quit_item])?
    };

    tray.set_menu(Some(menu))?;
    Ok(())
}
