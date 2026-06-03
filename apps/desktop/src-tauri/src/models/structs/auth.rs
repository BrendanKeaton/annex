use crate::models::structs::user_session::{ProtectedPath, SessionHistory};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub user: AuthUser,
    pub session: Session,
    pub org_name: Option<String>,
    pub usage: Option<f64>,
    pub protected_paths: Option<Vec<ProtectedPath>>,
    pub logo_path: Option<String>,
    #[serde(alias = "current_file_count")]
    pub curr_file_count: Option<u64>,
    pub max_file_count: Option<u64>,
    pub mid_process: Option<bool>,
    pub session_history: Option<Vec<SessionHistory>>,
    pub subscription_level: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
    pub daily_session_count: Option<u64>,
}
