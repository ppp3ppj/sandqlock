ALTER TABLE time_entries RENAME COLUMN duration_minutes TO duration_seconds;
UPDATE time_entries SET duration_seconds = duration_seconds * 60;
