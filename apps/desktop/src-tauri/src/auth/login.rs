use std::sync::Mutex;
use crate::models::structs::{AppState, AppStatePayload, AuthResponse};
use super::session::apply_auth_response;

#[tauri::command]
pub async fn login(app: tauri::AppHandle, state: tauri::State<'_, Mutex<AppState>>, email: String, password: String) -> Result<AppStatePayload, String> {
    let api_url = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.api_url.clone()
    };

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/auth_anon/login", api_url))
        .json(&serde_json::json!({
            "email": email,
            "password": password,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let res = res.error_for_status().map_err(|e| e.to_string())?;
    let auth: AuthResponse = res.json().await.map_err(|e| e.to_string())?;

    apply_auth_response(&app, &state, auth)
}
