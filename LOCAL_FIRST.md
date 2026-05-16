# Local-First & Sync Architecture

## What is Local-First?

All reads and writes go to **local SQLite first**.
The qlock server is a mirror — it catches up whenever internet is available.
The app works fully offline after the first login.

---

## First Launch (requires internet)

```
Login → triggerSync()
          ├─ pull all projects        → stored in local SQLite
          ├─ pull all categories      → stored in local SQLite
          └─ pull all time_entries    → stored in local SQLite

From this point forward: internet is optional.
```

---

## Every Write (create / edit / delete)

Writes never touch the network directly.
They go to SQLite and are tagged with a `sync_status`:

| Action | sync_status set to |
|--------|--------------------|
| Create entry | `pending_create` |
| Edit entry   | `pending_update` |
| Delete entry | `pending_delete` |
| Never synced + deleted | deleted immediately locally |

The entry appears in the UI **instantly** with a `●` badge while pending.

---

## When Does Sync Run?

| Trigger | What happens |
|---------|-------------|
| After login | Full push + pull immediately |
| After create / edit / delete | Push attempt (fire-and-forget) |
| Every 60 seconds | Full push + pull if online |
| "Sync now" button in sidebar | Full push + pull immediately |

---

## Sync Order (always push first, then pull)

```
full_sync(token)
  ①  is_online?  → if No: return { online: false }

  ②  PUSH  (local → server)
       ├─ pending_create  → POST   /api/json/time-entries
       ├─ pending_update  → PATCH  /api/json/time-entries/:id
       └─ pending_delete  → DELETE /api/json/time-entries/:id

  ③  PULL reference data  (server → local, read-only cache)
       ├─ GET /api/json/projects    → INSERT OR REPLACE locally
       └─ GET /api/json/categories  → INSERT OR REPLACE locally

  ④  PULL time entries  (server → local)
       ├─ For each server record:
       │    synced locally?       → overwrite with server version
       │    pending_update?       → LWW (last-write-wins, see below)
       │    pending_create/delete → skip, let push handle it
       └─ synced local records absent from server → delete locally
            (means someone deleted them elsewhere)

  ⑤  Update sync_meta.last_full_sync_at = now
```

---

## Conflict Resolution: Last-Write-Wins (LWW)

Applies only when a record is `pending_update` locally AND the server
also has a newer version (rare — single user, single device).

```
if server.updated_at > local.local_updated_at
    → server wins  (overwrite local, set sync_status = synced)
else
    → local wins   (keep pending_update, push will win on next sync)
```

`local_updated_at` is set to the device clock at the moment of each local edit.

---

## UUID Strategy

Time entries use **client-generated UUIDs** (Rust `uuid::Uuid::new_v4()`).
This allows creating records offline without needing the server to assign an ID.

If the server returns a different UUID after POST (unlikely with this backend):
- The local row is re-inserted with the server UUID.
- The old local UUID row is deleted.

Projects and categories use **server-assigned UUIDs** — they are read-only
locally and never created offline.

---

## sync_status Values

| Value | Meaning |
|-------|---------|
| `synced` | Matches server, no local changes |
| `pending_create` | Created locally, not yet POSTed to server |
| `pending_update` | Edited locally, not yet PATCHed to server |
| `pending_delete` | Deleted locally, not yet DELETEd on server |
| `delete_local` | Was `pending_create` then deleted → removed immediately |

---

## What the Sidebar Shows

| Indicator | Meaning |
|-----------|---------|
| `● Offline` | qlock server unreachable |
| `● N pending` | N entries waiting to sync |
| `● Synced` | Everything is up to date |
| `Last sync: HH:MM:SS` | Timestamp of last successful full sync |
| `● badge on entry card` | That specific entry is not yet synced |

---

## Online Detection

Before every sync attempt, Rust sends a lightweight request:

```
GET /api/json/time-entries
```

- `200` or `401` → server reachable → proceed with sync
- timeout / connection refused → offline → skip sync, return early

---

## What Requires Internet

| Action | Needs internet? |
|--------|----------------|
| First login | Yes |
| Initial data download | Yes (one time) |
| View entries | No |
| Create / edit / delete entries | No |
| Sync pending changes | Yes |
| Token refresh (JWT expiry) | Yes |

---

## File Locations

| File | Purpose |
|------|---------|
| `src-tauri/src/sync.rs` | Push and pull logic |
| `src-tauri/src/db_commands.rs` | Tauri commands for CRUD + sync |
| `src-tauri/src/models.rs` | Shared Rust structs |
| `src-tauri/src/setup.rs` | SQLite pool initialization + migrations |
| `migrations/0001_create_local_tables.sql` | SQLite schema |
| `src/lib/local-api.ts` | Frontend invoke() wrappers |
| `src/App.tsx` | Sync triggers and sync state signals |
| `src/pages/TimeEntriesPage.tsx` | Sync status UI in sidebar |
