use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Serialize)]
pub struct StartSessionRequest {
    pub file_count: u64,
    pub total_size_bytes: u64,
    pub estimated_time_ms: u64,
}

#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct StartSessionResponse {
    pub aes_key: String,
    pub session_id: String,
}

#[derive(Serialize)]
pub struct SessionStartUpdateRequest {
    pub actual_time_ms: u64,
    pub session_id: String,
}

#[derive(Serialize)]
pub struct ReportFileStatusRequest {
    pub session_id: String,
    pub original_path: String,
    pub encrypted_filename: String,
    pub checksum_sha256: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format_version: Option<u8>,
    pub status: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct EncryptedFileRecord {
    pub original_path: String,
    pub encrypted_filename: String,
    pub checksum_sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format_version: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Deserialize)]
pub struct InitiateEndSessionResponse {
    pub aes_key: String,
    pub files: Vec<EncryptedFileRecord>,
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SessionKey {
    pub bytes: Vec<u8>,
}

#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct PinPayload {
    pub pin: String,
}
