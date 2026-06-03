use std::path::Path;
use std::sync::Mutex;
use tauri::Emitter;
use time::OffsetDateTime;
use walkdir::WalkDir;

use crate::http::authed_request;
use crate::models::structs::{AppState, AppStatePayload, FileType, ProtectedPath, ScannedFile, ScanResult};

#[tauri::command]
pub async fn scan_paths(paths: Vec<String>) -> Result<ScanResult, String> {
    let mut files: Vec<ScannedFile> = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);

        if path.is_dir() {
            for entry in WalkDir::new(path)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                if entry.file_type().is_file() {
                    if let Some(scanned) = scan_single_file(entry.path()) {
                        files.push(scanned);
                    }
                }
            }
        } else if path.is_file() {
            if let Some(scanned) = scan_single_file(path) {
                files.push(scanned);
            }
        }
    }

    let total_count = files.len();
    Ok(ScanResult { files, total_count })
}

fn scan_single_file(path: &Path) -> Option<ScannedFile> {
    let metadata = std::fs::metadata(path).ok()?;
    let file_size = metadata.len();

    let file_type = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| FileType::from_extension(ext).as_str().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    Some(ScannedFile {
        path: path.to_string_lossy().to_string(),
        file_size,
        file_type,
    })
}

const BATCH_SIZE: usize = 250;

#[tauri::command]
pub async fn add_protected_paths(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    files: Vec<ScannedFile>,
) -> Result<AppStatePayload, String> {
    if files.is_empty() {
        let state = state.lock().map_err(|e| e.to_string())?;
        return Ok(state.to_payload());
    }

    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if files.len() as u64 + s.curr_file_count > s.max_file_count {
            let remaining = s.max_file_count - s.curr_file_count;
            drop(s);

            let payload = {
                let mut state = state.lock().map_err(|e| e.to_string())?;
                state.info_text = Some(format!("Not Enough Space. Files Remaining: {}", remaining));
                state.to_payload()
            };

            app.emit("app-state-changed", payload.clone())
                .map_err(|e| e.to_string())?;

            // Reset info_text so the same message can trigger a state change next time
            {
                let mut state = state.lock().map_err(|e| e.to_string())?;
                state.info_text = None;
            }

            return Err("Not Enough Space Remaining.".to_string());
        }
    }

    for batch in files.chunks(BATCH_SIZE) {
        let body: Vec<serde_json::Value> = batch
            .iter()
            .map(|f| {
                serde_json::json!({
                    "path": f.path,
                    "file_size": f.file_size,
                    "file_type": f.file_type,
                })
            })
            .collect();

        let res = authed_request(&app, &state, |api_url, token, client| {
            client
                .post(format!("{}/paths/add", api_url))
                .bearer_auth(token)
                .json(&body)
        })
        .await?;

        let res = res.error_for_status().map_err(|e| e.to_string())?;
        let response_text = res.text().await.map_err(|e| e.to_string())?;
        let server_file_count: u64 = response_text
            .trim()
            .trim_matches('"')
            .parse()
            .map_err(|e: std::num::ParseIntError| {
                format!("{e}: response was '{response_text}'")
            })?;
        {
            let mut state = state.lock().map_err(|e| e.to_string())?;
            state.curr_file_count = server_file_count;
        }
    }

    let payload = {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        let now = OffsetDateTime::now_utc();

        for file in &files {

            if state.protected_paths.iter().any(|p| p.path == file.path) {
                continue;
            }

            state.protected_paths.push(ProtectedPath {
                path: file.path.clone(),
                file_type: Some(file.file_type.clone()),
                file_size: file.file_size,
                created_at: now,
            });
        }

        state.to_payload()
    };

    app.emit("app-state-changed", payload.clone())
        .map_err(|e| e.to_string())?;

    Ok(payload)
}
