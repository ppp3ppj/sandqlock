use std::sync::Mutex;

use sqlx::SqlitePool;
use tauri::{Manager, State};
use uuid::Uuid;

/// Shared app state — holds the nudge message so the ghost webview can read it
/// after the window is created (avoids URL encoding edge cases).
pub struct GhostMessage(pub Mutex<Option<String>>);

use crate::models::{
    CategoryRow, CreateTimeEntryInput, DailySummaryRow, ProjectRow, SyncResult, SyncStatus,
    TimeEntryRow, UpdateTimeEntryInput, WeeklySummary, WeeklySummaryRow,
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
           (id, task_name, duration_seconds, date, overtime, project_id, category_id,
            sync_status, local_updated_at)
         VALUES (?,?,?,?,?,?,?,'pending_create',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .bind(&id)
    .bind(&attrs.task_name)
    .bind(attrs.duration_seconds)
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
         SET task_name=?, duration_seconds=?, date=?, overtime=?,
             project_id=?, category_id=?,
             sync_status = CASE WHEN sync_status='pending_create'
                                THEN 'pending_create' ELSE 'pending_update' END,
             local_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id=?",
    )
    .bind(&attrs.task_name)
    .bind(attrs.duration_seconds)
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
pub async fn search_time_entries(
    query: String,
    state: State<'_, SqlitePool>,
) -> Result<Vec<TimeEntryRow>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let pattern = format!("%{}%", query.to_lowercase());
    sqlx::query_as(
        "SELECT * FROM time_entries
         WHERE LOWER(task_name) LIKE ?
           AND sync_status != 'pending_delete'
         ORDER BY date DESC, COALESCE(inserted_at, local_updated_at) ASC
         LIMIT 100",
    )
    .bind(&pattern)
    .fetch_all(state.inner())
    .await
    .map_err(|e| e.to_string())
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
pub async fn get_weekly_summary(
    state: State<'_, SqlitePool>,
) -> Result<WeeklySummary, String> {
    // Week start = Monday of the current week (local time)
    let week_start: String = sqlx::query_scalar(
        "SELECT date('now', 'localtime',
           '-' || CAST((strftime('%w', 'now', 'localtime') + 6) % 7 AS TEXT) || ' days')",
    )
    .fetch_one(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Week end = Sunday (6 days after Monday)
    let week_end: String = sqlx::query_scalar(
        "SELECT date('now', 'localtime',
           '+' || CAST(6 - (strftime('%w', 'now', 'localtime') + 6) % 7 AS TEXT) || ' days')",
    )
    .fetch_one(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Group by project + category, summing duration
    let rows: Vec<WeeklySummaryRow> = sqlx::query_as(
        "SELECT
           te.project_id,
           p.name  AS project_name,
           te.category_id,
           c.name  AS category_name,
           SUM(te.duration_seconds) AS total_seconds
         FROM time_entries te
         LEFT JOIN projects   p ON te.project_id   = p.id
         LEFT JOIN categories c ON te.category_id  = c.id
         WHERE te.date >= ?
           AND te.date <= ?
           AND te.sync_status != 'pending_delete'
         GROUP BY te.project_id, te.category_id
         ORDER BY total_seconds DESC",
    )
    .bind(&week_start)
    .bind(&week_end)
    .fetch_all(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Per-day totals for the mini bar chart
    let daily: Vec<DailySummaryRow> = sqlx::query_as(
        "SELECT
           date,
           SUM(duration_seconds) AS total_seconds
         FROM time_entries
         WHERE date >= ?
           AND date <= ?
           AND sync_status != 'pending_delete'
         GROUP BY date
         ORDER BY date ASC",
    )
    .bind(&week_start)
    .bind(&week_end)
    .fetch_all(state.inner())
    .await
    .map_err(|e| e.to_string())?;

    let total_seconds: i64 = rows.iter().map(|r| r.total_seconds).sum();

    Ok(WeeklySummary { week_start, week_end, total_seconds, rows, daily })
}

// ── Tray commands ────────────────────────────────────────────────────────────

/// Called every second while the timer is running.
/// Updates the tray tooltip with the live elapsed time + task name.
#[tauri::command]
pub async fn update_tray_timer(
    app: tauri::AppHandle,
    seconds: u32,
    task: String,
) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        let h = seconds / 3600;
        let m = (seconds % 3600) / 60;
        let s = seconds % 60;
        let time_str = if h > 0 {
            format!("{:02}:{:02}:{:02}", h, m, s)
        } else {
            format!("{:02}:{:02}", m, s)
        };
        let tip = if task.is_empty() {
            format!("⏱ {}", time_str)
        } else {
            format!("⏱ {}  {}", time_str, task)
        };
        tray.set_tooltip(Some(&tip)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Called when the timer stops or is cancelled — resets tray tooltip.
#[tauri::command]
pub async fn set_tray_idle(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some("SandQlock")).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Sends a native OS notification.
#[tauri::command]
pub async fn show_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

// ── App tracker commands ──────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct AppUsageRow {
    pub app_name: String,
    pub seconds: i64,
}

/// Returns today's passive app usage sorted by time spent descending.
#[tauri::command]
pub async fn get_app_usage_today(
    state: State<'_, SqlitePool>,
) -> Result<Vec<AppUsageRow>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    sqlx::query_as::<_, AppUsageRow>(
        "SELECT app_name, seconds FROM app_tracking
         WHERE date = ? ORDER BY seconds DESC LIMIT 30",
    )
    .bind(&today)
    .fetch_all(state.inner())
    .await
    .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────────────────────────

/// Brings the main window to the front — used by the global shortcut
/// when no timer is running, so the user can start one immediately.
#[tauri::command]
pub async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

// ── Ghost Window commands ─────────────────────────────────────────────────────

/// Opens a frameless, always-on-top, skip-taskbar window with the nudge message.
/// The window can't be minimized or closed by the user — only "Got it" dismisses it.
/// Costs ~0 extra RAM because the webview is shared with the main app.
#[tauri::command]
pub async fn show_ghost_window(
    message: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Store message in state so the ghost webview can fetch it via invoke
    *app.state::<GhostMessage>().0.lock().unwrap() = Some(message);

    // Close any existing ghost window first
    if let Some(w) = app.get_webview_window("ghost") {
        let _ = w.close();
        // Brief pause so the OS removes the old window before spawning a new one
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    // Load the main app with ?ghost=1 — App.tsx detects this and renders GhostWindow
    tauri::WebviewWindowBuilder::new(
        &app,
        "ghost",
        tauri::WebviewUrl::App("?ghost=1".into()),
    )
    .title("SandQlock — Reminder")
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .decorations(false)   // no title bar, no close button
    .inner_size(340.0, 165.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Called from the ghost window's "Got it" button to close itself.
#[tauri::command]
pub async fn close_ghost_window(app: tauri::AppHandle) -> Result<(), String> {
    *app.state::<GhostMessage>().0.lock().unwrap() = None;
    if let Some(w) = app.get_webview_window("ghost") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ghost webview calls this on mount to retrieve the nudge message.
#[tauri::command]
pub fn get_ghost_message(app: tauri::AppHandle) -> Option<String> {
    app.state::<GhostMessage>().0.lock().unwrap().clone()
}

// ── Sync commands ─────────────────────────────────────────────────────────────

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
