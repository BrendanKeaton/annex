mod auth;
mod config;
mod http;
mod models;
mod paths;
mod sessions;
pub mod tray;

use crate::models::structs::AppState;
use crate::models::structs::app_state::ProtectedState;
use crate::sessions::endpoints::DeletionRetrySignal;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Dev only — release builds use compile-time embedded values (see config.rs).
    #[cfg(debug_assertions)]
    {
        dotenvy::dotenv().ok();
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            app.manage(Mutex::new(AppState::default()));
            app.manage(DeletionRetrySignal::new());

            // Listen for deep links from the Google OAuth flow
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let app = handle.clone();
                tauri::async_runtime::spawn(async move {
                    for url in event.urls() {
                        let url_str = url.as_str();
                        if url_str.starts_with("annex://auth/callback") {
                            let state = app.state::<Mutex<AppState>>();
                            if let Err(e) = crate::auth::oauth::handle_oauth_deep_link(
                                &app, &state, url_str,
                            )
                            .await
                            {
                                let _ = app.emit("oauth-error", e);
                            }
                            break;
                        }
                    }
                });
            });

            tray::setup_tray(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::login::login,
            auth::logout::logout,
            auth::oauth::login_with_google,
            auth::session::refresh_user_session,
            paths::add::scan_paths,
            paths::add::add_protected_paths,
            paths::remove::delete_protected_path,
            sessions::encryption::initiate_session,
            sessions::endpoints::verify_pin,
            sessions::decryption::decrypt_session,
            sessions::recovery::recover_session,
            sessions::endpoints::retry_secure_deletion,
            sessions::endpoints::skip_secure_deletion,
            sessions::endpoints::clear_logs
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if let Some(state) = app.try_state::<Mutex<AppState>>() {
                    if let Ok(s) = state.lock() {
                        match s.protected_state {
                            ProtectedState::InProcess
                            | ProtectedState::Ending
                            | ProtectedState::DeletionBlocked => {
                                api.prevent_close();
                                let dialog = app.dialog().clone();
                                tauri::async_runtime::spawn(async move {
                                    dialog.message("A session is currently in progress. Closing the app now may leave your files in an encrypted state. Please wait for the operation to complete.")
                                        .title("Session In Progress")
                                        .kind(MessageDialogKind::Warning)
                                        .buttons(MessageDialogButtons::OkCustom("OK".to_string()))
                                        .blocking_show();
                                });
                            }
                            ProtectedState::Active => {
                                api.prevent_close();
                                let handle = app.clone();
                                let dialog = app.dialog().clone();
                                tauri::async_runtime::spawn(async move {
                                    let confirmed = dialog.message("You have an active session with encrypted files. If you close the app, you can recover your session on next launch. Are you sure you want to close?")
                                        .title("Active Session")
                                        .kind(MessageDialogKind::Warning)
                                        .buttons(MessageDialogButtons::OkCancelCustom("Close".to_string(), "Cancel".to_string()))
                                        .blocking_show();

                                    if confirmed {
                                        if let Some(w) = handle.get_webview_window("main") {
                                            let _ = w.destroy();
                                        }
                                    }
                                });
                            }
                            _ => {}
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
