import { createSignal, onMount, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { initTheme } from "./theme";
import LoginPage from "./pages/LoginPage";
import TimeEntriesPage from "./pages/TimeEntriesPage";
import TimeEntryFormPage from "./pages/TimeEntryFormPage";
import { getToken, clearToken } from "./lib/auth-store";
import { TimeEntry, createTimeEntry, triggerSync, getSyncStatus } from "./lib/local-api";
import "./App.css";

type View = "list" | "form";

export interface TimerDraft {
  task_name: string;
  project_id: string | null;
  category_id: string | null;
  overtime: boolean;
  date: string;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDurationShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function App() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [token, setToken] = createSignal("");
  const [view, setView] = createSignal<View>("list");

  // Form state
  const [editingEntry, setEditingEntry] = createSignal<TimeEntry | null>(null);
  const [formDate, setFormDate] = createSignal("");
  const [initialDurationSeconds, setInitialDurationSeconds] = createSignal<number | undefined>(undefined);
  const [refreshKey, setRefreshKey] = createSignal(0);

  // Timer state
  const [timerSeconds, setTimerSeconds] = createSignal(0);
  const [timerRunning, setTimerRunning] = createSignal(false);
  const [timerDraft, setTimerDraft] = createSignal<TimerDraft | null>(null);
  const intervalRef = { id: 0 };

  // Sync state
  const [syncing, setSyncing] = createSignal(false);
  const [pendingCount, setPendingCount] = createSignal(0);
  const [lastSyncAt, setLastSyncAt] = createSignal<string | null>(null);
  const [syncOnline, setSyncOnline] = createSignal(true);
  const syncIntervalRef = { id: 0 };

  async function runSync(t: string, startup = false) {
    if (syncing()) return;
    setSyncing(true);
    try {
      const result = await triggerSync(t, startup);
      setSyncOnline(result.online);
      if (result.pulled > 0 || result.pushed > 0) setRefreshKey((k) => k + 1);
      const status = await getSyncStatus();
      setPendingCount(Number(status.pending_count));
      setLastSyncAt(status.last_sync_at);
    } catch {
      // silent — sync failure is non-fatal
    } finally {
      setSyncing(false);
    }
  }

  function startSyncInterval(t: string) {
    clearInterval(syncIntervalRef.id);
    syncIntervalRef.id = window.setInterval(() => runSync(t, false), 60_000);
  }

  onMount(async () => {
    initTheme();
    try {
      const t = await Promise.race([
        getToken(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (t) {
        setToken(t);
        setLoggedIn(true);
        runSync(t, true);
        startSyncInterval(t);
      }
    } catch {
      // proceed as logged out
    }
    setChecking(false);

    // ── Tray menu events ────────────────────────────────────────────────────
    // These fire when the user clicks tray menu items while the window is hidden.

    listen("tray:stop-timer", () => {
      if (timerRunning()) handleTimerStop();
    });

    listen("tray:cancel-timer", () => {
      if (timerRunning()) handleTimerCancel();
    });

    // ── Global shortcut: CmdOrControl+Shift+T ───────────────────────────────
    // Timer running → stop and save.
    // Timer not running → show window + go to form to start a new entry.
    listen("shortcut:toggle-timer", () => {
      if (timerRunning()) {
        handleTimerStop();
      } else {
        // Bring window to front and navigate to form
        invoke("show_main_window").catch(() => {});
        setEditingEntry(null);
        setFormDate(toISODate(new Date()));
        setInitialDurationSeconds(undefined);
        setView("form");
      }
    });
  });

  async function handleLogout() {
    clearInterval(intervalRef.id);
    clearInterval(syncIntervalRef.id);
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerDraft(null);
    invoke("set_tray_idle").catch(() => {});
    await clearToken();
    setToken("");
    setLoggedIn(false);
  }

  function handleLogin(t: string) {
    setToken(t);
    setLoggedIn(true);
    runSync(t, true);
    startSyncInterval(t);
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  function startTimerInterval() {
    intervalRef.id = window.setInterval(() => {
      setTimerSeconds((s) => s + 1);
      // Push live time to the tray tooltip every second
      const secs = timerSeconds();
      const draft = timerDraft();
      invoke("update_tray_timer", {
        seconds: secs,
        task: draft?.task_name ?? "",
      }).catch(() => {});
    }, 1000);
  }

  function handleStartTimerFromForm(draft: TimerDraft) {
    setTimerDraft(draft);
    setTimerSeconds(0);
    setTimerRunning(true);
    invoke("update_tray_timer", { seconds: 0, task: draft.task_name }).catch(() => {});
    startTimerInterval();
    setView("list");
  }

  function handleRepeat(entry: TimeEntry) {
    if (timerRunning()) clearInterval(intervalRef.id);
    const draft: TimerDraft = {
      task_name: entry.task_name,
      project_id: entry.project_id ?? null,
      category_id: entry.category_id ?? null,
      overtime: entry.overtime,
      date: toISODate(new Date()),
    };
    setTimerDraft(draft);
    setTimerSeconds(0);
    setTimerRunning(true);
    invoke("update_tray_timer", { seconds: 0, task: draft.task_name }).catch(() => {});
    startTimerInterval();
  }

  async function handleTimerStop() {
    const rawSeconds = timerSeconds();
    clearInterval(intervalRef.id);
    setTimerRunning(false);
    const draft = timerDraft();

    // Reset tray immediately
    invoke("set_tray_idle").catch(() => {});

    if (draft) {
      try {
        await createTimeEntry(token(), {
          task_name: draft.task_name,
          duration_seconds: Math.max(1, rawSeconds),
          date: draft.date,
          overtime: draft.overtime,
          project_id: draft.project_id,
          category_id: draft.category_id,
        });
        setTimerDraft(null);
        setRefreshKey((k) => k + 1);
        setPendingCount((n) => n + 1);
        runSync(token());
        // ── OS notification: timer saved ─────────────────
        invoke("show_notification", {
          title: "SandQlock — Timer Saved",
          body: `${formatDurationShort(rawSeconds)} logged: ${draft.task_name}`,
        }).catch(() => {});
      } catch {
        // Fallback to form pre-filled with exact seconds
        setInitialDurationSeconds(Math.max(1, rawSeconds));
        setEditingEntry(null);
        setFormDate(draft.date);
        setTimerDraft(null);
        setView("form");
      }
    } else {
      setInitialDurationSeconds(Math.max(1, rawSeconds));
      setEditingEntry(null);
      setFormDate(toISODate(new Date()));
      setView("form");
    }
  }

  function handleTimerCancel() {
    clearInterval(intervalRef.id);
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerDraft(null);
    invoke("set_tray_idle").catch(() => {});
  }

  // ── Form navigation ────────────────────────────────────────────────────────

  function handleAdd(date: string) {
    setEditingEntry(null);
    setFormDate(date);
    setInitialDurationSeconds(undefined);
    setView("form");
  }

  function handleEdit(entry: TimeEntry) {
    setEditingEntry(entry);
    setFormDate(entry.date);
    setInitialDurationSeconds(undefined);
    setView("form");
  }

  function handleFormBack() {
    setView("list");
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
    setPendingCount((n) => n + 1);
    runSync(token());
  }

  return (
    <Show
      when={!checking()}
      fallback={
        <div class="min-h-screen flex items-center justify-center">
          <span class="loading loading-spinner loading-lg" />
        </div>
      }
    >
      <Show when={loggedIn()} fallback={<LoginPage onLogin={handleLogin} />}>
        <Show
          when={view() === "list"}
          fallback={
            <TimeEntryFormPage
              token={token()}
              entry={editingEntry()}
              date={formDate()}
              initialDurationSeconds={initialDurationSeconds()}
              onBack={handleFormBack}
              onSaved={handleSaved}
              onStartTimer={handleStartTimerFromForm}
            />
          }
        >
          <TimeEntriesPage
            token={token()}
            onLogout={handleLogout}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onRepeat={handleRepeat}
            onStopTimer={handleTimerStop}
            onCancelTimer={handleTimerCancel}
            timerRunning={timerRunning()}
            timerSeconds={timerSeconds()}
            timerDraft={timerDraft()}
            refreshKey={refreshKey()}
            syncing={syncing()}
            syncOnline={syncOnline()}
            pendingCount={pendingCount()}
            lastSyncAt={lastSyncAt()}
            onSync={() => runSync(token())}
          />
        </Show>
      </Show>
    </Show>
  );
}

export default App;
