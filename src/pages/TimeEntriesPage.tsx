import { createSignal, createEffect, For, Show } from "solid-js";
import { listTimeEntries, searchTimeEntries, deleteTimeEntry, TimeEntry } from "../lib/local-api";
import { theme, setTheme, type Theme } from "../theme";

interface TimerDraft { task_name: string }

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

/* ── Bauhaus palette ─────────────────────────────────── */
const RED    = "#E53935";
const YELLOW = "#FDD835";
const BLUE   = "#1E88E5";
const BLACK  = "#212121";
const WHITE  = "#FAFAFA";
const GRAY   = "#9E9E9E";
const LIGHT  = "#F5F5F5";
const BORDER = "#E0E0E0";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function formatDate(d: Date) {
  const day = DAYS[d.getDay()].toUpperCase().slice(0,3);
  const mon = MONTHS[d.getMonth()].toUpperCase();
  return `${d.getDate()} ${mon} ${d.getFullYear()} · ${day}`;
}
function formatSearchDate(dateStr: string) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const date = new Date(y, m-1, d);
  const today = todayDate();
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "TODAY";
  if (diff === 1) return "YESTERDAY";
  if (diff < 7) return DAYS[date.getDay()].toUpperCase().slice(0,3);
  return `${d} ${MONTHS[m-1].toUpperCase().slice(0,3)}`;
}
function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h > 0) return sec > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${h}h ${m}m` : `${h}h`;
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}
function formatTimer(s: number) {
  const p = (n: number) => String(n).padStart(2,"0");
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return h > 0 ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
function todayDate() {
  const d = new Date(); d.setHours(0,0,0,0); return d;
}

export default function TimeEntriesPage(props: Props) {
  const [selectedDate, setSelectedDate] = createSignal<Date>(todayDate());
  const [entries, setEntries] = createSignal<TimeEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [fetchError, setFetchError] = createSignal<string | undefined>();
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  const [searchMode, setSearchMode] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [searchResults, setSearchResults] = createSignal<TimeEntry[]>([]);
  const [searching, setSearching] = createSignal(false);
  let searchDebounce = 0;
  let searchInputRef: HTMLInputElement | undefined;

  const [calendarOpen, setCalendarOpen] = createSignal(false);
  const [calendarView, setCalendarView] = createSignal(new Date());
  const [calendarTemp, setCalendarTemp] = createSignal(new Date());

  function openCalendar() {
    const d = selectedDate();
    setCalendarView(new Date(d.getFullYear(), d.getMonth(), 1));
    setCalendarTemp(new Date(d));
    setCalendarOpen(true);
  }
  const canGoNext = () =>
    new Date(calendarView().getFullYear(), calendarView().getMonth()+1, 1) <= todayDate();
  function calDays(): (number|null)[] {
    const d = calendarView();
    const dow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const max = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return [...Array(dow).fill(null), ...Array.from({length:max},(_,i)=>i+1)];
  }
  const calDayDate = (day: number) => new Date(calendarView().getFullYear(), calendarView().getMonth(), day);
  const isDisabled = (day: number) => calDayDate(day) > todayDate();
  const isSelected = (day: number) => toISODate(calDayDate(day)) === toISODate(calendarTemp());
  const isToday2  = (day: number) => toISODate(calDayDate(day)) === toISODate(todayDate());

  async function fetchEntries(date: Date) {
    setLoading(true); setFetchError(undefined);
    try { setEntries(await listTimeEntries(props.token, toISODate(date))); }
    catch (err) { setFetchError(err instanceof Error ? err.message : "Failed."); }
    finally { setLoading(false); }
  }
  createEffect(() => { void props.refreshKey; fetchEntries(selectedDate()); });

  function openSearch() {
    setSearchMode(true); setSearchQuery(""); setSearchResults([]);
    setTimeout(() => searchInputRef?.focus(), 0);
  }
  function closeSearch() {
    setSearchMode(false); setSearchQuery(""); setSearchResults([]);
    clearTimeout(searchDebounce);
  }
  function handleSearchInput(value: string) {
    setSearchQuery(value); clearTimeout(searchDebounce);
    if (!value.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchDebounce = window.setTimeout(async () => {
      try { setSearchResults(await searchTimeEntries(props.token, value.trim())); }
      catch { /* silent */ }
      finally { setSearching(false); }
    }, 200);
  }
  function goToDate(dateStr: string) {
    const [y,m,d] = dateStr.split("-").map(Number);
    setSelectedDate(new Date(y, m-1, d)); closeSearch();
  }
  function prevDay() { const d = new Date(selectedDate()); d.setDate(d.getDate()-1); setSelectedDate(d); }
  function nextDay() { const d = new Date(selectedDate()); d.setDate(d.getDate()+1); setSelectedDate(d); }
  async function handleDelete(id: string) {
    try { await deleteTimeEntry(props.token, id); setEntries(p => p.filter(e => e.id !== id)); }
    catch { /* silent */ }
  }
  async function handleDeleteFromSearch(id: string) {
    try { await deleteTimeEntry(props.token, id); setSearchResults(p => p.filter(e => e.id !== id)); }
    catch { /* silent */ }
  }

  const totalSeconds = () => entries().reduce((s,e) => s + e.duration_seconds, 0);
  const isToday = () => toISODate(selectedDate()) === toISODate(todayDate());
  const syncDot = () => !props.syncOnline || props.pendingCount > 0 ? YELLOW : "#43A047";
  const syncTip = () => props.syncing ? "Syncing…" : !props.syncOnline ? "Offline" : props.pendingCount > 0 ? `${props.pendingCount} pending` : "Synced";

  return (
    <div class="flex h-screen overflow-hidden" style={`background:${WHITE}`}>

      {/* ── SIDEBAR — Bauhaus black column ───────────────── */}
      <aside class="flex flex-col w-14 shrink-0" style={`background:${BLACK}`}>

        {/* Logo: red circle */}
        <div class="h-14 flex items-center justify-center"
             style={`border-bottom:1px solid #333`}>
          <div class="w-9 h-9 rounded-full flex items-center justify-center"
               style={`background:${RED}`}>
            <i class="ri-timer-line text-base" style={`color:${WHITE}`} />
          </div>
        </div>

        {/* Navigation */}
        <div class="flex-1 flex flex-col pt-2">

          {/* Time Entries */}
          <button
            title="Time Entries"
            onClick={closeSearch}
            class="relative h-12 flex items-center justify-center transition-opacity"
            style="background:transparent;border:none;cursor:pointer"
          >
            {/* Active: yellow left stripe */}
            <Show when={!searchMode()}>
              <div class="absolute left-0 top-2 bottom-2 w-[3px]"
                   style={`background:${YELLOW}`} />
            </Show>
            <i class="ri-time-line text-lg"
               style={`color:${!searchMode() ? WHITE : GRAY};transition:color 0.15s`} />
            {/* Timer running indicator */}
            <Show when={props.timerRunning}>
              <div class="absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse"
                   style={`background:${RED}`} />
            </Show>
          </button>

          {/* Search */}
          <button
            title="Search all entries"
            onClick={() => searchMode() ? closeSearch() : openSearch()}
            class="relative h-12 flex items-center justify-center transition-opacity"
            style="background:transparent;border:none;cursor:pointer"
          >
            <Show when={searchMode()}>
              <div class="absolute left-0 top-2 bottom-2 w-[3px]"
                   style={`background:${BLUE}`} />
            </Show>
            <i class="ri-search-line text-lg"
               style={`color:${searchMode() ? BLUE : GRAY};transition:color 0.15s`} />
          </button>
        </div>

        {/* Bottom: sync + settings */}
        <div class="flex flex-col pb-3" style={`border-top:1px solid #333`}>
          <button
            title={syncTip()}
            onClick={props.onSync}
            disabled={props.syncing}
            class="h-11 flex items-center justify-center gap-1.5"
            style="background:transparent;border:none;cursor:pointer;opacity:0.8"
          >
            <div class="w-2 h-2 rounded-full" style={`background:${syncDot()}`} />
            <i class={`ri-refresh-line text-base ${props.syncing ? "animate-spin" : ""}`}
               style={`color:${GRAY}`} />
          </button>

          <button
            title="Settings"
            onClick={() => setSettingsOpen(true)}
            class="h-11 flex items-center justify-center"
            style="background:transparent;border:none;cursor:pointer"
          >
            <i class="ri-settings-3-line text-base" style={`color:${GRAY}`} />
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <div class="flex-1 flex flex-col overflow-hidden">

        {/* === DATE VIEW === */}
        <Show when={!searchMode()}>

          {/* Date navigation header */}
          <div class="flex items-center h-12 shrink-0 px-2"
               style={`border-bottom:2px solid ${BLACK};background:${WHITE}`}>
            <button
              class="w-9 h-9 flex items-center justify-center transition-colors"
              style="background:transparent;border:none;cursor:pointer"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              onClick={prevDay}
            >
              <i class="ri-arrow-left-s-line text-xl" style={`color:${BLACK}`} />
            </button>

            <button
              class="flex-1 text-center font-bold text-sm uppercase tracking-wide hover:opacity-70 transition-opacity"
              style={`color:${BLACK};background:transparent;border:none;cursor:pointer;letter-spacing:0.08em`}
              onClick={openCalendar}
            >
              {formatDate(selectedDate())}
            </button>

            <button
              class="w-9 h-9 flex items-center justify-center transition-colors"
              style="background:transparent;border:none;cursor:pointer"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              onClick={nextDay}
              disabled={isToday()}
            >
              <i class="ri-arrow-right-s-line text-xl"
                 style={`color:${isToday() ? GRAY : BLACK}`} />
            </button>

            <div class="flex items-center gap-1 ml-1 shrink-0">
              {/* Today: yellow circle */}
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center transition-opacity"
                style={`background:${YELLOW};border:none;cursor:pointer`}
                onClick={() => setSelectedDate(todayDate())}
                disabled={isToday()}
                title="Go to today"
              >
                <i class="ri-calendar-today-line text-xs" style={`color:${BLACK}`} />
              </button>

              {/* Add: black square */}
              <button
                class="w-8 h-8 flex items-center justify-center transition-opacity"
                style={`background:${BLACK};border:none;cursor:pointer`}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.8"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                onClick={() => props.onAdd(toISODate(selectedDate()))}
                title="Add entry"
              >
                <i class="ri-add-line text-lg" style={`color:${WHITE}`} />
              </button>
            </div>
          </div>

          {/* Summary bar */}
          <Show when={entries().length > 0}>
            <div class="flex items-center justify-between px-4 h-8 shrink-0"
                 style={`background:${LIGHT};border-bottom:1px solid ${BORDER}`}>
              <span class="text-xs font-bold uppercase tracking-widest" style={`color:${GRAY}`}>
                {entries().length} {entries().length === 1 ? "entry" : "entries"}
              </span>
              <span class="font-mono font-bold text-xs" style={`color:${BLACK}`}>
                {formatDuration(totalSeconds())}
              </span>
            </div>
          </Show>

          {/* Scrollable content */}
          <div class="flex-1 overflow-y-auto">

            {/* Timer block: full-width red */}
            <Show when={props.timerRunning}>
              <div style={`background:${RED}`}>
                <div class="px-5 py-4 flex flex-col gap-3">
                  {/* Recording indicator */}
                  <div class="flex items-center gap-2">
                    <div class="w-2 h-2 rounded-full animate-pulse" style={`background:${WHITE}`} />
                    <span class="text-xs font-bold uppercase tracking-widest"
                          style={`color:rgba(255,255,255,0.6)`}>
                      Recording
                    </span>
                  </div>

                  {/* Big timer */}
                  <div class="font-mono font-black text-5xl leading-none" style={`color:${WHITE}`}>
                    {formatTimer(props.timerSeconds)}
                  </div>

                  <Show when={props.timerDraft?.task_name}>
                    <p class="text-sm font-semibold uppercase tracking-wide truncate"
                       style={`color:rgba(255,255,255,0.75)`}>
                      {props.timerDraft!.task_name}
                    </p>
                  </Show>

                  <div class="flex gap-2">
                    <button
                      class="bh-btn"
                      style={`background:${WHITE};color:${RED}`}
                      onClick={props.onStopTimer}
                    >
                      Stop
                    </button>
                    <button
                      class="bh-btn bh-btn-outline"
                      style={`color:${WHITE}`}
                      onClick={props.onCancelTimer}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </Show>

            {/* Loading */}
            <Show when={loading()}>
              <div class="flex justify-center py-16">
                <div class="w-8 h-8 rounded-full animate-spin"
                     style={`border:3px solid ${BORDER};border-top-color:${BLUE}`} />
              </div>
            </Show>

            {/* Error */}
            <Show when={fetchError()}>
              <div class="px-5 py-4 text-sm font-bold"
                   style={`background:${RED};color:${WHITE}`}>
                {fetchError()}
              </div>
            </Show>

            {/* Empty state */}
            <Show when={!loading() && !fetchError() && entries().length === 0}>
              <div class="flex flex-col items-center justify-center py-20 gap-6">
                {/* Geometric Bauhaus triangle pointing up */}
                <div class="flex flex-col items-center gap-4">
                  <div class="w-16 h-16 rounded-full flex items-center justify-center"
                       style={`background:${LIGHT};border:1px solid ${BORDER}`}>
                    <i class="ri-time-line text-3xl" style={`color:${GRAY}`} />
                  </div>
                  <p class="text-xs font-bold uppercase tracking-widest" style={`color:${GRAY}`}>
                    No entries
                  </p>
                </div>
                <button
                  class="bh-btn"
                  style={`background:${BLACK};color:${WHITE}`}
                  onClick={() => props.onAdd(toISODate(selectedDate()))}
                >
                  + Add Entry
                </button>
              </div>
            </Show>

            {/* Entry rows */}
            <For each={entries()}>
              {(entry) => (
                <div
                  class="flex items-center group"
                  style={`border-bottom:1px solid ${BORDER};border-left:3px solid ${BLUE};background:${WHITE};transition:background 0.12s ease`}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = WHITE}
                >
                  <div class="flex-1 min-w-0 px-4 py-3">
                    <p class="font-semibold text-sm truncate" style={`color:${BLACK}`}>
                      {entry.task_name}
                    </p>
                    <p class="font-mono text-xs mt-0.5" style={`color:${GRAY}`}>
                      {formatDuration(entry.duration_seconds)}
                      <span class="ml-1" style={`color:${BORDER}`}>({entry.duration_seconds}s)</span>
                    </p>
                  </div>

                  {/* Right: badges + actions */}
                  <div class="flex items-center gap-2 px-3 shrink-0">
                    <Show when={entry.sync_status !== "synced"}>
                      <div class="w-2 h-2 rounded-full" style={`background:${YELLOW}`} title="Pending sync" />
                    </Show>
                    <Show when={entry.overtime}>
                      <span class="text-xs font-bold uppercase tracking-wide" style={`color:${RED}`}>OT</span>
                    </Show>

                    {/* Actions — fade in on hover */}
                    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <Show when={!props.timerRunning}>
                        <button
                          class="w-7 h-7 flex items-center justify-center transition-colors"
                          style="background:transparent;border:none;cursor:pointer"
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                          onClick={() => props.onRepeat(entry)}
                          title="Repeat today"
                        >
                          <i class="ri-repeat-line text-sm" style={`color:${GRAY}`} />
                        </button>
                      </Show>
                      <button
                        class="w-7 h-7 flex items-center justify-center transition-colors"
                        style="background:transparent;border:none;cursor:pointer"
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        onClick={() => props.onEdit(entry)}
                        title="Edit"
                      >
                        <i class="ri-pencil-line text-sm" style={`color:${GRAY}`} />
                      </button>
                      <button
                        class="w-7 h-7 flex items-center justify-center transition-colors"
                        style="background:transparent;border:none;cursor:pointer"
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FFEBEE"; }}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        onClick={() => handleDelete(entry.id)}
                        title="Delete"
                      >
                        <i class="ri-delete-bin-line text-sm" style={`color:${RED}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>

          </div>
        </Show>

        {/* === SEARCH VIEW === */}
        <Show when={searchMode()}>

          {/* Search input header */}
          <div class="flex items-center h-12 shrink-0 px-4 gap-3"
               style={`border-bottom:2px solid ${BLUE};background:${WHITE}`}>
            <i class="ri-search-line text-lg shrink-0" style={`color:${BLUE}`} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search all entries..."
              value={searchQuery()}
              onInput={(e) => handleSearchInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              class="flex-1 bg-transparent font-bold text-sm uppercase tracking-wide"
              style={`border:none;outline:none;color:${BLACK};letter-spacing:0.06em`}
            />
            <Show when={searching()}>
              <div class="w-4 h-4 rounded-full animate-spin shrink-0"
                   style={`border:2px solid ${BORDER};border-top-color:${BLUE}`} />
            </Show>
            <Show when={searchQuery() !== "" && !searching()}>
              <button
                class="w-6 h-6 flex items-center justify-center text-xs font-bold"
                style={`background:${BLACK};color:${WHITE};border:none;cursor:pointer`}
                onClick={() => { setSearchQuery(""); setSearchResults([]); searchInputRef?.focus(); }}
              >
                ✕
              </button>
            </Show>
          </div>

          {/* Search content */}
          <div class="flex-1 overflow-y-auto">

            <Show when={searchQuery() === ""}>
              <div class="flex flex-col items-center justify-center py-20 gap-4">
                {/* Blue circle — Bauhaus geometric */}
                <div class="w-16 h-16 rounded-full flex items-center justify-center"
                     style={`background:${BLUE}`}>
                  <i class="ri-search-2-line text-2xl" style={`color:${WHITE}`} />
                </div>
                <p class="text-xs font-bold uppercase tracking-widest" style={`color:${GRAY}`}>
                  Type to search all entries
                </p>
              </div>
            </Show>

            <Show when={searchQuery() !== "" && !searching() && searchResults().length === 0}>
              <div class="flex flex-col items-center justify-center py-20 gap-4">
                <div class="w-16 h-16 rounded-full flex items-center justify-center"
                     style={`background:${LIGHT};border:1px solid ${BORDER}`}>
                  <i class="ri-file-search-line text-2xl" style={`color:${GRAY}`} />
                </div>
                <p class="text-xs font-bold uppercase tracking-widest" style={`color:${GRAY}`}>
                  No results found
                </p>
              </div>
            </Show>

            {/* Result count */}
            <Show when={searchResults().length > 0}>
              <div class="flex items-center justify-between px-4 h-8"
                   style={`background:${LIGHT};border-bottom:1px solid ${BORDER}`}>
                <span class="text-xs font-bold uppercase tracking-widest" style={`color:${GRAY}`}>
                  {searchResults().length} result{searchResults().length !== 1 ? "s" : ""}
                </span>
              </div>
            </Show>

            <For each={searchResults()}>
              {(entry) => (
                <div
                  class="flex items-center group"
                  style={`border-bottom:1px solid ${BORDER};border-left:3px solid ${BLUE};background:${WHITE};transition:background 0.12s ease`}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = WHITE}
                >
                  <div class="flex-1 min-w-0 px-4 py-3">
                    <p class="font-semibold text-sm truncate" style={`color:${BLACK}`}>
                      {entry.task_name}
                    </p>
                    <div class="flex items-center gap-2 mt-0.5">
                      <button
                        class="text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 transition-opacity hover:opacity-70"
                        style={`background:${YELLOW};color:${BLACK};border:none;cursor:pointer`}
                        onClick={() => goToDate(entry.date)}
                      >
                        {formatSearchDate(entry.date)}
                      </button>
                      <span class="font-mono text-xs" style={`color:${GRAY}`}>
                        {formatDuration(entry.duration_seconds)}
                      </span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 px-3 shrink-0">
                    <Show when={entry.overtime}>
                      <span class="text-xs font-bold uppercase tracking-wide" style={`color:${RED}`}>OT</span>
                    </Show>
                    <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button
                        class="w-7 h-7 flex items-center justify-center"
                        style="background:transparent;border:none;cursor:pointer"
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = LIGHT}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        onClick={() => { goToDate(entry.date); props.onEdit(entry); }}
                        title="Edit"
                      >
                        <i class="ri-pencil-line text-sm" style={`color:${GRAY}`} />
                      </button>
                      <button
                        class="w-7 h-7 flex items-center justify-center"
                        style="background:transparent;border:none;cursor:pointer"
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#FFEBEE"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                        onClick={() => handleDeleteFromSearch(entry.id)}
                        title="Delete"
                      >
                        <i class="ri-delete-bin-line text-sm" style={`color:${RED}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* ── SETTINGS PANEL ───────────────────────────────── */}
      <Show when={settingsOpen()}>
        <div class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0" style="background:rgba(33,33,33,0.4)"
               onClick={() => setSettingsOpen(false)} />
          <div class="relative w-72 flex flex-col" style={`background:${WHITE};border-left:3px solid ${BLACK}`}>

            {/* Black header */}
            <div class="h-12 flex items-center justify-between px-5"
                 style={`background:${BLACK}`}>
              <span class="text-xs font-bold uppercase tracking-widest" style={`color:${WHITE}`}>
                Settings
              </span>
              <button
                class="w-7 h-7 flex items-center justify-center text-sm font-bold transition-colors"
                style={`background:transparent;border:1px solid #555;color:${WHITE};cursor:pointer`}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = WHITE; (e.currentTarget as HTMLElement).style.color = BLACK; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = WHITE; }}
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </button>
            </div>

            <div class="flex-1 overflow-y-auto">

              {/* Appearance section */}
              <div class="px-5 py-5" style={`border-bottom:1px solid ${BORDER}`}>
                <p class="bh-label mb-4">Appearance</p>
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold uppercase tracking-wide" style={`color:${BLACK}`}>Theme</span>
                  <select
                    class="bh-select"
                    style="width:auto;min-width:90px"
                    value={theme()}
                    onChange={(e) => setTheme(e.currentTarget.value as Theme)}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>

              {/* Sync section */}
              <div class="px-5 py-5">
                <p class="bh-label mb-4">Sync</p>
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full" style={`background:${syncDot()}`} />
                    <span class="text-xs font-bold uppercase tracking-wide" style={`color:${BLACK}`}>
                      <Show when={!props.syncOnline}>Offline</Show>
                      <Show when={props.syncOnline && props.pendingCount === 0}>Synced</Show>
                      <Show when={props.syncOnline && props.pendingCount > 0}>{props.pendingCount} pending</Show>
                    </span>
                  </div>
                  <button
                    class="bh-btn"
                    style={`background:${BLACK};color:${WHITE}`}
                    onClick={props.onSync}
                    disabled={props.syncing}
                  >
                    <i class={`ri-refresh-line text-xs ${props.syncing ? "animate-spin" : ""}`} />
                    {props.syncing ? "Syncing" : "Sync"}
                  </button>
                </div>
                <Show when={props.lastSyncAt}>
                  <p class="font-mono text-xs" style={`color:${GRAY}`}>
                    {new Date(props.lastSyncAt!).toLocaleTimeString()}
                  </p>
                </Show>
              </div>
            </div>

            {/* Logout */}
            <div class="px-5 py-5" style={`border-top:1px solid ${BORDER}`}>
              <button
                class="bh-btn bh-btn-lg w-full"
                style={`background:${RED};color:${WHITE}`}
                onClick={() => { setSettingsOpen(false); props.onLogout(); }}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ── CALENDAR MODAL ───────────────────────────────── */}
      <Show when={calendarOpen()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center"
             style="background:rgba(33,33,33,0.5)">
          <div style={`background:${WHITE};width:320px`}>

            {/* Month header: black */}
            <div class="h-12 flex items-center justify-between px-4"
                 style={`background:${BLACK}`}>
              <button
                class="w-8 h-8 flex items-center justify-center font-bold text-sm"
                style={`background:transparent;border:1px solid #555;color:${WHITE};cursor:pointer`}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#333"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { const d = calendarView(); setCalendarView(new Date(d.getFullYear(), d.getMonth()-1, 1)); }}
              >←</button>
              <span class="text-xs font-bold uppercase tracking-widest" style={`color:${WHITE}`}>
                {calendarView().toLocaleString("default",{month:"long",year:"numeric"}).toUpperCase()}
              </span>
              <button
                class="w-8 h-8 flex items-center justify-center font-bold text-sm"
                style={`background:transparent;border:1px solid #555;color:${WHITE};cursor:pointer`}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#333"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                onClick={() => { const d = calendarView(); const n = new Date(d.getFullYear(), d.getMonth()+1, 1); if (n <= todayDate()) setCalendarView(n); }}
                disabled={!canGoNext()}
              >→</button>
            </div>

            {/* Day headers */}
            <div class="grid grid-cols-7 text-center px-3 pt-4 pb-2">
              <For each={["S","M","T","W","T","F","S"]}>
                {(d) => <span class="text-xs font-bold uppercase" style={`color:${GRAY}`}>{d}</span>}
              </For>
            </div>

            {/* Day grid */}
            <div class="grid grid-cols-7 gap-y-1 px-3 pb-4">
              <For each={calDays()}>
                {(day) => (
                  <div class="flex items-center justify-center h-9">
                    <Show when={day !== null} fallback={<span />}>
                      <button
                        class="w-9 h-9 flex items-center justify-center text-sm font-bold transition-colors"
                        style={
                          isSelected(day!)
                            ? `background:${RED};color:${WHITE};border:none;cursor:pointer`
                            : isToday2(day!)
                              ? `background:${YELLOW};color:${BLACK};border:none;cursor:pointer`
                              : isDisabled(day!)
                                ? `background:transparent;color:${BORDER};border:none;cursor:not-allowed`
                                : `background:transparent;color:${BLACK};border:none;cursor:pointer`
                        }
                        onMouseEnter={e => { if (!isDisabled(day!) && !isSelected(day!)) (e.currentTarget as HTMLElement).style.background = LIGHT; }}
                        onMouseLeave={e => {
                          if (isSelected(day!)) (e.currentTarget as HTMLElement).style.background = RED;
                          else if (isToday2(day!)) (e.currentTarget as HTMLElement).style.background = YELLOW;
                          else (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                        disabled={isDisabled(day!)}
                        onClick={() => setCalendarTemp(calDayDate(day!))}
                      >
                        {day}
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            {/* Actions */}
            <div class="flex gap-2 px-4 pb-4" style={`border-top:1px solid ${BORDER};padding-top:12px`}>
              <button class="bh-btn flex-1" style={`background:${LIGHT};color:${BLACK}`}
                      onClick={() => setCalendarOpen(false)}>
                Cancel
              </button>
              <button
                class="bh-btn flex-1"
                style={`background:${BLACK};color:${WHITE}`}
                onClick={() => { setSelectedDate(new Date(calendarTemp())); setCalendarOpen(false); }}
              >
                Confirm
              </button>
            </div>

          </div>
        </div>
      </Show>

    </div>
  );
}
