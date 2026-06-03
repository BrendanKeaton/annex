use std::sync::Mutex;

use crate::http::authed_request;
use crate::models::structs::app_state::LogLevel;
use crate::models::structs::{AppState, AppStatePayload, PinPayload, ReportFileStatusRequest};
use crate::sessions::helpers::{extract_error_detail, push_log, update_state_and_emit};
use zeroize::{Zeroize, ZeroizeOnDrop};

pub const MAX_CONCURRENT_FILES: usize = 4;

#[derive(Clone, Copy)]
pub enum DeletionAction {
    Retry,
    Skip,
}

pub struct DeletionRetrySignal {
    pub notify: tokio::sync::Notify,
    pub action: std::sync::Mutex<DeletionAction>,
}

impl DeletionRetrySignal {
    pub fn new() -> Self {
        Self {
            notify: tokio::sync::Notify::new(),
            action: std::sync::Mutex::new(DeletionAction::Retry),
        }
    }

    fn set_action(&self, action: DeletionAction) {
        if let Ok(mut a) = self.action.lock() {
            *a = action;
        }
        self.notify.notify_one();
    }

    /// Read the pending action and reset to the default (Retry) for the next blocked file.
    pub fn take_action(&self) -> DeletionAction {
        match self.action.lock() {
            Ok(mut a) => std::mem::replace(&mut *a, DeletionAction::Retry),
            Err(_) => DeletionAction::Retry,
        }
    }
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct AesKeyMaterial(pub [u8; 32]);

const REPORT_MAX_RETRIES: u32 = 4;
const REPORT_INITIAL_BACKOFF_MS: u64 = 1000;

pub async fn report_file_with_retry(
    app: &tauri::AppHandle,
    state: &tauri::State<'_, Mutex<AppState>>,
    payload: &ReportFileStatusRequest,
) -> bool {
    for attempt in 0..=REPORT_MAX_RETRIES {
        if attempt > 0 {
            let backoff_ms = REPORT_INITIAL_BACKOFF_MS * 2u64.pow(attempt - 1);
            push_log(
                state,
                LogLevel::Warning,
                format!(
                    "Retrying file report (attempt {}/{}) after {}ms",
                    attempt + 1,
                    REPORT_MAX_RETRIES + 1,
                    backoff_ms,
                ),
            );
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
        }

        match authed_request(app, state, |api_url, token, client| {
            client
                .post(format!("{}/sessions/report_file", api_url))
                .bearer_auth(token)
                .json(payload)
        })
        .await
        {
            Ok(resp) if resp.status().is_success() => return true,
            Ok(resp) => {
                push_log(
                    state,
                    LogLevel::Warning,
                    format!(
                        "File report attempt {} failed (status {}): {}",
                        attempt + 1,
                        resp.status(),
                        payload.original_path
                    ),
                );
            }
            Err(e) => {
                push_log(
                    state,
                    LogLevel::Warning,
                    format!(
                        "File report attempt {} failed (network error): {}",
                        attempt + 1,
                        e
                    ),
                );
            }
        }
    }

    push_log(
        state,
        LogLevel::Error,
        format!(
            "Failed to report file after {} attempts: {}",
            REPORT_MAX_RETRIES + 1,
            payload.original_path
        ),
    );
    false
}

#[tauri::command]
pub async fn verify_pin(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    pin: String,
) -> Result<(), String> {
    let mut pin_payload = PinPayload { pin };

    let pin_resp = authed_request(&app, &state, |api_url, token, client| {
        client
            .post(format!("{}/auth/pin", api_url))
            .bearer_auth(token)
            .json(&serde_json::json!({ "pin": pin_payload.pin }))
    })
    .await?;

    pin_payload.pin.zeroize();
    drop(pin_payload);

    if !pin_resp.status().is_success() {
        return Err(extract_error_detail(pin_resp, "Invalid PIN. Please try again.").await);
    }

    Ok(())
}

#[tauri::command]
pub async fn retry_secure_deletion(
    retry_signal: tauri::State<'_, DeletionRetrySignal>,
) -> Result<(), String> {
    retry_signal.set_action(DeletionAction::Retry);
    Ok(())
}

#[tauri::command]
pub async fn skip_secure_deletion(
    retry_signal: tauri::State<'_, DeletionRetrySignal>,
) -> Result<(), String> {
    retry_signal.set_action(DeletionAction::Skip);
    Ok(())
}

#[tauri::command]
pub async fn clear_logs(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<AppStatePayload, String> {
    update_state_and_emit(&app, &*state, |s| {
        s.logs.clear();
    })
}
