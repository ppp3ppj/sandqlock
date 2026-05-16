import { createSignal, createEffect, For, Show } from "solid-js";
import { listTimeEntries, deleteTimeEntry, TimeEntry } from "../lib/qlock-api";
import ThemeSelect from "../ThemeSelect";

interface TimerDraft {
  task_name: string;
}

interface Props {
  token: string;
  onLogout: () => void;
  onAdd: (date: string) => void;
  onEdit: (entry: TimeEntry) => void;
  onStartTimer: () => void;
  onStopTimer: () => void;
  onCancelTimer: () => void;
  timerRunning: boolean;
  timerSeconds: number;
  timerDraft: TimerDraft | null;
  secsCache: Record<string, number>;
  refreshKey: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date): string {
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  const label = isWeekend ? "Weekend" : DAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} [${label}]`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function formatTimer(s: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
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
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  // Calendar picker state
  const [calendarOpen, setCalendarOpen] = createSignal(false);
  const [calendarView, setCalendarView] = createSignal(new Date()); // month being shown
  const [calendarTemp, setCalendarTemp] = createSignal(new Date()); // pending selection

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

  const calendarCanGoNext = () => {
    const d = calendarView();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1) <= todayDate();
  };

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
  const isDayToday   = (day: number) => toISODate(calendarDayDate(day)) === toISODate(todayDate());

  async function fetchEntries(date: Date) {
    setLoading(true);
    setFetchError(undefined);
    try {
      const data = await listTimeEntries(props.token, toISODate(date));
      setEntries(data);
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

  const totalMinutes = () => entries().reduce((sum, e) => sum + e.duration_minutes, 0);
  const isToday = () => toISODate(selectedDate()) === toISODate(todayDate());

  return (
    <div class="drawer min-h-screen">
      {/* Drawer toggle */}
      <input
        id="sidebar-drawer"
        type="checkbox"
        class="drawer-toggle"
        checked={sidebarOpen()}
        onChange={(e) => setSidebarOpen(e.currentTarget.checked)}
      />

      {/* Main content */}
      <div class="drawer-content flex flex-col min-h-screen bg-base-200">

        {/* Top navbar */}
        <div class="navbar bg-primary text-primary-content px-4 shadow">
          <div class="flex-none">
            <label
              for="sidebar-drawer"
              class="btn btn-ghost btn-sm btn-circle text-primary-content cursor-pointer"
              title="Menu"
            >
              <i class="ri-menu-line text-xl" />
            </label>
          </div>
          <div class="flex-1 px-2">
            <span class="font-bold text-lg tracking-tight">SandQlock</span>
          </div>
          <div class="flex-none">
            <button
              class="btn btn-ghost btn-sm btn-circle text-primary-content"
              onClick={() => props.onAdd(toISODate(selectedDate()))}
              title="Add entry"
            >
              <i class="ri-add-line text-xl" />
            </button>
          </div>
        </div>

        {/* Date navigation */}
        <div class="flex items-center justify-between px-4 py-3 bg-base-100 border-b border-base-200">
          <button class="btn btn-ghost btn-sm btn-circle" onClick={prevDay}>
            <i class="ri-arrow-left-s-line text-xl" />
          </button>
          <button
            class="text-sm font-semibold text-primary flex items-center gap-1 hover:underline underline-offset-2"
            onClick={openCalendar}
            title="Jump to date"
          >
            {formatDate(selectedDate())}
            <i class="ri-calendar-line text-xs opacity-50" />
          </button>
          <button
            class="btn btn-ghost btn-sm btn-circle"
            onClick={nextDay}
            disabled={isToday()}
          >
            <i class="ri-arrow-right-s-line text-xl" />
          </button>
        </div>

        {/* Total summary bar */}
        <Show when={entries().length > 0}>
          <div class="px-4 py-2 bg-base-100 border-b border-base-200 flex justify-end">
            <span class="text-xs text-base-content/60">
              Total: <span class="font-semibold text-base-content">{formatDuration(totalMinutes())}</span>
            </span>
          </div>
        </Show>

        {/* Entry list */}
        <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">

          {/* Live timer card */}
          <Show when={props.timerRunning}>
            <div class="card bg-primary text-primary-content shadow-md">
              <div class="card-body p-3 flex flex-col gap-2">
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
                    title="Cancel timer"
                  >
                    <i class="ri-close-line" />
                  </button>
                </div>
                <Show when={props.timerDraft?.task_name}>
                  <p class="text-sm text-primary-content/80 truncate pl-1">
                    {props.timerDraft!.task_name}
                  </p>
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
              <i class="ri-error-warning-line" />
              {fetchError()}
            </div>
          </Show>

          <Show when={!loading() && !fetchError() && entries().length === 0}>
            <div class="flex flex-col items-center justify-center py-16 gap-2 text-base-content/40">
              <i class="ri-time-line text-4xl" />
              <p class="text-sm">No entries for this day</p>
              <button class="btn btn-primary btn-sm mt-2" onClick={() => props.onAdd(toISODate(selectedDate()))}>
                <i class="ri-add-line" /> Add entry
              </button>
            </div>
          </Show>

          <For each={entries()}>
            {(entry) => (
              <div class="card bg-base-100 shadow-sm border border-base-200">
                <div class="card-body p-4 flex flex-row items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm truncate">{entry.task_name}</p>
                    <p class="text-xs text-base-content/60 mt-0.5">
                      {formatDuration(entry.duration_minutes)}
                      <span class="opacity-40 ml-1">
                        {props.secsCache[entry.id] !== undefined
                          ? `(${props.secsCache[entry.id]}s)`
                          : `(${entry.duration_minutes}m)`}
                      </span>
                    </p>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <Show when={entry.overtime}>
                      <span class="badge badge-warning badge-sm">OT</span>
                    </Show>
                    <button
                      class="btn btn-ghost btn-xs btn-circle text-base-content/60"
                      onClick={() => props.onEdit(entry)}
                      title="Edit"
                    >
                      <i class="ri-pencil-line" />
                    </button>
                    <button
                      class="btn btn-ghost btn-xs btn-circle text-error/70"
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

        {/* Bottom bar */}
        <div class="btm-nav btm-nav-sm bg-base-100 border-t border-base-200">
          <button class="text-primary" onClick={() => setSelectedDate(todayDate())}>
            <i class="ri-calendar-today-line text-base" />
            <span class="btm-nav-label text-xs">Today</span>
          </button>
          <button
            class={props.timerRunning ? "text-error" : "text-base-content/60"}
            onClick={props.timerRunning ? () => {} : props.onStartTimer}
            title={props.timerRunning ? "Timer running" : "Start timer"}
          >
            <i class={`ri-timer-line text-base ${props.timerRunning ? "animate-pulse" : ""}`} />
            <span class="btm-nav-label text-xs">{props.timerRunning ? "Running" : "Timer"}</span>
          </button>
        </div>
        {/* Calendar modal */}
        <Show when={calendarOpen()}>
          <div class="modal modal-open modal-middle">
            <div class="modal-box p-0 max-w-sm overflow-hidden">

              {/* Month header */}
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

              {/* Day-of-week headers */}
              <div class="grid grid-cols-7 text-center text-xs font-medium text-base-content/50 px-2 pt-3 pb-1">
                <For each={["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]}>
                  {(d) => <span>{d}</span>}
                </For>
              </div>

              {/* Day grid */}
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

              {/* Actions */}
              <div class="modal-action px-4 pb-4 pt-2 border-t border-base-200 m-0">
                <button class="btn btn-ghost btn-sm" onClick={() => setCalendarOpen(false)}>
                  Cancel
                </button>
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

      {/* Sidebar */}
      <div class="drawer-side z-50">
        <label for="sidebar-drawer" aria-label="close sidebar" class="drawer-overlay" />
        <div class="bg-base-100 w-72 min-h-full flex flex-col shadow-2xl">

          {/* Sidebar header */}
          <div class="bg-primary text-primary-content px-5 py-4">
            <p class="font-bold text-lg tracking-tight">SandQlock</p>
            <p class="text-xs text-primary-content/60 mt-0.5">Settings</p>
          </div>

          {/* Settings section */}
          <div class="flex-1 p-4 flex flex-col gap-1">
            <p class="text-xs font-semibold text-base-content/40 uppercase tracking-wider px-2 mb-2">
              Appearance
            </p>
            <div class="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-base-200">
              <span class="text-sm font-medium flex items-center gap-2">
                <i class="ri-palette-line text-base-content/60" />
                Theme
              </span>
              <ThemeSelect />
            </div>
          </div>

          {/* Logout at bottom */}
          <div class="p-4 border-t border-base-200">
            <button
              class="btn btn-ghost btn-block justify-start gap-2 text-error"
              onClick={() => { setSidebarOpen(false); props.onLogout(); }}
            >
              <i class="ri-logout-box-r-line" />
              Logout
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
