import { createSignal, createEffect, For, Show } from "solid-js";
import { listTimeEntries, searchTimeEntries, deleteTimeEntry, TimeEntry } from "../lib/local-api";
import ThemeSelect from "../ThemeSelect";

interface TimerDraft {
  task_name: string;
}

interface Props {
  token: string;
  onLogout: () => void;
  onAdd: (date: string) => void;
  onEdit: (entry: TimeEntry) => void;
  onRepeat: (entry: TimeEntry) => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  timerRunning: boolean;
  timerSeconds: number;
  timerDraft: TimerDraft | null;
  refreshKey: number;
  syncing: boolean;
  syncOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  onSync: () => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${isWeekend ? "Weekend" : DAYS[d.getDay()]}`;
}

function formatSearchDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayDate();
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return DAYS[date.getDay()];
  return `${d} ${MONTHS[m - 1]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    if (s > 0) return `${h} hr ${m} min ${s} sec`;
    return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  }
  return s > 0 ? `${m} min ${s} sec` : `${m} min`;
}

function formatTimer(s: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function TimeEntriesPage(props: Props) {
  const [selectedDate, setSelectedDate] = createSignal<Date>(todayDate());
  const [entries, setEntries] = createSignal<TimeEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [fetchError, setFetchError] = createSignal<string | undefined>();
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  // Search state
  const [searchMode, setSearchMode] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<TimeEntry[]>([]);
  const [searching, setSearching] = createSignal(false);
  let searchDebounce = 0;
  let searchInputRef: HTMLInputElement | undefined;

  // Calendar state
  const [calendarOpen, setCalendarOpen] = createSignal(false);
  const [calendarView, setCalendarView] = createSignal(new Date());
  const [calendarTemp, setCalendarTemp] = createSignal(new Date());

  function openCalendar() {
    const d = selectedDate();
    setCalendarView(new Date(d.getFullYear(), d.getMonth(), 1));
    setCalendarTemp(new Date(d));
    setCalendarOpen(true);
  }

  function calendarPrevMonth() {
    const d = calendarView();
    setCalendarView(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function calendarNextMonth() {
    const d = calendarView();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    if (next <= todayDate()) setCalendarView(next);
  }

  const calendarCanGoNext = () =>
    new Date(calendarView().getFullYear(), calendarView().getMonth() + 1, 1) <= todayDate();

  function calendarDays(): (number | null)[] {
    const d = calendarView();
    const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    return cells;
  }

  function calendarDayDate(day: number) {
    const d = calendarView();
    return new Date(d.getFullYear(), d.getMonth(), day);
  }

  const isDayDisabled = (day: number) => calendarDayDate(day) > todayDate();
  const isDaySelected = (day: number) => toISODate(calendarDayDate(day)) === toISODate(calendarTemp());
  const isDayToday = (day: number) => toISODate(calendarDayDate(day)) === toISODate(todayDate());

  async function fetchEntries(date: Date) {
    setLoading(true);
    setFetchError(undefined);
    try {
      setEntries(await listTimeEntries(props.token, toISODate(date)));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load entries.");
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    void props.refreshKey;
    fetchEntries(selectedDate());
  });

  // ── Search ──────────────────────────────────────────────────────────────

  function openSearch() {
    setSearchMode(true);
    setSearchQuery("");
    setSearchResults([]);
    // Focus the input on next tick
    setTimeout(() => searchInputRef?.focus(), 0);
  }

  function closeSearch() {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    clearTimeout(searchDebounce);
  }

  function handleSearchInput(value: string) {
    setSearchQuery(value);
    clearTimeout(searchDebounce);
    if (!value.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounce = window.setTimeout(async () => {
      try {
        setSearchResults(await searchTimeEntries(props.token, value.trim()));
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 200);
  }

  function goToDate(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    setSelectedDate(new Date(y, m - 1, d));
    closeSearch();
  }

  async function handleDeleteFromSearch(id: string) {
    try {
      await deleteTimeEntry(props.token, id);
      setSearchResults((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silent
    }
  }

  // ── Date navigation ──────────────────────────────────────────────────────

  function prevDay() {
    const d = new Date(selectedDate());
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  }

  function nextDay() {
    const d = new Date(selectedDate());
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  }

  async function handleDelete(id: string) {
    try {
      await deleteTimeEntry(props.token, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silent
    }
  }

  const totalSeconds = () => entries().reduce((sum, e) => sum + e.duration_seconds, 0);
  const isToday = () => toISODate(selectedDate()) === toISODate(todayDate());

  const syncTip = () => {
    if (props.syncing) return "Syncing…";
    if (!props.syncOnline) return "Offline";
    if (props.pendingCount > 0) return `${props.pendingCount} pending`;
    return "Synced";
  };

  return (
    <div class="flex h-screen overflow-hidden">

      {/* ── Icon sidebar ─────────────────────────────────────── */}
      <aside class="flex flex-col items-center w-14 bg-base-200 border-r border-base-300 py-3 shrink-0">
        {/* Logo */}
        <div class="mb-3 flex items-center justify-center">
          <i class="ri-timer-line text-xl text-primary" />
        </div>

        <div class="divider my-0 w-8" />

        {/* Nav */}
        <ul class="flex flex-col items-center gap-0.5 flex-1 mt-2 w-full px-1.5">
          {/* Time entries */}
          <li class="tooltip tooltip-right w-full" data-tip="Time Entries">
            <button
              class={`btn btn-ghost btn-square btn-sm w-full relative ${!searchMode() ? "bg-base-300 text-primary" : ""}`}
              onClick={closeSearch}
            >
              <i class="ri-time-line text-lg" />
              <Show when={props.timerRunning}>
                <span class="absolute top-0.5 right-0.5 w-2 h-2 bg-error rounded-full animate-pulse" />
              </Show>
            </button>
          </li>

          {/* Search */}
          <li class="tooltip tooltip-right w-full" data-tip="Search entries">
            <button
              class={`btn btn-ghost btn-square btn-sm w-full ${searchMode() ? "bg-base-300 text-primary" : ""}`}
              onClick={() => searchMode() ? closeSearch() : openSearch()}
            >
              <i class="ri-search-line text-lg" />
            </button>
          </li>
        </ul>

        {/* Bottom: sync + settings */}
        <div class="flex flex-col items-center gap-0.5 w-full px-1.5 mb-1">
          <div class="divider my-0 w-8" />

          <div class="tooltip tooltip-right w-full" data-tip={syncTip()}>
            <button
              class="btn btn-ghost btn-square btn-sm w-full relative"
              onClick={props.onSync}
              disabled={props.syncing}
            >
              <i class={`ri-refresh-line text-lg ${props.syncing ? "animate-spin" : ""}`} />
              <Show when={!props.syncing}>
                <span
                  class={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${
                    !props.syncOnline || props.pendingCount > 0 ? "bg-warning" : "bg-success"
                  }`}
                />
              </Show>
            </button>
          </div>

          <div class="tooltip tooltip-right w-full" data-tip="Settings">
            <button
              class="btn btn-ghost btn-square btn-sm w-full"
              onClick={() => setSettingsOpen(true)}
            >
              <i class="ri-settings-3-line text-lg" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main class="flex-1 overflow-y-auto">

        {/* === Date view === */}
        <Show when={!searchMode()}>
          <div class="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3">

            {/* Date nav */}
            <div class="flex items-center gap-1 bg-base-100 rounded-xl px-2 py-1.5 border border-base-300">
              <button class="btn btn-ghost btn-sm btn-square shrink-0" onClick={prevDay}>
                <i class="ri-arrow-left-s-line text-xl" />
              </button>
              <button
                class="flex-1 text-sm font-semibold text-primary flex items-center justify-center gap-1.5 hover:underline underline-offset-2 min-w-0 truncate"
                onClick={openCalendar}
              >
                {formatDate(selectedDate())}
                <i class="ri-calendar-line text-xs opacity-50 shrink-0" />
              </button>
              <button
                class="btn btn-ghost btn-sm btn-square shrink-0"
                onClick={nextDay}
                disabled={isToday()}
              >
                <i class="ri-arrow-right-s-line text-xl" />
              </button>
              <div class="w-px h-5 bg-base-300 mx-0.5 shrink-0" />
              <button
                class="btn btn-ghost btn-sm btn-square shrink-0 text-base-content/50"
                onClick={() => setSelectedDate(todayDate())}
                disabled={isToday()}
                title="Go to today"
              >
                <i class="ri-calendar-today-line text-base" />
              </button>
              <button
                class="btn btn-primary btn-sm btn-square shrink-0"
                onClick={() => props.onAdd(toISODate(selectedDate()))}
                title="Add entry"
              >
                <i class="ri-add-line text-lg" />
              </button>
            </div>

            {/* Total */}
            <Show when={entries().length > 0}>
              <div class="flex justify-between items-center px-1">
                <span class="text-xs text-base-content/40">
                  {entries().length} {entries().length === 1 ? "entry" : "entries"}
                </span>
                <span class="text-xs text-base-content/60">
                  Total: <span class="font-semibold text-base-content">{formatDuration(totalSeconds())}</span>
                </span>
              </div>
            </Show>

            {/* Timer card */}
            <Show when={props.timerRunning}>
              <div class="card bg-primary text-primary-content shadow-md">
                <div class="card-body p-4 flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <span class="badge badge-sm bg-error text-error-content border-0 animate-pulse shrink-0">
                      ● LIVE
                    </span>
                    <span class="font-mono text-2xl font-bold tabular-nums flex-1">
                      {formatTimer(props.timerSeconds)}
                      <span class="text-xs font-normal opacity-50 ml-2">{props.timerSeconds}s</span>
                    </span>
                    <button class="btn btn-sm btn-error gap-1 shrink-0" onClick={props.onStopTimer}>
                      <i class="ri-stop-fill" /> Stop
                    </button>
                    <button
                      class="btn btn-sm btn-ghost text-primary-content/70 btn-circle shrink-0"
                      onClick={props.onCancelTimer}
                    >
                      <i class="ri-close-line" />
                    </button>
                  </div>
                  <Show when={props.timerDraft?.task_name}>
                    <p class="text-sm text-primary-content/80 truncate">{props.timerDraft!.task_name}</p>
                  </Show>
                </div>
              </div>
            </Show>

            <Show when={loading()}>
              <div class="flex justify-center py-12">
                <span class="loading loading-spinner loading-md text-primary" />
              </div>
            </Show>

            <Show when={fetchError()}>
              <div class="alert alert-error text-sm">
                <i class="ri-error-warning-line" /> {fetchError()}
              </div>
            </Show>

            <Show when={!loading() && !fetchError() && entries().length === 0}>
              <div class="flex flex-col items-center justify-center py-16 gap-3 text-base-content/40">
                <i class="ri-time-line text-5xl" />
                <p class="text-sm">No entries for this day</p>
                <button
                  class="btn btn-primary btn-sm mt-1"
                  onClick={() => props.onAdd(toISODate(selectedDate()))}
                >
                  <i class="ri-add-line" /> Add entry
                </button>
              </div>
            </Show>

            <For each={entries()}>
              {(entry) => (
                <div class="card bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow">
                  <div class="card-body p-4 flex flex-row items-start gap-3">
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-sm truncate">{entry.task_name}</p>
                      <p class="text-xs text-base-content/50 mt-0.5">
                        {formatDuration(entry.duration_seconds)}
                        <span class="opacity-40 ml-1">({entry.duration_seconds}s)</span>
                      </p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <Show when={entry.sync_status !== "synced"}>
                        <span class="badge badge-sm badge-ghost opacity-50" title="Pending sync">●</span>
                      </Show>
                      <Show when={entry.overtime}>
                        <span class="badge badge-warning badge-sm">OT</span>
                      </Show>
                      <Show when={!props.timerRunning}>
                        <button
                          class="btn btn-ghost btn-xs btn-circle text-primary/60"
                          onClick={() => props.onRepeat(entry)}
                          title="Repeat today"
                        >
                          <i class="ri-repeat-line" />
                        </button>
                      </Show>
                      <button
                        class="btn btn-ghost btn-xs btn-circle text-base-content/50"
                        onClick={() => props.onEdit(entry)}
                        title="Edit"
                      >
                        <i class="ri-pencil-line" />
                      </button>
                      <button
                        class="btn btn-ghost btn-xs btn-circle text-error/60"
                        onClick={() => handleDelete(entry.id)}
                        title="Delete"
                      >
                        <i class="ri-delete-bin-line" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* === Search view === */}
        <Show when={searchMode()}>
          <div class="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3">

            {/* Search input */}
            <div class="flex items-center gap-2 bg-base-100 rounded-xl px-3 py-2 border border-base-300 focus-within:border-primary transition-colors">
              <i class="ri-search-line text-base-content/40 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search across all dates…"
                value={searchQuery()}
                onInput={(e) => handleSearchInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                class="flex-1 bg-transparent outline-none text-sm placeholder:text-base-content/30"
              />
              <Show when={searching()}>
                <span class="loading loading-spinner loading-xs text-primary shrink-0" />
              </Show>
              <Show when={searchQuery() !== "" && !searching()}>
                <button
                  class="btn btn-ghost btn-xs btn-circle shrink-0"
                  onClick={() => { setSearchQuery(""); setSearchResults([]); searchInputRef?.focus(); }}
                >
                  <i class="ri-close-line" />
                </button>
              </Show>
            </div>

            {/* Prompt when empty */}
            <Show when={searchQuery() === ""}>
              <div class="flex flex-col items-center justify-center py-16 gap-3 text-base-content/30">
                <i class="ri-search-2-line text-5xl" />
                <p class="text-sm">Type to search across all your time entries</p>
              </div>
            </Show>

            {/* No results */}
            <Show when={searchQuery() !== "" && !searching() && searchResults().length === 0}>
              <div class="flex flex-col items-center justify-center py-16 gap-3 text-base-content/40">
                <i class="ri-file-search-line text-5xl" />
                <p class="text-sm">
                  No entries matching <span class="font-semibold">"{searchQuery()}"</span>
                </p>
              </div>
            </Show>

            {/* Result count */}
            <Show when={searchResults().length > 0}>
              <div class="flex justify-between items-center px-1">
                <span class="text-xs text-base-content/40">
                  {searchResults().length} result{searchResults().length !== 1 ? "s" : ""}
                </span>
                <span class="text-xs text-base-content/30">click a date to jump to it</span>
              </div>
            </Show>

            {/* Search results */}
            <For each={searchResults()}>
              {(entry) => (
                <div class="card bg-base-100 shadow-sm border border-base-300 hover:shadow-md transition-shadow">
                  <div class="card-body p-4 flex flex-row items-start gap-3">
                    <div class="flex-1 min-w-0">
                      <p class="font-medium text-sm truncate">{entry.task_name}</p>
                      <div class="flex items-center gap-2 mt-1">
                        <button
                          class="text-xs text-base-content/50 bg-base-200 hover:bg-base-300 px-2 py-0.5 rounded-md transition-colors tabular-nums"
                          onClick={() => goToDate(entry.date)}
                          title="Jump to this date"
                        >
                          {formatSearchDate(entry.date)}
                        </button>
                        <span class="text-xs text-base-content/50">
                          {formatDuration(entry.duration_seconds)}
                        </span>
                      </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <Show when={entry.sync_status !== "synced"}>
                        <span class="badge badge-sm badge-ghost opacity-50">●</span>
                      </Show>
                      <Show when={entry.overtime}>
                        <span class="badge badge-warning badge-sm">OT</span>
                      </Show>
                      <button
                        class="btn btn-ghost btn-xs btn-circle text-base-content/50"
                        onClick={() => { goToDate(entry.date); props.onEdit(entry); }}
                        title="Edit"
                      >
                        <i class="ri-pencil-line" />
                      </button>
                      <button
                        class="btn btn-ghost btn-xs btn-circle text-error/60"
                        onClick={() => handleDeleteFromSearch(entry.id)}
                        title="Delete"
                      >
                        <i class="ri-delete-bin-line" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>

          </div>
        </Show>

      </main>

      {/* ── Settings panel ───────────────────────────────────── */}
      <Show when={settingsOpen()}>
        <div class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-black/20" onClick={() => setSettingsOpen(false)} />
          <div class="relative w-72 bg-base-100 h-full shadow-2xl flex flex-col border-l border-base-300">
            <div class="flex items-center justify-between px-5 py-4 border-b border-base-300">
              <p class="font-semibold">Settings</p>
              <button class="btn btn-ghost btn-square btn-sm" onClick={() => setSettingsOpen(false)}>
                <i class="ri-close-line text-lg" />
              </button>
            </div>

            <div class="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
              <p class="text-xs font-semibold text-base-content/40 uppercase tracking-wider px-2 mb-2">
                Appearance
              </p>
              <div class="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-base-200">
                <span class="text-sm font-medium flex items-center gap-2">
                  <i class="ri-palette-line text-base-content/50" />
                  Theme
                </span>
                <ThemeSelect />
              </div>
            </div>

            <div class="px-4 pb-4 flex flex-col gap-2">
              <p class="text-xs font-semibold text-base-content/40 uppercase tracking-wider px-2">Sync</p>
              <div class="flex items-center justify-between px-2 py-1 text-sm">
                <span class="flex items-center gap-1.5">
                  <Show when={!props.syncOnline}>
                    <span class="text-warning">●</span>
                    <span class="text-base-content/60">Offline</span>
                  </Show>
                  <Show when={props.syncOnline && props.pendingCount === 0}>
                    <span class="text-success">●</span>
                    <span class="text-base-content/60">Synced</span>
                  </Show>
                  <Show when={props.syncOnline && props.pendingCount > 0}>
                    <span class="text-warning">●</span>
                    <span class="text-base-content/60">{props.pendingCount} pending</span>
                  </Show>
                </span>
                <button
                  class="btn btn-ghost btn-xs gap-1"
                  onClick={props.onSync}
                  disabled={props.syncing}
                >
                  <i class={`ri-refresh-line ${props.syncing ? "animate-spin" : ""}`} />
                  {props.syncing ? "Syncing…" : "Sync now"}
                </button>
              </div>
              <Show when={props.lastSyncAt}>
                <p class="text-xs text-base-content/30 px-2">
                  Last sync: {new Date(props.lastSyncAt!).toLocaleTimeString()}
                </p>
              </Show>
            </div>

            <div class="p-4 border-t border-base-300">
              <button
                class="btn btn-ghost btn-block justify-start gap-2 text-error"
                onClick={() => { setSettingsOpen(false); props.onLogout(); }}
              >
                <i class="ri-logout-box-r-line" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ── Calendar modal ───────────────────────────────────── */}
      <Show when={calendarOpen()}>
        <div class="modal modal-open modal-middle">
          <div class="modal-box p-0 max-w-sm overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 bg-primary text-primary-content">
              <button class="btn btn-ghost btn-sm btn-circle text-primary-content" onClick={calendarPrevMonth}>
                <i class="ri-arrow-left-s-line text-lg" />
              </button>
              <span class="font-semibold text-sm">
                {calendarView().toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <button
                class="btn btn-ghost btn-sm btn-circle text-primary-content"
                onClick={calendarNextMonth}
                disabled={!calendarCanGoNext()}
              >
                <i class="ri-arrow-right-s-line text-lg" />
              </button>
            </div>

            <div class="grid grid-cols-7 text-center text-xs font-medium text-base-content/50 px-2 pt-3 pb-1">
              <For each={["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]}>
                {(d) => <span>{d}</span>}
              </For>
            </div>

            <div class="grid grid-cols-7 gap-y-1 px-2 pb-3">
              <For each={calendarDays()}>
                {(day) => (
                  <div class="flex items-center justify-center">
                    <Show when={day !== null} fallback={<span />}>
                      <button
                        class={`w-8 h-8 rounded-full text-sm transition-colors
                          ${isDaySelected(day!) ? "bg-primary text-primary-content font-bold" : ""}
                          ${isDayToday(day!) && !isDaySelected(day!) ? "border border-primary text-primary font-semibold" : ""}
                          ${isDayDisabled(day!) ? "opacity-25 cursor-not-allowed" : "hover:bg-base-200"}
                        `}
                        disabled={isDayDisabled(day!)}
                        onClick={() => setCalendarTemp(calendarDayDate(day!))}
                      >
                        {day}
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <div class="modal-action px-4 pb-4 pt-2 border-t border-base-200 m-0">
              <button class="btn btn-ghost btn-sm" onClick={() => setCalendarOpen(false)}>Cancel</button>
              <button
                class="btn btn-primary btn-sm"
                onClick={() => { setSelectedDate(new Date(calendarTemp())); setCalendarOpen(false); }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </Show>

    </div>
  );
}
