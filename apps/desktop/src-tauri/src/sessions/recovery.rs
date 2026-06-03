use std::sync::{Arc, Mutex};

use crate::http::authed_request;
use crate::models::structs::app_state::{LogLevel, ProtectedState};
use crate::models::structs::{
    AppState, AppStatePayload, EncryptedFileRecord, InitiateEndSessionResponse,
    ReportFileStatusRequest, SessionStartUpdateRequest,
};
use crate::sessions::buffer_sweep;
use crate::sessions::endpoints::{report_file_with_retry, AesKeyMaterial, DeletionAction, DeletionRetrySignal, MAX_CONCURRENT_FILES};
use crate::sessions::helpers::{
    decrypt_file_auto, encrypt_file, extract_error_detail, hex_decode, push_log,
    push_log_and_emit, secure_delete_file, update_state_and_emit,
};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use zeroize::Zeroize;

#[tauri::command]
pub async fn recover_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    retry_signal: tauri::State<'_, DeletionRetrySignal>,
    encrypt: bool,
) -> Result<AppStatePayload, String> {
    let session_id = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.session_id.clone().ok_or("No active session ID for recovery")?
    };

    let (initial_state, initial_log) = if encrypt {
        (ProtectedState::InProcess, "Recovery: completing encryption")
    } else {
        (ProtectedState::Ending, "Recovery: decrypting and restoring files")
    };

    update_state_and_emit(&app, &*state, |s| {
        s.protected_state = initial_state;
        s.session_files_processed = 0;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, initial_log.into())?;

    let initiate_resp = authed_request(&app, &state, |api_url, token, client| {
        client
            .post(format!("{}/sessions/initiate_end_session", api_url))
            .bearer_auth(token)
            .json(&serde_json::json!({ "session_id": session_id }))
    })
    .await?;

    if !initiate_resp.status().is_success() {
        let detail = extract_error_detail(
            initiate_resp,
            "Failed to retrieve session data for recovery.",
        )
        .await;
        push_log(&*state, LogLevel::Error, format!("Recovery API failed: {}", detail));
        update_state_and_emit(&app, &*state, |s| {
            s.protected_state = ProtectedState::Active;
            s.info_text = Some(detail.clone());
        })?;
        return Err(detail);
    }

    let end_session_data: InitiateEndSessionResponse = initiate_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse recovery response: {}", e))?;

    let mut key_array: [u8; 32] = hex_decode(&end_session_data.aes_key)?
        .as_slice()
        .try_into()
        .map_err(|_| "AES key must be exactly 32 bytes".to_string())?;
    let key = Arc::new(AesKeyMaterial(key_array));
    key_array.zeroize();

    if encrypt {
        recover_encrypt(app, state, retry_signal, session_id, end_session_data, key).await
    } else {
        recover_decrypt(app, state, session_id, end_session_data, key).await
    }
}

async fn recover_encrypt(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    retry_signal: tauri::State<'_, DeletionRetrySignal>,
    session_id: String,
    end_session_data: InitiateEndSessionResponse,
    key: Arc<AesKeyMaterial>,
) -> Result<AppStatePayload, String> {
    let already_encrypted: std::collections::HashSet<String> = end_session_data
        .files
        .iter()
        .filter(|f| f.status.as_deref() == Some("encrypted"))
        .filter(|f| {
            std::path::Path::new(&f.original_path)
                .parent()
                .map(|dir| dir.join(&f.encrypted_filename).exists())
                .unwrap_or(false)
        })
        .map(|f| f.original_path.clone())
        .collect();

    let known_encrypted_filenames: std::collections::HashSet<String> = end_session_data
        .files
        .iter()
        .filter(|f| f.status.as_deref() == Some("encrypted"))
        .filter(|f| {
            std::path::Path::new(&f.original_path)
                .parent()
                .map(|dir| dir.join(&f.encrypted_filename).exists())
                .unwrap_or(false)
        })
        .map(|f| f.encrypted_filename.clone())
        .collect();

    let remaining_paths: Vec<String> = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.protected_paths
            .iter()
            .filter(|p| !already_encrypted.contains(&p.path))
            .map(|p| p.path.clone())
            .collect()
    };

    {
        let all_dirs: std::collections::HashSet<&std::path::Path> = remaining_paths
            .iter()
            .filter_map(|p| std::path::Path::new(p).parent())
            .collect();

        for dir in all_dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("annex") {
                        let fname = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if !known_encrypted_filenames.contains(&fname) {
                            push_log(&*state, LogLevel::Info, format!("Recovery: removing orphaned encrypted file: {}", fname));
                            let orphan_path = path.clone();
                            let _ = tokio::task::spawn_blocking(move || {
                                secure_delete_file(&orphan_path)
                            }).await;
                        }
                    }
                }
            }
        }
    }

    if remaining_paths.is_empty() {
        push_log_and_emit(&app, &*state, LogLevel::Info, "Recovery: no remaining files to encrypt".into())?;
    } else {
        push_log_and_emit(
            &app,
            &*state,
            LogLevel::Info,
            format!("Recovery: encrypting {} remaining file(s)", remaining_paths.len()),
        )?;

        let file_sizes: std::collections::HashMap<String, u64> = {
            let s = state.lock().map_err(|e| e.to_string())?;
            s.protected_paths.iter().map(|p| (p.path.clone(), p.file_size)).collect()
        };

        let actual_start = std::time::Instant::now();

        let mut join_set = JoinSet::new();
        let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_FILES));

        for path in remaining_paths {
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

        let mut files_processed: u64 = 0;

        while let Some(result) = join_set.join_next().await {
            let (record, _file_size) = result
                .map_err(|e| format!("Encryption task failed: {}", e))?
                .map_err(|e: String| e)?;

            report_file_with_retry(&app, &state, &ReportFileStatusRequest {
                session_id: session_id.clone(),
                original_path: record.original_path.clone(),
                encrypted_filename: record.encrypted_filename.clone(),
                checksum_sha256: record.checksum_sha256.clone(),
                format_version: record.format_version,
                status: "encrypted".to_string(),
            }).await;

            files_processed += 1;

            update_state_and_emit(&app, &*state, |s| {
                s.session_files_processed = files_processed;
            })?;
        }

        let actual_time_ms = actual_start.elapsed().as_millis() as u64;

        push_log_and_emit(
            &app,
            &*state,
            LogLevel::Info,
            format!("Recovery: {} file(s) encrypted in {}ms", files_processed, actual_time_ms),
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
    }

    drop(key);

    let all_original_paths: Vec<String> = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.protected_paths.iter().map(|p| p.path.clone()).collect()
    };

    let sweep_targets = buffer_sweep::collect_sweep_targets(&all_original_paths);
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

    push_log_and_emit(&app, &*state, LogLevel::Info, "Securely deleting original files".into())?;

    let mut del_set = JoinSet::new();
    for original_path in &all_original_paths {
        let path = original_path.clone();
        if !std::path::Path::new(&path).exists() {
            continue;
        }
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

    let payload = update_state_and_emit(&app, &*state, |s| {
        s.protected_state = ProtectedState::Active;
        s.mid_process = false;
        s.deletion_blocked_file = None;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, "Recovery complete, session is now active".into())?;

    Ok(payload)
}

async fn recover_decrypt(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    session_id: String,
    end_session_data: InitiateEndSessionResponse,
    key: Arc<AesKeyMaterial>,
) -> Result<AppStatePayload, String> {
    let files: Vec<EncryptedFileRecord> = end_session_data
        .files
        .into_iter()
        .filter(|f| f.status.as_deref() == Some("encrypted"))
        .collect();

    let known_annex_filenames: std::collections::HashSet<String> = files
        .iter()
        .map(|f| f.encrypted_filename.clone())
        .collect();

    let mut scan_dirs: std::collections::HashSet<std::path::PathBuf> = files
        .iter()
        .filter_map(|f| std::path::Path::new(&f.original_path).parent().map(|p| p.to_path_buf()))
        .collect();
    {
        let s = state.lock().map_err(|e| e.to_string())?;
        for pp in &s.protected_paths {
            if let Some(parent) = std::path::Path::new(&pp.path).parent() {
                scan_dirs.insert(parent.to_path_buf());
            }
        }
    }

    if files.is_empty() {
        push_log_and_emit(&app, &*state, LogLevel::Info, "Recovery: no encrypted files to restore".into())?;
    } else {
        let mut files_to_decrypt: Vec<EncryptedFileRecord> = Vec::new();
        let mut files_already_done: Vec<EncryptedFileRecord> = Vec::new();

        for record in files {
            let annex_exists = std::path::Path::new(&record.original_path)
                .parent()
                .map(|p| p.join(&record.encrypted_filename))
                .map_or(false, |p| p.exists());

            if annex_exists {
                files_to_decrypt.push(record);
            } else if std::path::Path::new(&record.original_path).exists() {
                files_already_done.push(record);
            } else {
                files_to_decrypt.push(record);
            }
        }

        let mut files_processed: u64 = 0;
        let mut failed_files: Vec<String> = Vec::new();

        if !files_already_done.is_empty() {
            push_log_and_emit(
                &app,
                &*state,
                LogLevel::Info,
                format!("Recovery: {} file(s) already fully restored", files_already_done.len()),
            )?;

            for record in &files_already_done {
                report_file_with_retry(&app, &state, &ReportFileStatusRequest {
                    session_id: session_id.clone(),
                    original_path: record.original_path.clone(),
                    encrypted_filename: record.encrypted_filename.clone(),
                    checksum_sha256: record.checksum_sha256.clone(),
                    format_version: record.format_version,
                    status: "decrypted".to_string(),
                }).await;

                files_processed += 1;
                update_state_and_emit(&app, &*state, |s| {
                    s.session_files_processed = files_processed;
                })?;
            }
        }

        if !files_to_decrypt.is_empty() {
            push_log_and_emit(
                &app,
                &*state,
                LogLevel::Info,
                format!("Recovery: decrypting {} file(s) from .annex", files_to_decrypt.len()),
            )?;

            let mut join_set = JoinSet::new();
            let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_FILES));

            for record in files_to_decrypt {
                let key = Arc::clone(&key);
                let sem = Arc::clone(&semaphore);

                join_set.spawn(async move {
                    let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                    let rec = record;
                    let result = tokio::task::spawn_blocking({
                        let original_path = rec.original_path.clone();
                        let encrypted_filename = rec.encrypted_filename.clone();
                        let checksum = rec.checksum_sha256.clone();
                        let format_version = rec.format_version;
                        let key = Arc::clone(&key);
                        move || {
                            let path = std::path::Path::new(&original_path);
                            decrypt_file_auto(
                                path,
                                &encrypted_filename,
                                &checksum,
                                &key.0,
                                format_version,
                            )
                        }
                    })
                    .await
                    .map_err(|e| format!("Decryption task panicked: {}", e))?;

                    match result {
                        Ok(()) => Ok((rec, "decrypted".to_string())),
                        Err(e) => Ok::<(EncryptedFileRecord, String), String>((rec, format!("failed:{}", e))),
                    }
                });
            }

            while let Some(result) = join_set.join_next().await {
                let (record, status_str) = result
                    .map_err(|e| format!("Decryption task failed: {}", e))??;

                let is_failed = status_str.starts_with("failed:");
                let report_status = if is_failed { "failed".to_string() } else { status_str.clone() };

                if is_failed {
                    let err_msg = status_str.strip_prefix("failed:").unwrap_or(&status_str);
                    push_log(
                        &*state,
                        LogLevel::Error,
                        format!("Failed to decrypt {}: {}", record.original_path, err_msg),
                    );
                    failed_files.push(record.original_path.clone());
                }

                report_file_with_retry(&app, &state, &ReportFileStatusRequest {
                    session_id: session_id.clone(),
                    original_path: record.original_path.clone(),
                    encrypted_filename: record.encrypted_filename.clone(),
                    checksum_sha256: record.checksum_sha256.clone(),
                    format_version: record.format_version,
                    status: report_status,
                }).await;

                files_processed += 1;
                update_state_and_emit(&app, &*state, |s| {
                    s.session_files_processed = files_processed;
                })?;
            }
        }

        if !failed_files.is_empty() {
            let detail = format!(
                "Failed to decrypt {} file(s): {}",
                failed_files.len(),
                failed_files.join(", ")
            );
            push_log(&*state, LogLevel::Error, detail.clone());
            update_state_and_emit(&app, &*state, |s| {
                s.protected_state = ProtectedState::Failed;
                s.info_text = Some(detail.clone());
            })?;
            return Err(detail);
        }

        push_log_and_emit(&app, &*state, LogLevel::Info, format!("Recovery: all {} file(s) restored", files_processed))?;
    }

    drop(key);

    let mut orphans_removed: u64 = 0;
    for dir in &scan_dirs {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("annex") {
                let filename = path.file_name().and_then(|f| f.to_str()).unwrap_or("").to_string();
                if !known_annex_filenames.contains(&filename) {
                    push_log(&*state, LogLevel::Info, format!("Removing orphaned .annex file: {}", path.display()));
                    if let Err(e) = std::fs::remove_file(&path) {
                        push_log(&*state, LogLevel::Warning, format!("Failed to remove orphaned file {}: {}", path.display(), e));
                    } else {
                        orphans_removed += 1;
                    }
                }
            }
        }
    }
    if orphans_removed > 0 {
        push_log_and_emit(
            &app,
            &*state,
            LogLevel::Info,
            format!("Recovery: removed {} orphaned .annex file(s)", orphans_removed),
        )?;
    }

    let resp = authed_request(&app, &state, |api_url, token, client| {
        client
            .post(format!("{}/sessions/end", api_url))
            .bearer_auth(token)
            .json(&serde_json::json!({ "session_id": session_id, "status": "ended" }))
    })
    .await?;

    if !resp.status().is_success() {
        let detail =
            extract_error_detail(resp, "Failed to end session. Please try again.").await;
        push_log(&*state, LogLevel::Error, format!("End session API failed: {}", detail));
        update_state_and_emit(&app, &*state, |s| {
            s.info_text = Some(detail.clone());
        })?;
        return Err(detail);
    }

    let payload = update_state_and_emit(&app, &*state, |s| {
        s.protected_state = ProtectedState::Inactive;
        s.mid_process = false;
        s.session_files_processed = 0;
        s.session_id = None;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, "Recovery complete, all files restored".into())?;

    Ok(payload)
}
