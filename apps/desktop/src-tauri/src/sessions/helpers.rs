use crate::models::structs::AppState;
use std::path::Path;
use std::sync::Mutex;

// Re-export from focused modules for backward compatibility with endpoints
pub use super::crypto::{decrypt_file_auto, encrypt_file, hex_decode};
pub use super::secure_delete::secure_delete_file;
pub use super::state::{push_log, push_log_and_emit, update_state_and_emit};

pub async fn extract_error_detail(resp: reqwest::Response, default_msg: &str) -> String {
    let body = resp.text().await.unwrap_or_default();
    serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["detail"].as_str().map(String::from))
        .unwrap_or_else(|| default_msg.to_string())
}

pub fn check_missing_files(paths: &[String]) -> Option<String> {
    let missing_names: Vec<&str> = paths
        .iter()
        .filter(|p| !Path::new(p.as_str()).exists())
        .map(|p| {
            Path::new(p.as_str())
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or(p.as_str())
        })
        .collect();

    if missing_names.is_empty() {
        None
    } else {
        Some(format!(
            "The following file(s) no longer exist and should be removed in the Files tab: {}",
            missing_names.join(", ")
        ))
    }
}

pub fn collect_file_stats(state: &tauri::State<'_, Mutex<AppState>>) -> Result<(u64, u64), String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    let file_count = s.protected_paths.len() as u64;
    let total_size_bytes: u64 = s.protected_paths.iter().map(|p| p.file_size).sum();
    Ok((file_count, total_size_bytes))
}

pub fn estimate_encryption_time_ms(file_count: u64, total_size_bytes: u64) -> u64 {
    const IO_BYTES_PER_MS: f64 = 200_000.0; // ~200 MB/s effective (read + write combined)
    const AES_BYTES_PER_MS: f64 = 800_000.0; // ~800 MB/s AES with streaming overhead
    const HASH_BYTES_PER_MS: f64 = 600_000.0; // ~600 MB/s SHA-256
    const DELETION_BYTES_PER_MS: f64 = 150_000.0; // ~150 MB/s (random overwrite + fsync)
    const PER_FILE_OVERHEAD_MS: f64 = 50.0; // nonce gen, file create, metadata ops

    let size = total_size_bytes as f64;

    let io_ms = (size * 2.5) / IO_BYTES_PER_MS; // read + write + overhead margin
    let enc_ms = size / AES_BYTES_PER_MS;
    let hash_ms = size / HASH_BYTES_PER_MS;
    let deletion_ms = size / DELETION_BYTES_PER_MS;
    let overhead_ms = file_count as f64 * PER_FILE_OVERHEAD_MS;

    // Apply 1.5x safety multiplier since concurrent I/O adds contention
    ((io_ms + enc_ms + hash_ms + deletion_ms + overhead_ms) * 1.5).ceil() as u64
}
