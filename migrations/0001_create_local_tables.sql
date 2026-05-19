CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  inserted_at      TEXT,
  updated_at       TEXT,
  sync_status      TEXT NOT NULL DEFAULT 'synced',
  local_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  inserted_at TEXT,
  updated_at  TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS time_entries (
  id               TEXT PRIMARY KEY,
  task_name        TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  date             TEXT NOT NULL,
  overtime         INTEGER NOT NULL DEFAULT 0,
  project_id       TEXT,
  category_id      TEXT,
  inserted_at      TEXT,
  updated_at       TEXT,
  sync_status      TEXT NOT NULL DEFAULT 'synced',
  local_updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
