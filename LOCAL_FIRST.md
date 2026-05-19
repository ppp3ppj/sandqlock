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

---

## Performance Problem Zones

### 1. Full list pull on every sync — O(N) every 60 seconds

```
pull_time_entries()
  → GET /api/json/time-entries   (returns ALL entries, no pagination)
  → loop over every server record
  → SELECT from SQLite for each one
```

**When it hurts:** User has 5,000+ entries accumulated over years.
Every 60 seconds: one large HTTP response + 5,000 SQLite reads + upserts.

**✅ Fixed — two-level sync:**

```
App start / login → full pull   (O(N), detects server-side deletions)
Every 60 seconds  → delta pull  (O(changed), usually 0–5 entries)
```

Delta pull uses `?filter[updated_after]=<last_sync_at>` added to the backend.

Backend change: `time_entry.ex` — made `inserted_at` / `updated_at` public.
Uses Ash's standard operator filter syntax: `?filter[updated_at][gte]=ISO_DATETIME`.
No custom action needed — `gte` is built into `Ash.Query.filter_input/3`.

Client change: `sync.rs` — `full_sync(pool, token, startup: bool)`.
- `startup = true`  → `pull_time_entries_full()`
- `startup = false` → `pull_time_entries_delta()` with `since = last_sync_at`

---

### 2. Push queue grows unbounded during long offline periods

```
User offline for 2 weeks, creates 200 entries.
Reconnects → push_time_entries() loops 200 POST requests sequentially.
```

**When it hurts:** Each POST is a separate HTTP round-trip.
200 entries × ~200ms each = ~40 seconds to drain the queue.
UI is usable (local reads still work) but sync takes a long time.

**✅ Fixed — bulk create endpoint:**

```
All pending_creates → POST /api/json/time-entries/bulk  (1 request)
pending_update / pending_delete → individual PATCH/DELETE (fewer in number)
```

200 creates × 200ms sequential → 1 bulk request × 200ms total.

Key design: client sends its own UUID with each entry (`uuid_primary_key :id, writable?: true`
in the Ash resource). Server stores the client UUID as-is. No UUID reconciliation needed.
Failed entries remain `pending_create` and retry individually on next sync.

---

### 3. SQLite write contention

Every user action writes to SQLite.
Every sync also writes to SQLite.
SQLite allows only one writer at a time (WAL mode helps but doesn't eliminate this).

**When it hurts:** User rapidly creates entries while a large sync pull is running.
Writes queue behind the sync transaction.

**Fix:** Already partially mitigated — SQLite in WAL mode allows concurrent
reads with one writer. For this app scale (one user, one device), this is
not a real problem in practice.

---

### 4. Memory spike on large pull response

The full `GET /api/json/time-entries` response is parsed into memory at once
before any SQLite writes happen.

```rust
let data: JsonApiList<TimeEntryAttrs> = res.json().await ...
// entire response deserialized into Vec in RAM
```

**When it hurts:** 10,000 entries × ~300 bytes each ≈ 3 MB in RAM.
Acceptable for a desktop app. Would matter on a mobile device.

**Fix (not yet implemented):** Stream the response and process records
in chunks rather than loading everything at once.

---

## LWW Worst Cases

### Worst case 1: Silent data loss from clock skew

```
Device clock is wrong by 2 hours (behind).

User edits entry at real time 14:00 → local_updated_at = "12:00" (wrong clock)
Server has version from 13:00 → server.updated_at = "13:00"

LWW check: "13:00" > "12:00" → server wins
User's edit at 14:00 is silently discarded. User never knows.
```

**How likely:** Uncommon but real. Happens with:
- Manual clock adjustments
- Timezone changes (travel, DST)
- Virtual machines with unsynchronized clocks

**No fix in current implementation.** Using a monotonic server-assigned
version number instead of wall-clock time would eliminate this entirely.

---

### Worst case 2: All offline edits lost after long offline period

```
User works offline for 3 days, edits 50 entries.
Meanwhile, admin resets those entries on the server.
Server updated_at = just now (newer than all local edits).

Sync runs:
  LWW check: server newer → server wins for all 50 entries.
  3 days of offline work is gone in one sync.
```

**How likely:** Rare in single-user single-device scenario.
More likely if user logs in on a second device and edits the same entries.

---

### Worst case 3: Delete vs edit race

```
User deletes entry A on server (via Bruno / web).
User edits entry A locally while offline.
  → local sync_status = "pending_update"

Sync runs:
  PUSH: PATCH /api/json/time-entries/A → server returns 404
  db_commands handles 404 by deleting locally.
  User's edit is gone.
```

**How likely:** Only if user accesses data from multiple clients simultaneously.
For a single-device desktop app, this cannot happen.

**Current behavior:** The 404-on-update path deletes the local row.
This is the "delete wins" policy — reasonable but the user gets no warning.

---

### Worst case 4: Duplicate entries on push retry

```
POST /api/json/time-entries → server creates the entry
Network drops before 201 response arrives
Client sees timeout → retries → POSTs again
Server creates a second duplicate entry
```

**How likely:** Low but possible on flaky connections.

**Current behavior:** No retry deduplication. The same entry could appear
twice on the server.

**Fix (not yet implemented):** Send a client-generated idempotency key
(the local UUID) and have the server reject duplicate IDs.
This requires a small backend change to accept client-provided UUIDs.

---

### Worst case 5: Multi-machine sequential use — forgot to sync before switching

```
Machine A goes offline (or app closes before sync completes).
  → entry X has local edits, sync_status = "pending_update"

User switches to Machine B.
  → Machine B pulls from server (doesn't know about Machine A's offline edits)
  → User edits entry X on Machine B → pushes → server updated_at = T2

Machine A reconnects.
  → Pull: server.updated_at (T2) > local.local_updated_at (T1)
  → LWW: server wins → Machine A's offline edits are silently discarded
```

**How likely:** Only affects multi-machine users who switch while one machine is offline or unsynced.
Single-machine users: impossible.
Sequential multi-machine users who always sync before switching: impossible.

**Safe sequential flow (no data loss):**
```
Machine A: edit → wait for sync ✓ → close
Machine B: open → sync pulls latest → edit → sync ✓ → close
Machine A: open → sync pulls latest → sees B's changes ✓
```

**Current behavior:** Silent data loss. Machine A's offline edits are overwritten with no warning.

**Fix (not yet implemented):** Detect the conflict and show a warning:
```
"Entry modified on another device since your last sync.
 [Keep local version]  [Use server version]"
```

---

### Worst case 6: Clock skew with multiple machines

```
Machine A clock: correct (14:00)
Machine B clock: 2 hours behind (shows 12:00)

Machine B edits entry at real time 14:05 → local_updated_at = "12:05"
Machine A previously edited same entry → server.updated_at = "14:00"

Machine B syncs:
  Pull: server "14:00" > local "12:05" → server wins
  Machine B's edit is silently discarded
```

**How likely:** Low but real. Each machine has its own clock.
Causes: wrong timezone on one machine, manual clock adjustment, VM clock drift.

**Fix:** Option A — always keep local version when `sync_status = "pending_update"`.
No timestamp comparison = no clock dependency.
This is the right call for single-user multi-machine sequential use since you never
have two people editing the same entry simultaneously.

---

### Summary table

| Worst case | Single machine | Multi-machine sequential | Data loss? | Fix |
|------------|---------------|--------------------------|-----------|-----|
| Clock skew (1 machine) | Low | — | Yes — silent | Option A (always local wins) |
| Clock skew (2 machines) | Impossible | Low | Yes — silent | Option A |
| Forgot to sync before switching | Impossible | **Medium** | Yes — silent | Conflict UI warning |
| Long offline + server reset | Very low | Very low | Yes — silent | Conflict UI / manual resolve |
| Delete vs edit race | Very low | Very low | Yes — silent | "Delete wins" warning |
| Push retry duplicates | Low | Low | No (duplicate) | Idempotency key ✅ (UUID) |
| Large pull memory spike | Low | Low | No | Pagination |
| Slow push of large queue | Medium | Medium | No | Batch push ✅ fixed |

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
