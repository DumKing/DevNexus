use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use chrono::Utc;
use serde::Serialize;
use tauri::Emitter;
use uuid::Uuid;

const MAX_LOGS: usize = 1000;
const EVENT_NAME: &str = "dev-log://entry";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevLogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub scope: String,
    pub message: String,
    pub details: Option<String>,
}

static LOGS: OnceLock<Mutex<VecDeque<DevLogEntry>>> = OnceLock::new();

fn logs() -> &'static Mutex<VecDeque<DevLogEntry>> {
    LOGS.get_or_init(|| Mutex::new(VecDeque::with_capacity(MAX_LOGS)))
}

pub fn record(
    app_handle: &tauri::AppHandle,
    level: impl Into<String>,
    scope: impl Into<String>,
    message: impl Into<String>,
    details: Option<String>,
) {
    let entry = DevLogEntry {
        id: Uuid::new_v4().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        level: level.into(),
        scope: scope.into(),
        message: message.into(),
        details,
    };

    if let Ok(mut buffer) = logs().lock() {
        buffer.push_back(entry.clone());
        while buffer.len() > MAX_LOGS {
            buffer.pop_front();
        }
    }

    let _ = app_handle.emit(EVENT_NAME, entry);
}

#[tauri::command]
pub fn cmd_dev_log_list() -> Vec<DevLogEntry> {
    logs()
        .lock()
        .map(|buffer| buffer.iter().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn cmd_dev_log_clear() {
    if let Ok(mut buffer) = logs().lock() {
        buffer.clear();
    }
}
