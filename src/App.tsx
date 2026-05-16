import { createSignal, onMount, Show } from "solid-js";
import { initTheme } from "./theme";
import LoginPage from "./pages/LoginPage";
import TimeEntriesPage from "./pages/TimeEntriesPage";
import TimeEntryFormPage from "./pages/TimeEntryFormPage";
import { getToken, clearToken } from "./lib/auth-store";
import { TimeEntry } from "./lib/qlock-api";
import "./App.css";

type View = "list" | "form";

function App() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [token, setToken] = createSignal("");
  const [view, setView] = createSignal<View>("list");
  const [editingEntry, setEditingEntry] = createSignal<TimeEntry | null>(null);
  const [formDate, setFormDate] = createSignal("");
  const [refreshKey, setRefreshKey] = createSignal(0);

  onMount(async () => {
    initTheme();
    const t = await getToken();
    if (t) {
      setToken(t);
      setLoggedIn(true);
    }
    setChecking(false);
  });

  async function handleLogout() {
    await clearToken();
    setToken("");
    setLoggedIn(false);
    setView("list");
  }

  function handleLogin(t: string) {
    setToken(t);
    setLoggedIn(true);
  }

  function handleAdd(date: string) {
    setEditingEntry(null);
    setFormDate(date);
    setView("form");
  }

  function handleEdit(entry: TimeEntry) {
    setEditingEntry(entry);
    setFormDate(entry.date);
    setView("form");
  }

  function handleBack() {
    setView("list");
  }

  function handleSaved() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <Show when={!checking()} fallback={<div class="min-h-screen flex items-center justify-center"><span class="loading loading-spinner loading-lg" /></div>}>
      <Show when={loggedIn()} fallback={<LoginPage onLogin={handleLogin} />}>
        <Show when={view() === "list"} fallback={
          <TimeEntryFormPage
            token={token()}
            entry={editingEntry()}
            date={formDate()}
            onBack={handleBack}
            onSaved={handleSaved}
          />
        }>
          <TimeEntriesPage
            token={token()}
            onLogout={handleLogout}
            onAdd={handleAdd}
            onEdit={handleEdit}
            refreshKey={refreshKey()}
          />
        </Show>
      </Show>
    </Show>
  );
}

export default App;
