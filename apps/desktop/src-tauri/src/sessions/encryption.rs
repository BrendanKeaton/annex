use std::sync::{Arc, Mutex};

use crate::http::authed_request;
use crate::models::structs::app_state::{LogLevel, ProtectedState};
use crate::models::structs::{
    AppState, AppStatePayload, EncryptedFileRecord, ReportFileStatusRequest, SessionKey,
    SessionStartUpdateRequest, StartSessionRequest, StartSessionResponse,
};
use crate::sessions::buffer_sweep;
use crate::sessions::endpoints::{report_file_with_retry, AesKeyMaterial, DeletionAction, DeletionRetrySignal, MAX_CONCURRENT_FILES};
use crate::sessions::helpers::{
    check_missing_files, collect_file_stats, encrypt_file, estimate_encryption_time_ms,
    extract_error_detail, hex_decode, push_log, push_log_and_emit, secure_delete_file,
    update_state_and_emit,
};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use zeroize::Zeroize;

#[tauri::command]
pub async fn initiate_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    retry_signal: tauri::State<'_, DeletionRetrySignal>,
) -> Result<AppStatePayload, String> {
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        if s.protected_paths.is_empty() {
            return Err("No files to protect".to_string());
        }
    }
    update_state_and_emit(&app, &*state, |s| {
        s.protected_state = ProtectedState::InProcess;
        s.session_files_processed = 0;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, "Session initiation started".into())?;

    let (file_count, total_size_bytes) = collect_file_stats(&state)?;
    let estimated_time_ms = estimate_encryption_time_ms(file_count, total_size_bytes);

    push_log_and_emit(
        &app,
        &*state,
        LogLevel::Info,
        format!(
            "Preparing {} file(s), {:.2} MB total, est. {}ms",
            file_count,
            total_size_bytes as f64 / (1024.0 * 1024.0),
            estimated_time_ms
        ),
    )?;

    let resp = authed_request(&app, &state, |api_url, token, client| {
        client
            .post(format!("{}/sessions/start", api_url))
            .bearer_auth(token)
            .json(&StartSessionRequest {
                file_count,
                total_size_bytes,
                estimated_time_ms,
            })
    })
    .await?;

    if !resp.status().is_success() {
        let detail =
            extract_error_detail(resp, "Failed to start session. Please try again.").await;
        push_log(&*state, LogLevel::Error, format!("Session start API failed: {}", detail));
        update_state_and_emit(&app, &*state, |s| {
            s.protected_state = ProtectedState::Inactive;
            s.session_files_processed = 0;
            s.info_text = Some(detail.clone());
        })?;
        return Err(detail);
    }

    let mut session_resp: StartSessionResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse session response: {}", e))?;

    let mut decoded_key = hex_decode(&session_resp.aes_key)?;
    let session_key = SessionKey {
        bytes: std::mem::take(&mut *decoded_key),
    };
    drop(decoded_key);
    let session_id = std::mem::take(&mut session_resp.session_id);
    drop(session_resp);

    let actual_start = std::time::Instant::now();

    let paths: Vec<String> = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.protected_paths.iter().map(|p| p.path.clone()).collect()
    };

    if let Some(detail) = check_missing_files(&paths) {
        push_log(&*state, LogLevel::Warning, format!("Missing files detected: {}", detail));
        update_state_and_emit(&app, &*state, |s| {
            s.protected_state = ProtectedState::Inactive;
            s.session_files_processed = 0;
            s.info_text = Some(detail.clone());
        })?;

        let resp = authed_request(&app, &state, |api_url, token, client| {
            client
                .post(format!("{}/sessions/end", api_url))
                .bearer_auth(token)
                .json(&serde_json::json!({ "session_id": session_id, "status": "aborted" }))
        })
        .await?;

        if !resp.status().is_success() {
            let abort_detail =
                extract_error_detail(resp, "Failed to end session. Please try again.").await;
            update_state_and_emit(&app, &*state, |s| {
                s.info_text = Some(abort_detail.clone());
            })?;
            return Err(abort_detail);
        }

        return Err(detail);
    }

    let mut key_array: [u8; 32] = session_key
        .bytes
        .as_slice()
        .try_into()
        .map_err(|_| "AES key must be exactly 32 bytes".to_string())?;
    drop(session_key);
    let key = Arc::new(AesKeyMaterial(key_array));
    key_array.zeroize();

    push_log_and_emit(&app, &*state, LogLevel::Info, "Session key received, starting encryption".into())?;

    let file_sizes: std::collections::HashMap<String, u64> = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.protected_paths.iter().map(|p| (p.path.clone(), p.file_size)).collect()
    };

    let mut paths = paths;
    paths.sort_by(|a, b| {
        let size_a = file_sizes.get(a).copied().unwrap_or(0);
        let size_b = file_sizes.get(b).copied().unwrap_or(0);
        size_b.cmp(&size_a)
    });

    let mut join_set = JoinSet::new();
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_FILES));

    for path in paths {
        let key = Arc::clone(&key);
        let sem = Arc::clone(&semaphore);
        let file_size = file_sizes.get(&path).copied().unwrap_or(0);

        join_set.spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
            tokio::task::spawn_blocking(move || {
                let source = std::path::Path::new(&path);
                let (encrypted_path, checksum, format_version) = encrypt_file(source, &key.0)?;
                let encrypted_filename = encrypted_path
                    .file_name()
                    .ok_or_else(|| "Missing encrypted filename".to_string())?
                    .to_string_lossy()
                    .to_string();
                Ok::<(EncryptedFileRecord, u64), String>((EncryptedFileRecord {
                    original_path: path,
                    encrypted_filename,
                    checksum_sha256: checksum,
                    format_version,
                    status: None,
                }, file_size))
            })
            .await
            .map_err(|e| format!("Encryption task panicked: {}", e))?
        });
    }

    let mut encrypted_files: Vec<EncryptedFileRecord> = Vec::new();
    let mut unreported_files: Vec<EncryptedFileRecord> = Vec::new();
    let mut files_processed: u64 = 0;

    while let Some(result) = join_set.join_next().await {
        let (record, _file_size) = result
            .map_err(|e| format!("Encryption task failed: {}", e))?
            .map_err(|e: String| e)?;

        let reported = report_file_with_retry(&app, &state, &ReportFileStatusRequest {
            session_id: session_id.clone(),
            original_path: record.original_path.clone(),
            encrypted_filename: record.encrypted_filename.clone(),
            checksum_sha256: record.checksum_sha256.clone(),
            format_version: record.format_version,
            status: "encrypted".to_string(),
        }).await;

        if reported {
            encrypted_files.push(record);
        } else {
            unreported_files.push(record);
        }
        files_processed += 1;

        update_state_and_emit(&app, &*state, |s| {
            s.session_files_processed = files_processed;
        })?;
    }

    drop(key);

    let actual_time_ms = actual_start.elapsed().as_millis() as u64;

    if !unreported_files.is_empty() {
        let unreported_count = unreported_files.len();
        let total_count = encrypted_files.len() + unreported_count;
        let msg = format!(
            "Network error: failed to report {} of {} file(s) to server after multiple retries. All files have been restored to their original state. Please check your connection and try again.",
            unreported_count, total_count
        );
        push_log_and_emit(&app, &*state, LogLevel::Error, msg.clone())?;

        let all_records = encrypted_files.iter().chain(unreported_files.iter());
        for record in all_records {
            let encrypted_path = std::path::Path::new(&record.original_path)
                .parent()
                .map(|p| p.join(&record.encrypted_filename));
            if let Some(enc_path) = encrypted_path {
                if let Err(e) = std::fs::remove_file(&enc_path) {
                    push_log(
                        &*state,
                        LogLevel::Warning,
                        format!("Failed to clean up encrypted file {}: {}", enc_path.display(), e),
                    );
                }
            }
        }

        update_state_and_emit(&app, &*state, |s| {
            s.protected_state = ProtectedState::Failed;
            s.session_files_processed = 0;
            s.info_text = Some(msg.clone());
        })?;

        let _ = authed_request(&app, &state, |api_url, token, client| {
            client
                .post(format!("{}/sessions/end", api_url))
                .bearer_auth(token)
                .json(&serde_json::json!({ "session_id": session_id, "status": "failed" }))
        })
        .await;

        return Err(msg);
    }

    push_log_and_emit(
        &app,
        &*state,
        LogLevel::Info,
        format!("All {} file(s) encrypted and reported in {}ms", files_processed, actual_time_ms),
    )?;

    let update_resp = authed_request(&app, &state, |api_url, token, client| {
        client
            .post(format!("{}/sessions/session_start_update", api_url))
            .bearer_auth(token)
            .json(&SessionStartUpdateRequest {
                actual_time_ms,
                session_id: session_id.clone(),
            })
    })
    .await?;

    if !update_resp.status().is_success() {
        let detail = extract_error_detail(
            update_resp,
            "Internal server or database error, contact support if issue persists.",
        )
        .await;
        push_log(&*state, LogLevel::Error, format!("Session update API failed: {}", detail));
        update_state_and_emit(&app, &*state, |s| {
            s.protected_state = ProtectedState::Failed;
            s.session_files_processed = 0;
            s.info_text = Some(detail.clone());
        })?;
        return Err(detail);
    }

    let sweep_targets = buffer_sweep::collect_sweep_targets(
        &encrypted_files.iter().map(|r| r.original_path.clone()).collect::<Vec<_>>(),
    );
    let sweep_count = sweep_targets.len();
    if sweep_count > 0 {
        push_log_and_emit(
            &app,
            &*state,
            LogLevel::Info,
            format!("Buffer sweep: found {} editor artifact(s) to clean", sweep_count),
        )?;
    }
    for target in &sweep_targets {
        let target_path = target.clone();
        let display_path = target_path.display().to_string();
        let result = tokio::task::spawn_blocking(move || {
            secure_delete_file(&target_path)
        })
        .await;
        match result {
            Ok(Ok(())) => {
                push_log(&*state, LogLevel::Info, format!("Swept artifact: {}", display_path));
            }
            _ => {
                push_log(&*state, LogLevel::Warning, format!("Failed to sweep: {}", display_path));
            }
        }
    }

    let history_warnings = buffer_sweep::detect_history_exposure(
        &encrypted_files.iter().map(|r| r.original_path.clone()).collect::<Vec<_>>(),
    );

    push_log_and_emit(&app, &*state, LogLevel::Info, "Securely deleting original files".into())?;

    let mut del_set = JoinSet::new();
    for record in &encrypted_files {
        let path = record.original_path.clone();
        let file_name = std::path::Path::new(&path)
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or(&path)
            .to_string();
        del_set.spawn(tokio::task::spawn_blocking(move || {
            let result = secure_delete_file(std::path::Path::new(&path));
            (path, file_name, result)
        }));
    }

    let mut blocked_files: Vec<(String, String)> = Vec::new();
    while let Some(join_result) = del_set.join_next().await {
        let (path, file_name, result) = join_result
            .map_err(|e| format!("Secure deletion task failed: {}", e))?
            .map_err(|e| format!("Secure deletion task failed: {}", e))?;
        if let Err(_) = result {
            blocked_files.push((path, file_name));
        }
    }

    for (original_path, file_name) in &blocked_files {
        loop {
            let path = original_path.clone();
            let result = tokio::task::spawn_blocking(move || {
                secure_delete_file(std::path::Path::new(&path))
            })
            .await
            .map_err(|e| format!("Secure deletion task failed: {}", e))?;

            match result {
                Ok(()) => {
                    break;
                }
                Err(e) => {
                    push_log(&*state, LogLevel::Warning, format!("Deletion blocked for \"{}\": {}", file_name, e));
                    update_state_and_emit(&app, &*state, |s| {
                        s.protected_state = ProtectedState::DeletionBlocked;
                        s.info_text = Some(e.clone());
                        s.deletion_blocked_file = Some(file_name.clone());
                    })?;

                    retry_signal.notify.notified().await;
                    let action = retry_signal.take_action();

                    update_state_and_emit(&app, &*state, |s| {
                        s.protected_state = ProtectedState::InProcess;
                        s.info_text = None;
                        s.deletion_blocked_file = None;
                    })?;

                    if let DeletionAction::Skip = action {
                        push_log(
                            &*state,
                            LogLevel::Warning,
                            format!(
                                "User skipped secure deletion for \"{}\". Original file remains on disk and is NOT protected from local AI agents.",
                                file_name
                            ),
                        );
                        break;
                    }
                }
            }
        }
    }

    for warning in &history_warnings {
        push_log(&*state, LogLevel::Warning, warning.clone());
    }

    let payload = update_state_and_emit(&app, &*state, |s| {
        s.protected_state = ProtectedState::Active;
        s.session_id = Some(session_id);
        s.deletion_blocked_file = None;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, "Session is now active".into())?;

    if !history_warnings.is_empty() {
        let warning_text = history_warnings.join("\n");
        update_state_and_emit(&app, &*state, |s| {
            s.info_text = Some(warning_text);
        })?;
    }

    Ok(payload)
}
