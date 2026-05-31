-- Passive app time tracking.
-- Records how many seconds each app was in the foreground per day.
-- Updated in 60-second ticks by the Rust background poller.

CREATE TABLE IF NOT EXISTS app_tracking (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  app_name    TEXT NOT NULL,
  date        TEXT NOT NULL,  -- YYYY-MM-DD
  seconds     INTEGER NOT NULL DEFAULT 60,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(app_name, date)
);

CREATE INDEX IF NOT EXISTS idx_app_tracking_date ON app_tracking(date);
