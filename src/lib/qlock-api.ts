import { fetch } from "@tauri-apps/plugin-http";

const BASE_URL = "http://localhost:4000";

export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/json/users/sign_in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({ data: { email, password } }),
  });

  if (res.status === 401) throw new Error("Invalid email or password.");
  if (!res.ok) throw new Error("Login failed. Please try again.");

  const body = await res.json();
  if (!body.token) throw new Error("Login failed. Please try again.");
  return body.token as string;
}

export interface TimeEntry {
  id: string;
  task_name: string;
  duration_minutes: number;
  date: string;
  overtime: boolean;
  project_id?: string | null;
  category_id?: string | null;
}

export interface TimeEntryInput {
  task_name: string;
  duration_minutes: number;
  date: string;
  overtime?: boolean;
  project_id?: string | null;
  category_id?: string | null;
}

function apiHeaders(token: string) {
  return {
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
    Authorization: `Bearer ${token}`,
  };
}

export async function listTimeEntries(token: string, date?: string): Promise<TimeEntry[]> {
  const params = date ? `?filter[date]=${date}` : "";
  const res = await fetch(`${BASE_URL}/api/json/time-entries${params}`, {
    method: "GET",
    headers: apiHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch time entries.");
  const body = await res.json();
  return (body.data ?? []).map((item: { id: string; attributes: Omit<TimeEntry, "id"> }) => ({
    id: item.id,
    ...item.attributes,
  }));
}

export async function createTimeEntry(token: string, attrs: TimeEntryInput): Promise<TimeEntry> {
  const res = await fetch(`${BASE_URL}/api/json/time-entries`, {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify({ data: { type: "time_entry", attributes: attrs } }),
  });
  if (!res.ok) throw new Error("Failed to create time entry.");
  const body = await res.json();
  return { id: body.data.id, ...body.data.attributes };
}

export async function updateTimeEntry(
  token: string,
  id: string,
  attrs: Partial<TimeEntryInput>
): Promise<TimeEntry> {
  const res = await fetch(`${BASE_URL}/api/json/time-entries/${id}`, {
    method: "PATCH",
    headers: apiHeaders(token),
    body: JSON.stringify({ data: { type: "time_entry", id, attributes: attrs } }),
  });
  if (!res.ok) throw new Error("Failed to update time entry.");
  const body = await res.json();
  return { id: body.data.id, ...body.data.attributes };
}

export async function deleteTimeEntry(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/json/time-entries/${id}`, {
    method: "DELETE",
    headers: apiHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to delete time entry.");
}
