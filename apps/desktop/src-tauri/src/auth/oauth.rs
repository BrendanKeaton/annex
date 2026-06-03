use std::collections::HashMap;
use std::sync::Mutex;

use crate::models::structs::{AppState, AuthResponse};
use super::session::apply_auth_response;
use tauri_plugin_opener::OpenerExt;

/// Tauri command: build the Supabase Google OAuth URL and open it in the system browser.
/// The user will complete the OAuth flow in their browser. When Supabase redirects back
/// to annex://auth/callback, the deep link handler in lib.rs picks it up.
#[tauri::command]
pub async fn login_with_google(app: tauri::AppHandle) -> Result<(), String> {
    let supabase_url = crate::config::supabase_url()?;
    let callback_url = crate::config::desktop_callback_url();

    let oauth_url = format!(
        "{}/auth/v1/authorize?provider=google&redirect_to={}",
        supabase_url.trim_end_matches('/'),
        callback_url
    );

    app.opener()
        .open_url(&oauth_url, None::<String>)
        .map_err(|e| e.to_string())
}

/// Called from the deep link handler in lib.rs when Supabase redirects back to
/// annex://auth/callback#access_token=...&refresh_token=...
///
/// Parses the URL fragment, exchanges the tokens with the backend, and updates app state.
pub async fn handle_oauth_deep_link(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, Mutex<AppState>>,
    url: &str,
) -> Result<(), String> {
    // The tokens are in the fragment (after #), not query params
    let fragment = url.splitn(2, '#').nth(1).unwrap_or("");

    if fragment.is_empty() {
        return Err("OAuth callback contained no token data".to_string());
    }

    let params: HashMap<String, String> = fragment
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = parts.next()?.to_string();
            Some((key, value))
        })
        .collect();

    // Surface any error from the OAuth provider before trying to read tokens
    if let Some(error) = params.get("error") {
        let description = params
            .get("error_description")
            .map(|d| d.replace('+', " ").replace("%20", " "))
            .unwrap_or_else(|| error.clone());
        return Err(description);
    }

    let access_token = params
        .get("access_token")
        .ok_or_else(|| "Missing access_token in OAuth callback".to_string())?
        .clone();

    let refresh_token = params
        .get("refresh_token")
        .ok_or_else(|| "Missing refresh_token in OAuth callback".to_string())?
        .clone();

    let api_url = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.api_url.clone()
    };

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/auth_anon/oauth/session", api_url))
        .json(&serde_json::json!({
            "access_token": access_token,
            "refresh_token": refresh_token,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let res = res.error_for_status().map_err(|e| e.to_string())?;
    let auth: AuthResponse = res.json().await.map_err(|e| e.to_string())?;

    apply_auth_response(app, state, auth).map(|_| ())
}
