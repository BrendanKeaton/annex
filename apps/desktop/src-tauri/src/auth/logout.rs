use crate::models::structs::{AppState, AppStatePayload};
use crate::tray;
use std::sync::Mutex;
use tauri::Emitter;

#[tauri::command]
pub async fn logout(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<AppStatePayload, String> {
    let payload = {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.access_token = None;
        state.refresh_token = None;
        state.token_expires_at = None;
        state.user_id = None;
        state.user_email = None;
        state.org_name = None;
        state.logo_path = None;
        state.daily_session_count = None;
        state.protected_paths = Vec::new();
        state.usage = 0.0;
        state.subscription_level = "free".to_string();
        state.to_payload()
    };

    tray::update_tray_menu(&app, &payload);
    app.emit("app-state-changed", payload.clone())
        .map_err(|e| e.to_string())?;

    Ok(payload)
}
