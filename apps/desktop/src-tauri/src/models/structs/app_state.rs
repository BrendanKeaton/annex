use crate::models::structs::user_session::{ProtectedPath, SessionHistory};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProtectedState {
    Active,
    Inactive,
    InProcess,
    Ending,
    Failed,
    DeletionBlocked,
}

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Info,
    Warning,
    Error,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub level: LogLevel,
    pub message: String,
    pub timestamp: String,
}

pub struct AppState {
    pub api_url: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub token_expires_at: Option<u64>,
    pub user_id: Option<String>,
    pub user_email: Option<String>,
    pub org_name: Option<String>,
    pub logo_path: Option<String>,
    pub daily_session_count: Option<u64>,
    pub protected_state: ProtectedState,
    pub protected_paths: Vec<ProtectedPath>,
    pub usage: f64,
    pub curr_file_count: u64,
    pub max_file_count: u64,
    pub info_text: Option<String>,
    pub session_history: Vec<SessionHistory>,
    pub session_files_processed: u64,
    pub session_id: Option<String>,
    pub deletion_blocked_file: Option<String>,
    pub logs: Vec<LogEntry>,
    pub mid_process: bool,
    pub subscription_level: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            api_url: crate::config::api_url(),
            access_token: None,
            refresh_token: None,
            token_expires_at: None,
            user_id: None,
            user_email: None,
            org_name: None,
            logo_path: None,
            daily_session_count: None,
            protected_state: ProtectedState::Inactive,
            protected_paths: Vec::new(),
            usage: 0.0,
            curr_file_count: 0,
            max_file_count: 0,
            info_text: None,
            session_history: Vec::new(),
            session_files_processed: 0,
            session_id: None,
            deletion_blocked_file: None,
            logs: Vec::new(),
            mid_process: false,
            subscription_level: "free".to_string(),
        }
    }
}
// Dont include tokens (keep in rust)
#[derive(Clone, Serialize)]
pub struct AppStatePayload {
    pub user_id: Option<String>,
    pub user_email: Option<String>,
    pub org_name: Option<String>,
    pub logo_path: Option<String>,
    pub protected_state: ProtectedState,
    pub protected_paths: Vec<ProtectedPath>,
    pub usage: f64,
    pub is_authenticated: bool,
    pub curr_file_count: u64,
    pub max_file_count: u64,
    pub info_text: Option<String>,
    pub session_history: Vec<SessionHistory>,
    pub session_files_processed: u64,
    pub deletion_blocked_file: Option<String>,
    pub logs: Vec<LogEntry>,
    pub mid_process: bool,
    pub subscription_level: String,
}

impl AppState {
    pub fn to_payload(&self) -> AppStatePayload {
        AppStatePayload {
            user_id: self.user_id.clone(),
            user_email: self.user_email.clone(),
            org_name: self.org_name.clone(),
            logo_path: self.logo_path.clone(),
            protected_state: self.protected_state.clone(),
            protected_paths: self.protected_paths.clone(),
            usage: self.usage,
            is_authenticated: self.access_token.is_some(),
            curr_file_count: self.curr_file_count,
            max_file_count: self.max_file_count,
            info_text: self.info_text.clone(),
            session_history: self.session_history.clone(),
            session_files_processed: self.session_files_processed,
            deletion_blocked_file: self.deletion_blocked_file.clone(),
            logs: self.logs.clone(),
            mid_process: self.mid_process,
            subscription_level: self.subscription_level.clone(),
        }
    }
}
