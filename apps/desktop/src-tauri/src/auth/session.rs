use crate::models::structs::app_state::ProtectedState;
use crate::models::structs::{AppState, AppStatePayload, AuthResponse, SessionStatus};
use crate::tray;
use std::sync::Mutex;
use tauri::Emitter;

pub fn apply_auth_response(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, Mutex<AppState>>,
    auth: AuthResponse,
) -> Result<AppStatePayload, String> {
    let payload = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.access_token = Some(auth.session.access_token);
        if let Some(rt) = auth.session.refresh_token {
            s.refresh_token = Some(rt);
        }
        if let Some(exp) = auth.session.expires_at {
            s.token_expires_at = Some(exp);
        }
        s.user_id = Some(auth.user.id);
        s.user_email = Some(
            auth.user
                .email
                .expect("MISSING EMAIL FIELD IN SUPABASE RESPONSE"),
        );
        s.org_name = auth.org_name;
        s.logo_path = auth.logo_path;
        s.daily_session_count = auth.session.daily_session_count;
        s.usage = auth.usage.unwrap_or(0.0);
        s.curr_file_count = auth.curr_file_count.unwrap_or(0);
        s.max_file_count = auth.max_file_count.unwrap_or(0);
        s.protected_paths = auth.protected_paths.unwrap_or_default();
        s.session_history = auth.session_history.unwrap_or_default();

        s.mid_process = auth.mid_process.unwrap_or(false);
        s.subscription_level = auth.subscription_level.unwrap_or_else(|| "free".to_string());

        let active = s
            .session_history
            .iter()
            .find(|sh| matches!(sh.status, SessionStatus::Active))
            .map(|sh| (sh.id.clone(), sh.file_count));
        if let Some((id, file_count)) = active {
            s.protected_state = ProtectedState::Active;
            s.session_id = Some(id);
            s.session_files_processed = file_count;
        }

        s.to_payload()
    };

    tray::update_tray_menu(app, &payload);
    app.emit("app-state-changed", payload.clone())
        .map_err(|e| e.to_string())?;
    Ok(payload)
}

pub async fn anon_refresh(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, Mutex<AppState>>,
) -> Result<AppStatePayload, String> {
    let (api_url, refresh_token) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let token = s
            .refresh_token
            .clone()
            .ok_or_else(|| "No refresh token available".to_string())?;
        (s.api_url.clone(), token)
    };

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/auth_anon/refresh_user_session", api_url))
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let res = res.error_for_status().map_err(|e| e.to_string())?;
    let auth: AuthResponse = res.json().await.map_err(|e| e.to_string())?;

    apply_auth_response(app, state, auth)
}

/// `loud = true` surfaces "Refreshing..." / "Session refreshed" toasts in the topbar
/// and clears the toast on error. Use for user-initiated refreshes. `loud = false`
/// runs silently — use for background polling.
#[tauri::command]
pub async fn refresh_user_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    loud: bool,
) -> Result<AppStatePayload, String> {
    if loud {
        let payload = {
            let mut s = state.lock().map_err(|e| e.to_string())?;
            s.info_text = Some("Refreshing your session...".to_string());
            s.to_payload()
        };
        app.emit("app-state-changed", payload)
            .map_err(|e| e.to_string())?;
    }

    let auth = match fetch_refreshed_session(&state).await {
        Ok(a) => a,
        Err(e) => {
            if loud {
                clear_info_text(&app, &state);
            }
            return Err(e);
        }
    };

    // Set the success toast BEFORE apply_auth_response so it's part of the same emit.
    if loud {
        if let Ok(mut s) = state.lock() {
            s.info_text = Some("Session refreshed".to_string());
        }
    }

    apply_auth_response(&app, &state, auth)
}

async fn fetch_refreshed_session(
    state: &tauri::State<'_, Mutex<AppState>>,
) -> Result<AuthResponse, String> {
    let (api_url, access_token) = {
        let s = state.lock().map_err(|e| e.to_string())?;
        let token = s
            .access_token
            .clone()
            .ok_or_else(|| "Not authenticated".to_string())?;
        (s.api_url.clone(), token)
    };

    let client = reqwest::Client::new();
    let res = client
        .get(format!("{}/auth/refresh_user_session", api_url))
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let res = res.error_for_status().map_err(|e| e.to_string())?;
    res.json::<AuthResponse>().await.map_err(|e| e.to_string())
}

fn clear_info_text(app: &tauri::AppHandle, state: &tauri::State<'_, Mutex<AppState>>) {
    let payload = match state.lock() {
        Ok(mut s) => {
            s.info_text = None;
            s.to_payload()
        }
        Err(_) => return,
    };
    let _ = app.emit("app-state-changed", payload);
}
