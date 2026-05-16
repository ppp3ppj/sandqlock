use std::collections::HashSet;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::models::{SyncResult, TimeEntryRow};

const BASE_URL: &str = "http://localhost:4000";

// ── JSON:API response shapes ────────────────────────────────────────────────

#[derive(Deserialize)]
struct JsonApiList<T> {
    data: Vec<JsonApiItem<T>>,
}

#[derive(Deserialize)]
struct JsonApiOne<T> {
    data: JsonApiItem<T>,
}

#[derive(Deserialize)]
struct JsonApiItem<T> {
    id: String,
    attributes: T,
}

#[derive(Deserialize)]
struct TimeEntryAttrs {
    task_name: String,
    duration_minutes: i32,
    date: String,
    overtime: Option<bool>,
    project_id: Option<String>,
    category_id: Option<String>,
    updated_at: Option<String>,
    inserted_at: Option<String>,
}

#[derive(Deserialize)]
struct ProjectAttrs {
    name: String,
    updated_at: Option<String>,
    inserted_at: Option<String>,
}

#[derive(Deserialize)]
struct CategoryAttrs {
    name: String,
    project_id: Option<String>,
    updated_at: Option<String>,
    inserted_at: Option<String>,
}

// ── JSON:API request shapes ─────────────────────────────────────────────────

#[derive(Serialize)]
struct JsonApiCreate<'a, T: Serialize> {
    data: JsonApiCreateBody<'a, T>,
}

#[derive(Serialize)]
struct JsonApiCreateBody<'a, T: Serialize> {
    #[serde(rename = "type")]
    data_type: &'a str,
    attributes: T,
}

#[derive(Serialize)]
struct JsonApiUpdate<'a, T: Serialize> {
    data: JsonApiUpdateBody<'a, T>,
}

#[derive(Serialize)]
struct JsonApiUpdateBody<'a, T: Serialize> {
    #[serde(rename = "type")]
    data_type: &'a str,
    id: &'a str,
    attributes: T,
}

#[derive(Serialize)]
struct TimeEntryAttrsWrite<'a> {
    task_name: &'a str,
    duration_minutes: i32,
    date: &'a str,
    overtime: bool,
    project_id: Option<&'a str>,
    category_id: Option<&'a str>,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

fn json_api_headers() -> [(&'static str, &'static str); 1] {
    [("Accept", "application/vnd.api+json")]
}

// ── Online check ─────────────────────────────────────────────────────────────

pub async fn is_online(token: &str) -> bool {
    let client = match build_client() {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client
        .get(format!("{BASE_URL}/api/json/time-entries"))
        .header("Accept", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
    {
        Ok(res) => {
            let s = res.status().as_u16();
            s == 200 || s == 401
        }
        Err(_) => false,
    }
}

// ── Full sync entry point ────────────────────────────────────────────────────

pub async fn full_sync(pool: &SqlitePool, token: &str) -> SyncResult {
    if !is_online(token).await {
        return SyncResult { pushed: 0, pulled: 0, errors: vec![], online: false };
    }

    let mut result = SyncResult { pushed: 0, pulled: 0, errors: vec![], online: true };

    // 1. Push local pending changes first
    match push_time_entries(pool, token).await {
        Ok(n) => result.pushed = n,
        Err(e) => result.errors.push(format!("Push failed: {e}")),
    }

    // 2. Pull reference data
    if let Err(e) = pull_projects(pool, token).await {
        result.errors.push(format!("Pull projects: {e}"));
    }
    if let Err(e) = pull_categories(pool, token).await {
        result.errors.push(format!("Pull categories: {e}"));
    }

    // 3. Pull time entries
    match pull_time_entries(pool, token).await {
        Ok(n) => result.pulled = n,
        Err(e) => result.errors.push(format!("Pull entries: {e}")),
    }

    // 4. Record last sync timestamp
    let _ = sqlx::query(
        "INSERT OR REPLACE INTO sync_meta (key, value)
         VALUES ('last_full_sync_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .execute(pool)
    .await;

    result
}

// ── PUSH ─────────────────────────────────────────────────────────────────────

async fn push_time_entries(pool: &SqlitePool, token: &str) -> Result<u32, String> {
    let client = build_client()?;

    let pending: Vec<TimeEntryRow> = sqlx::query_as(
        "SELECT * FROM time_entries WHERE sync_status != 'synced' ORDER BY local_updated_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut count = 0u32;
    for entry in pending {
        let ok = match entry.sync_status.as_str() {
            "pending_create" => push_create(&client, pool, token, &entry).await,
            "pending_update" => push_update(&client, pool, token, &entry).await,
            "pending_delete" => push_delete(&client, pool, token, &entry).await,
            _ => Ok(()),
        };
        if ok.is_ok() {
            count += 1;
        }
        // continue on individual failure — drain as much as possible
    }
    Ok(count)
}

async fn push_create(
    client: &Client,
    pool: &SqlitePool,
    token: &str,
    entry: &TimeEntryRow,
) -> Result<(), String> {
    let body = JsonApiCreate {
        data: JsonApiCreateBody {
            data_type: "time_entry",
            attributes: TimeEntryAttrsWrite {
                task_name: &entry.task_name,
                duration_minutes: entry.duration_minutes,
                date: &entry.date,
                overtime: entry.overtime,
                project_id: entry.project_id.as_deref(),
                category_id: entry.category_id.as_deref(),
            },
        },
    };

    let res = client
        .post(format!("{BASE_URL}/api/json/time-entries"))
        .header("Accept", "application/vnd.api+json")
        .header("Content-Type", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("server {} on create", res.status()));
    }

    let data: JsonApiOne<TimeEntryAttrs> = res.json().await.map_err(|e| e.to_string())?;
    let server_id = &data.data.id;
    let server_updated_at = data.data.attributes.updated_at.as_deref().unwrap_or("");
    let server_inserted_at = data.data.attributes.inserted_at.as_deref().unwrap_or("");

    if server_id != &entry.id {
        // Server assigned a different UUID — migrate the local row
        sqlx::query(
            "INSERT INTO time_entries
               (id, task_name, duration_minutes, date, overtime, project_id, category_id,
                inserted_at, updated_at, sync_status, local_updated_at)
             SELECT ?,task_name,duration_minutes,date,overtime,project_id,category_id,
                ?,?,'synced',local_updated_at
             FROM time_entries WHERE id = ?",
        )
        .bind(server_id)
        .bind(server_inserted_at)
        .bind(server_updated_at)
        .bind(&entry.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query("DELETE FROM time_entries WHERE id = ?")
            .bind(&entry.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE time_entries
             SET sync_status='synced', inserted_at=?, updated_at=?
             WHERE id=?",
        )
        .bind(server_inserted_at)
        .bind(server_updated_at)
        .bind(&entry.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn push_update(
    client: &Client,
    pool: &SqlitePool,
    token: &str,
    entry: &TimeEntryRow,
) -> Result<(), String> {
    let body = JsonApiUpdate {
        data: JsonApiUpdateBody {
            data_type: "time_entry",
            id: &entry.id,
            attributes: TimeEntryAttrsWrite {
                task_name: &entry.task_name,
                duration_minutes: entry.duration_minutes,
                date: &entry.date,
                overtime: entry.overtime,
                project_id: entry.project_id.as_deref(),
                category_id: entry.category_id.as_deref(),
            },
        },
    };

    let res = client
        .patch(format!("{BASE_URL}/api/json/time-entries/{}", entry.id))
        .header("Accept", "application/vnd.api+json")
        .header("Content-Type", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().as_u16() == 404 {
        // Deleted on server — remove locally too
        sqlx::query("DELETE FROM time_entries WHERE id=?")
            .bind(&entry.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if !res.status().is_success() {
        return Err(format!("server {} on update", res.status()));
    }

    let data: JsonApiOne<TimeEntryAttrs> = res.json().await.map_err(|e| e.to_string())?;
    let server_updated_at = data.data.attributes.updated_at.as_deref().unwrap_or("");

    sqlx::query("UPDATE time_entries SET sync_status='synced', updated_at=? WHERE id=?")
        .bind(server_updated_at)
        .bind(&entry.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn push_delete(
    client: &Client,
    pool: &SqlitePool,
    token: &str,
    entry: &TimeEntryRow,
) -> Result<(), String> {
    let res = client
        .delete(format!("{BASE_URL}/api/json/time-entries/{}", entry.id))
        .header("Accept", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    if status == 200 || status == 204 || status == 404 {
        sqlx::query("DELETE FROM time_entries WHERE id=?")
            .bind(&entry.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err(format!("server {} on delete", res.status()))
}

// ── PULL ─────────────────────────────────────────────────────────────────────

async fn pull_projects(pool: &SqlitePool, token: &str) -> Result<(), String> {
    let client = build_client()?;
    let res = client
        .get(format!("{BASE_URL}/api/json/projects"))
        .header("Accept", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("server {}", res.status()));
    }

    let data: JsonApiList<ProjectAttrs> = res.json().await.map_err(|e| e.to_string())?;

    for item in data.data {
        let updated_at = item.attributes.updated_at.as_deref().unwrap_or("");
        let inserted_at = item.attributes.inserted_at.as_deref().unwrap_or("");
        sqlx::query(
            "INSERT OR REPLACE INTO projects
               (id, name, inserted_at, updated_at, sync_status, local_updated_at)
             VALUES (?,?,?,?,'synced',?)",
        )
        .bind(&item.id)
        .bind(&item.attributes.name)
        .bind(inserted_at)
        .bind(updated_at)
        .bind(updated_at)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn pull_categories(pool: &SqlitePool, token: &str) -> Result<(), String> {
    let client = build_client()?;
    let res = client
        .get(format!("{BASE_URL}/api/json/categories"))
        .header("Accept", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("server {}", res.status()));
    }

    let data: JsonApiList<CategoryAttrs> = res.json().await.map_err(|e| e.to_string())?;

    for item in data.data {
        let project_id = item.attributes.project_id.as_deref().unwrap_or("");
        let updated_at = item.attributes.updated_at.as_deref().unwrap_or("");
        let inserted_at = item.attributes.inserted_at.as_deref().unwrap_or("");
        sqlx::query(
            "INSERT OR REPLACE INTO categories
               (id, name, project_id, inserted_at, updated_at, sync_status)
             VALUES (?,?,?,?,?,'synced')",
        )
        .bind(&item.id)
        .bind(&item.attributes.name)
        .bind(project_id)
        .bind(inserted_at)
        .bind(updated_at)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn pull_time_entries(pool: &SqlitePool, token: &str) -> Result<u32, String> {
    let client = build_client()?;
    let res = client
        .get(format!("{BASE_URL}/api/json/time-entries"))
        .header("Accept", "application/vnd.api+json")
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("server {}", res.status()));
    }

    let data: JsonApiList<TimeEntryAttrs> = res.json().await.map_err(|e| e.to_string())?;
    let server_ids: HashSet<String> = data.data.iter().map(|e| e.id.clone()).collect();
    let mut pulled = 0u32;

    for item in &data.data {
        let a = &item.attributes;
        let updated_at = a.updated_at.as_deref().unwrap_or("");
        let inserted_at = a.inserted_at.as_deref().unwrap_or("");
        let overtime = a.overtime.unwrap_or(false);

        let existing: Option<TimeEntryRow> =
            sqlx::query_as("SELECT * FROM time_entries WHERE id=?")
                .bind(&item.id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;

        match existing {
            None => {
                // New record from server
                sqlx::query(
                    "INSERT INTO time_entries
                       (id,task_name,duration_minutes,date,overtime,project_id,category_id,
                        inserted_at,updated_at,sync_status,local_updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,'synced',?)",
                )
                .bind(&item.id)
                .bind(&a.task_name)
                .bind(a.duration_minutes)
                .bind(&a.date)
                .bind(overtime)
                .bind(&a.project_id)
                .bind(&a.category_id)
                .bind(inserted_at)
                .bind(updated_at)
                .bind(updated_at)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
                pulled += 1;
            }
            Some(local) if local.sync_status == "synced" => {
                // Overwrite with server version
                sqlx::query(
                    "UPDATE time_entries
                     SET task_name=?,duration_minutes=?,date=?,overtime=?,
                         project_id=?,category_id=?,updated_at=?,inserted_at=?,
                         sync_status='synced',local_updated_at=?
                     WHERE id=?",
                )
                .bind(&a.task_name)
                .bind(a.duration_minutes)
                .bind(&a.date)
                .bind(overtime)
                .bind(&a.project_id)
                .bind(&a.category_id)
                .bind(updated_at)
                .bind(inserted_at)
                .bind(updated_at)
                .bind(&item.id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
                pulled += 1;
            }
            Some(local) if local.sync_status == "pending_update" => {
                // LWW: server wins if its timestamp is newer
                if updated_at > local.local_updated_at.as_str() {
                    sqlx::query(
                        "UPDATE time_entries
                         SET task_name=?,duration_minutes=?,date=?,overtime=?,
                             project_id=?,category_id=?,updated_at=?,inserted_at=?,
                             sync_status='synced',local_updated_at=?
                         WHERE id=?",
                    )
                    .bind(&a.task_name)
                    .bind(a.duration_minutes)
                    .bind(&a.date)
                    .bind(overtime)
                    .bind(&a.project_id)
                    .bind(&a.category_id)
                    .bind(updated_at)
                    .bind(inserted_at)
                    .bind(updated_at)
                    .bind(&item.id)
                    .execute(pool)
                    .await
                    .map_err(|e| e.to_string())?;
                    pulled += 1;
                }
                // else: local is newer, keep pending_update
            }
            // pending_create or pending_delete: leave untouched
            _ => {}
        }
    }

    // Remove synced local entries that no longer exist on server (server deleted them)
    let local_synced_ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM time_entries WHERE sync_status='synced'")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    for id in local_synced_ids {
        if !server_ids.contains(&id) {
            sqlx::query("DELETE FROM time_entries WHERE id=?")
                .bind(&id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(pulled)
}
