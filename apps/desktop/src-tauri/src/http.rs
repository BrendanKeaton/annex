use std::sync::{Mutex, OnceLock};
use crate::auth::session::anon_refresh;
use crate::models::structs::AppState;

pub fn shared_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

/// Makes an authenticated HTTP request. If the response is 401 (Unauthorized),
/// automatically refreshes the session using the refresh token and retries once.
///
/// `build_request` is called with (api_url, access_token, client) and must return a
/// ready-to-send `reqwest::RequestBuilder`.
pub async fn authed_request(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, Mutex<AppState>>,
    build_request: impl Fn(&str, &str, &reqwest::Client) -> reqwest::RequestBuilder,
) -> Result<reqwest::Response, String> {
    let (api_url, access_token) = extract_credentials(state)?;
    let client = shared_client();

    let client_resp = build_request(&api_url, &access_token, client)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if client_resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        // Token expired — try refreshing via anon endpoint
        anon_refresh(app, state).await?;

        // Get the new access token
        let (api_url, new_token) = extract_credentials(state)?;

        let retry_resp = build_request(&api_url, &new_token, client)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        return Ok(retry_resp);
    }

    Ok(client_resp)
}

fn extract_credentials(
    state: &tauri::State<'_, Mutex<AppState>>,
) -> Result<(String, String), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let token = s.access_token.clone()
        .ok_or_else(|| "Not authenticated".to_string())?;
    Ok((s.api_url.clone(), token))
}
