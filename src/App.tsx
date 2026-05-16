import { createSignal, onMount, Show } from "solid-js";
import { initTheme } from "./theme";
import LoginPage from "./pages/LoginPage";
import TimeEntriesPage from "./pages/TimeEntriesPage";
import TimeEntryFormPage from "./pages/TimeEntryFormPage";
import { getToken, clearToken } from "./lib/auth-store";
import { TimeEntry, createTimeEntry } from "./lib/qlock-api";
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

function App() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [token, setToken] = createSignal("");
  const [view, setView] = createSignal<View>("list");

  // Form state
  const [editingEntry, setEditingEntry] = createSignal<TimeEntry | null>(null);
  const [formDate, setFormDate] = createSignal("");
  const [initialDuration, setInitialDuration] = createSignal<number | undefined>(undefined);
  const [refreshKey, setRefreshKey] = createSignal(0);

  // Global timer state
  const [timerSeconds, setTimerSeconds] = createSignal(0);
  const [timerRunning, setTimerRunning] = createSignal(false);
  const [timerDraft, setTimerDraft] = createSignal<TimerDraft | null>(null);
  const intervalRef = { id: 0 };

  onMount(async () => {
    initTheme();
    const t = await getToken();
    if (t) { setToken(t); setLoggedIn(true); }
    setChecking(false);
  });

  async function handleLogout() {
    clearInterval(intervalRef.id);
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerDraft(null);
    await clearToken();
    setToken("");
    setLoggedIn(false);
  }

  function handleLogin(t: string) {
    setToken(t);
    setLoggedIn(true);
  }

  // Start timer from the list (no draft — old plain timer behavior)
  function handleStartTimer() {
    setTimerDraft(null);
    setTimerSeconds(0);
    setTimerRunning(true);
    intervalRef.id = window.setInterval(() => setTimerSeconds((s) => s + 1), 1000);
  }

  // Start timer from the form (with draft task info)
  function handleStartTimerFromForm(draft: TimerDraft) {
    setTimerDraft(draft);
    setTimerSeconds(0);
    setTimerRunning(true);
    intervalRef.id = window.setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    setView("list");
  }

  // Stop timer — auto-save if draft exists, otherwise open form
  async function handleTimerStop() {
    clearInterval(intervalRef.id);
    setTimerRunning(false);
    const draft = timerDraft();
    const elapsed = Math.max(1, Math.ceil(timerSeconds() / 60));

    if (draft) {
      try {
        await createTimeEntry(token(), {
          task_name: draft.task_name,
          duration_minutes: elapsed,
          date: draft.date,
          overtime: draft.overtime,
          project_id: draft.project_id,
          category_id: draft.category_id,
        });
        setTimerDraft(null);
        setRefreshKey((k) => k + 1);
      } catch {
        // Save failed — fall back to form so user doesn't lose the entry
        setInitialDuration(elapsed);
        setEditingEntry(null);
        setFormDate(draft.date);
        setTimerDraft(null);
        setView("form");
      }
    } else {
      // No draft — open form pre-filled with elapsed duration
      setInitialDuration(elapsed);
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
  }

  // Form navigation
  function handleAdd(date: string) {
    setEditingEntry(null);
    setFormDate(date);
    setInitialDuration(undefined);
    setView("form");
  }

  function handleEdit(entry: TimeEntry) {
    setEditingEntry(entry);
    setFormDate(entry.date);
    setInitialDuration(undefined);
    setView("form");
  }

  function handleFormBack() {
    setView("list");
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <Show
      when={!checking()}
      fallback={<div class="min-h-screen flex items-center justify-center"><span class="loading loading-spinner loading-lg" /></div>}
    >
      <Show when={loggedIn()} fallback={<LoginPage onLogin={handleLogin} />}>
        <Show
          when={view() === "list"}
          fallback={
            <TimeEntryFormPage
              token={token()}
              entry={editingEntry()}
              date={formDate()}
              initialDuration={initialDuration()}
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
            onStartTimer={handleStartTimer}
            onStopTimer={handleTimerStop}
            onCancelTimer={handleTimerCancel}
            timerRunning={timerRunning()}
            timerSeconds={timerSeconds()}
            timerDraft={timerDraft()}
            refreshKey={refreshKey()}
          />
        </Show>
      </Show>
    </Show>
  );
}

export default App;
