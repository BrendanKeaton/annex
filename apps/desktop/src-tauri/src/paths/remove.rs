use std::sync::Mutex;
use tauri::Emitter;

use crate::http::authed_request;
use crate::models::structs::{AppState, AppStatePayload};

#[tauri::command]
pub async fn delete_protected_path(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    path: String,
) -> Result<AppStatePayload, String> {
    let path_body = serde_json::json!({ "path": path });
    let res = authed_request(&app, &state, |api_url, token, client| {
        client
            .delete(format!("{}/paths/remove", api_url))
            .bearer_auth(token)
            .json(&path_body)
    })
    .await?;

    let status = res.status();
    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(err) = body.get("err") {
        return Err(err.as_str().unwrap_or("Unknown error").to_string());
    }

    if !status.is_success() {
        return Err(format!("Request failed with status: {}", status));
    }

    let payload = {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.protected_paths.retain(|p| p.path != path);
        state.curr_file_count = state.protected_paths.len() as u64;
        state.to_payload()
    };

    app.emit("app-state-changed", payload.clone())
        .map_err(|e| e.to_string())?;

    Ok(payload)
}
