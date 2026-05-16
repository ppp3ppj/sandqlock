use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use crate::models::{
    CategoryRow, CreateTimeEntryInput, ProjectRow, SyncResult, SyncStatus, TimeEntryRow,
    UpdateTimeEntryInput,
};
use crate::sync;

#[tauri::command]
pub async fn list_time_entries(
    date: String,
    state: State<'_, SqlitePool>,
) -> Result<Vec<TimeEntryRow>, String> {
    sqlx::query_as(
        "SELECT * FROM time_entries
         WHERE date = ? AND sync_status != 'pending_delete'
         ORDER BY COALESCE(inserted_at, local_updated_at) ASC",
    )
    .bind(&date)
    .fetch_all(state.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_time_entry(
    attrs: CreateTimeEntryInput,
    state: State<'_, SqlitePool>,
) -> Result<TimeEntryRow, String> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO time_entries
           (id, task_name, duration_minutes, date, overtime, project_id, category_id,
            sync_status, local_updated_at)
         VALUES (?,?,?,?,?,?,?,'pending_create',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .bind(&id)
    .bind(&attrs.task_name)
    .bind(attrs.duration_minutes)
    .bind(&attrs.date)
    .bind(attrs.overtime)
    .bind(&attrs.project_id)
    .bind(&attrs.category_id)
    .execute(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as("SELECT * FROM time_entries WHERE id = ?")
        .bind(&id)
        .fetch_one(state.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_time_entry(
    id: String,
    attrs: UpdateTimeEntryInput,
    state: State<'_, SqlitePool>,
) -> Result<TimeEntryRow, String> {
    // Keep pending_create status if the entry has never been synced
    sqlx::query(
        "UPDATE time_entries
         SET task_name=?, duration_minutes=?, date=?, overtime=?,
             project_id=?, category_id=?,
             sync_status = CASE WHEN sync_status='pending_create'
                                THEN 'pending_create' ELSE 'pending_update' END,
             local_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?",
    )
    .bind(&attrs.task_name)
    .bind(attrs.duration_minutes)
    .bind(&attrs.date)
    .bind(attrs.overtime)
    .bind(&attrs.project_id)
    .bind(&attrs.category_id)
    .bind(&id)
    .execute(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as("SELECT * FROM time_entries WHERE id = ?")
        .bind(&id)
        .fetch_one(state.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_time_entry(
    id: String,
    state: State<'_, SqlitePool>,
) -> Result<(), String> {
    // pending_create was never on server → delete locally immediately
    // anything else → mark for deletion so sync can DELETE on server
    sqlx::query(
        "UPDATE time_entries
         SET sync_status = CASE WHEN sync_status='pending_create'
                                THEN 'delete_local' ELSE 'pending_delete' END
         WHERE id=?",
    )
    .bind(&id)
    .execute(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM time_entries WHERE sync_status='delete_local'")
        .execute(state.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn list_projects(
    state: State<'_, SqlitePool>,
) -> Result<Vec<ProjectRow>, String> {
    sqlx::query_as("SELECT * FROM projects ORDER BY name ASC")
        .fetch_all(state.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_categories(
    project_id: String,
    state: State<'_, SqlitePool>,
) -> Result<Vec<CategoryRow>, String> {
    sqlx::query_as("SELECT * FROM categories WHERE project_id=? ORDER BY name ASC")
        .bind(&project_id)
        .fetch_all(state.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn trigger_sync(
    token: String,
    startup: bool,
    state: State<'_, SqlitePool>,
) -> Result<SyncResult, String> {
    Ok(sync::full_sync(state.inner(), &token, startup).await)
}

#[tauri::command]
pub async fn get_sync_status(
    state: State<'_, SqlitePool>,
) -> Result<SyncStatus, String> {
    let pending_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM time_entries WHERE sync_status != 'synced'",
    )
    .fetch_one(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    let last_sync_at: Option<String> =
        sqlx::query_scalar("SELECT value FROM sync_meta WHERE key='last_full_sync_at'")
            .fetch_optional(state.inner())
            .await
            .map_err(|e| e.to_string())?;

    Ok(SyncStatus { pending_count, last_sync_at, online: false })
}
