use crate::models::structs::app_state::{LogEntry, LogLevel};
use crate::models::structs::{AppState, AppStatePayload};
use std::sync::Mutex;
use tauri::Emitter;
use time::OffsetDateTime;

pub fn emit_state(app: &tauri::AppHandle, payload: AppStatePayload) -> Result<(), String> {
    crate::tray::update_tray_menu(app, &payload);
    app.emit("app-state-changed", payload)
        .map_err(|e| e.to_string())
}

pub fn update_state_and_emit<F>(
    app: &tauri::AppHandle,
    state: &Mutex<AppState>,
    updater: F,
) -> Result<AppStatePayload, String>
where
    F: FnOnce(&mut AppState),
{
    let payload = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        updater(&mut s);
        s.to_payload()
    };
    emit_state(app, payload.clone())?;
    Ok(payload)
}

pub fn push_log(state: &Mutex<AppState>, level: LogLevel, message: String) {
    if let Ok(mut s) = state.lock() {
        s.logs.push(LogEntry {
            level,
            message,
            timestamp: OffsetDateTime::now_utc()
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
        });
    }
}

pub fn push_log_and_emit(
    app: &tauri::AppHandle,
    state: &Mutex<AppState>,
    level: LogLevel,
    message: String,
) -> Result<(), String> {
    update_state_and_emit(app, state, |s| {
        s.logs.push(LogEntry {
            level,
            message: message.clone(),
            timestamp: OffsetDateTime::now_utc()
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
        });
    })?;
    Ok(())
}
