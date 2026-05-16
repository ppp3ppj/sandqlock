use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TimeEntryRow {
    pub id: String,
    pub task_name: String,
    pub duration_minutes: i32,
    pub date: String,
    pub overtime: bool,
    pub project_id: Option<String>,
    pub category_id: Option<String>,
    pub inserted_at: Option<String>,
    pub updated_at: Option<String>,
    pub sync_status: String,
    pub local_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub inserted_at: Option<String>,
    pub updated_at: Option<String>,
    pub sync_status: String,
    pub local_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CategoryRow {
    pub id: String,
    pub name: String,
    pub project_id: String,
    pub inserted_at: Option<String>,
    pub updated_at: Option<String>,
    pub sync_status: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTimeEntryInput {
    pub task_name: String,
    pub duration_minutes: i32,
    pub date: String,
    pub overtime: bool,
    pub project_id: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTimeEntryInput {
    pub task_name: String,
    pub duration_minutes: i32,
    pub date: String,
    pub overtime: bool,
    pub project_id: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncResult {
    pub pushed: u32,
    pub pulled: u32,
    pub errors: Vec<String>,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatus {
    pub pending_count: i64,
    pub last_sync_at: Option<String>,
    pub online: bool,
}
