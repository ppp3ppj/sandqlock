import { invoke } from "@tauri-apps/api/core";

// Re-export signIn from qlock-api — login still needs the network
export { signIn } from "./qlock-api";

export interface TimeEntry {
  id: string;
  task_name: string;
  duration_minutes: number;
  date: string;
  overtime: boolean;
  project_id?: string | null;
  category_id?: string | null;
  sync_status: string;        // "synced" | "pending_create" | "pending_update" | "pending_delete"
  local_updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  sync_status: string;
}

export interface Category {
  id: string;
  name: string;
  project_id: string;
}

export interface TimeEntryInput {
  task_name: string;
  duration_minutes: number;
  date: string;
  overtime?: boolean;
  project_id?: string | null;
  category_id?: string | null;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
  online: boolean;
}

export interface SyncStatus {
  pending_count: number;
  last_sync_at: string | null;
  online: boolean;
}

// Token parameter kept for API compatibility with existing callers — ignored locally
export async function listTimeEntries(_token: string, date: string): Promise<TimeEntry[]> {
  return invoke<TimeEntry[]>("list_time_entries", { date });
}

export async function createTimeEntry(_token: string, attrs: TimeEntryInput): Promise<TimeEntry> {
  return invoke<TimeEntry>("create_time_entry", { attrs });
}

export async function updateTimeEntry(
  _token: string,
  id: string,
  attrs: TimeEntryInput,
): Promise<TimeEntry> {
  return invoke<TimeEntry>("update_time_entry", { id, attrs });
}

export async function deleteTimeEntry(_token: string, id: string): Promise<void> {
  return invoke("delete_time_entry", { id });
}

export async function listProjects(_token: string): Promise<Project[]> {
  return invoke<Project[]>("list_projects");
}

export async function listCategories(_token: string, projectId: string): Promise<Category[]> {
  return invoke<Category[]>("list_categories", { projectId });
}

// startup=true  → full pull (detects server-side deletions)
// startup=false → delta pull (only entries changed since last sync, O(changed))
export async function triggerSync(token: string, startup = false): Promise<SyncResult> {
  return invoke<SyncResult>("trigger_sync", { token, startup });
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("get_sync_status");
}
