import { createSignal, createEffect, For, Show } from "solid-js";
import { listTimeEntries, deleteTimeEntry, TimeEntry } from "../lib/qlock-api";
import TimeEntryModal from "../components/TimeEntryModal";

interface Props {
  token: string;
  onLogout: () => void;
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
  const [showModal, setShowModal] = createSignal(false);
  const [editingEntry, setEditingEntry] = createSignal<TimeEntry | null>(null);

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

  function goToday() {
    setSelectedDate(todayDate());
  }

  function openAdd() {
    setEditingEntry(null);
    setShowModal(true);
  }

  function openEdit(entry: TimeEntry) {
    setEditingEntry(entry);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    try {
      await deleteTimeEntry(props.token, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // silent — could show a toast in future
    }
  }

  function handleSaved() {
    fetchEntries(selectedDate());
  }

  const totalMinutes = () => entries().reduce((sum, e) => sum + e.duration_minutes, 0);

  return (
    <div class="flex flex-col min-h-screen bg-base-200">
      {/* Top navbar */}
      <div class="navbar bg-primary text-primary-content px-4 shadow">
        <div class="flex-1">
          <span class="font-bold text-lg tracking-tight">SandQlock</span>
        </div>
        <div class="flex-none gap-1">
          <button class="btn btn-ghost btn-sm btn-circle text-primary-content" onClick={openAdd} title="Add entry">
            <i class="ri-add-line text-xl" />
          </button>
          <button class="btn btn-ghost btn-sm btn-circle text-primary-content" onClick={props.onLogout} title="Logout">
            <i class="ri-logout-box-r-line text-lg" />
          </button>
        </div>
      </div>

      {/* Date navigation */}
      <div class="flex items-center justify-between px-4 py-3 bg-base-100 border-b border-base-200">
        <button class="btn btn-ghost btn-sm btn-circle" onClick={prevDay}>
          <i class="ri-arrow-left-s-line text-xl" />
        </button>
        <span class="text-sm font-semibold text-primary">{formatDate(selectedDate())}</span>
        <button class="btn btn-ghost btn-sm btn-circle" onClick={nextDay}>
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

      {/* Content */}
      <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
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
            <button class="btn btn-primary btn-sm mt-2" onClick={openAdd}>
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
                  <p class="text-xs text-base-content/60 mt-0.5">{formatDuration(entry.duration_minutes)}</p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Show when={entry.overtime}>
                    <span class="badge badge-warning badge-sm">OT</span>
                  </Show>
                  <button
                    class="btn btn-ghost btn-xs btn-circle text-base-content/60"
                    onClick={() => openEdit(entry)}
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
        <button class="text-primary" onClick={goToday}>
          <i class="ri-calendar-today-line text-base" />
          <span class="btm-nav-label text-xs">Today</span>
        </button>
        <button class="text-base-content/40">
          <i class="ri-share-line text-base" />
          <span class="btm-nav-label text-xs">Share</span>
        </button>
      </div>

      <TimeEntryModal
        show={showModal()}
        entry={editingEntry()}
        date={toISODate(selectedDate())}
        token={props.token}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
