use std::sync::{Arc, Mutex};

use crate::http::authed_request;
use crate::models::structs::app_state::{LogLevel, ProtectedState};
use crate::models::structs::{
    AppState, AppStatePayload, EncryptedFileRecord, InitiateEndSessionResponse,
    ReportFileStatusRequest,
};
use crate::sessions::endpoints::{report_file_with_retry, AesKeyMaterial, MAX_CONCURRENT_FILES};
use crate::sessions::helpers::{
    decrypt_file_auto, extract_error_detail, hex_decode, push_log, push_log_and_emit,
    update_state_and_emit,
};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use zeroize::Zeroize;

#[tauri::command]
pub async fn decrypt_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<AppStatePayload, String> {
    let session_id = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.session_id.clone().ok_or("No active session ID")?
    };

    update_state_and_emit(&app, &*state, |s| {
        s.protected_state = ProtectedState::Ending;
        s.session_files_processed = 0;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, "Ending session, requesting decryption key".into())?;

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
            "Failed to initiate session end. Please try again.",
        )
        .await;
        push_log(&*state, LogLevel::Error, format!("End session API failed: {}", detail));
        update_state_and_emit(&app, &*state, |s| {
            s.protected_state = ProtectedState::Active;
            s.session_files_processed = 0;
            s.info_text = Some(detail.clone());
        })?;
        return Err(detail);
    }

    let end_session_data: InitiateEndSessionResponse = initiate_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse initiate_end_session response: {}", e))?;

    let mut key_array: [u8; 32] = hex_decode(&end_session_data.aes_key)?
        .as_slice()
        .try_into()
        .map_err(|_| "AES key must be exactly 32 bytes".to_string())?;
    let key = Arc::new(AesKeyMaterial(key_array));
    key_array.zeroize();

    let files: Vec<EncryptedFileRecord> = end_session_data
        .files
        .into_iter()
        .filter(|f| f.status.as_deref() == Some("encrypted"))
        .collect();

    push_log_and_emit(
        &app,
        &*state,
        LogLevel::Info,
        format!("Decryption key received, decrypting {} file(s)", files.len()),
    )?;

    let mut join_set = JoinSet::new();
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_FILES));

    for record in files {
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

    let mut files_processed: u64 = 0;
    let mut failed_files: Vec<String> = Vec::new();

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

    drop(key);

    push_log_and_emit(&app, &*state, LogLevel::Info, format!("All {} file(s) decrypted", files_processed))?;

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
        s.session_files_processed = 0;
        s.session_id = None;
    })?;

    push_log_and_emit(&app, &*state, LogLevel::Info, "Session ended, all files restored".into())?;

    Ok(payload)
}
