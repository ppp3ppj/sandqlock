import { createSignal, createEffect, For, Show } from "solid-js";
import {
  createTimeEntry,
  updateTimeEntry,
  listProjects,
  listCategories,
  TimeEntry,
  TimeEntryInput,
  Project,
  Category,
} from "../lib/local-api";

interface TimerDraft {
  task_name: string;
  project_id: string | null;
  category_id: string | null;
  overtime: boolean;
  date: string;
}

interface Props {
  token: string;
  entry: TimeEntry | null;
  date: string;
  initialDurationSeconds?: number;
  onBack: () => void;
  onSaved: () => void;
  onStartTimer?: (draft: TimerDraft) => void;
}

/* Bauhaus palette */
const RED    = "#E53935";
const YELLOW = "#FDD835";
const BLUE   = "#1E88E5";
const BLACK  = "#212121";
const WHITE  = "#FAFAFA";
const GRAY   = "#9E9E9E";
const LIGHT  = "#F5F5F5";
const BORDER = "#E0E0E0";

export default function TimeEntryFormPage(props: Props) {
  const [taskName, setTaskName] = createSignal("");
  const [durationMinutes, setDurationMinutes] = createSignal(30);
  const [date, setDate] = createSignal("");
  const [overtime, setOvertime] = createSignal(false);
  const [projectId, setProjectId] = createSignal<string>("");
  const [categoryId, setCategoryId] = createSignal<string>("");

  const [projects, setProjects] = createSignal<Project[]>([]);
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [loadingProjects, setLoadingProjects] = createSignal(false);
  const [loadingCategories, setLoadingCategories] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();

  createEffect(() => {
    setTaskName(props.entry?.task_name ?? "");
    const storedSeconds = props.entry?.duration_seconds ?? props.initialDurationSeconds;
    setDurationMinutes(storedSeconds !== undefined ? Math.round(storedSeconds / 60) || 1 : 30);
    setDate(props.entry?.date ?? props.date);
    setOvertime(props.entry?.overtime ?? false);
    setProjectId(props.entry?.project_id ?? "");
    setCategoryId(props.entry?.category_id ?? "");
    setError(undefined);
  });

  createEffect(() => {
    setLoadingProjects(true);
    listProjects(props.token)
      .then(setProjects)
      .catch((e) => console.error("[Form] listProjects failed:", e))
      .finally(() => setLoadingProjects(false));
  });

  createEffect(() => {
    const pid = projectId();
    setCategories([]);
    if (!pid) { setCategoryId(""); return; }
    setLoadingCategories(true);
    listCategories(props.token, pid)
      .then((cats) => {
        setCategories(cats);
        setCategoryId((prev) => (cats.some((c) => c.id === prev) ? prev : ""));
      })
      .catch((e) => console.error("[Form] listCategories failed:", e))
      .finally(() => setLoadingCategories(false));
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!taskName().trim()) { setError("Task name is required."); return; }
    if (durationMinutes() < 1) { setError("Duration must be at least 1 minute."); return; }
    setLoading(true); setError(undefined);
    try {
      const attrs: TimeEntryInput = {
        task_name: taskName().trim(),
        duration_seconds: durationMinutes() * 60,
        date: date(),
        overtime: overtime(),
        project_id: projectId() || null,
        category_id: categoryId() || null,
      };
      if (props.entry) await updateTimeEntry(props.token, props.entry.id, attrs);
      else await createTimeEntry(props.token, attrs);
      props.onSaved();
      props.onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleStartTimer() {
    if (!taskName().trim()) { setError("Task name is required."); return; }
    props.onStartTimer!({
      task_name: taskName().trim(),
      project_id: projectId() || null,
      category_id: categoryId() || null,
      overtime: overtime(),
      date: date(),
    });
  }

  const accentColor = () => props.entry ? BLUE : RED;

  return (
    <div class="flex h-screen overflow-hidden" style={`background:${WHITE}`}>

      {/* ── SIDEBAR ──────────────────────────────────────── */}
      <aside class="flex flex-col w-14 shrink-0" style={`background:${BLACK}`}>

        {/* Back button */}
        <div class="h-14 flex items-center justify-center"
             style={`border-bottom:1px solid #333`}>
          <button
            title="Back"
            onClick={props.onBack}
            class="w-9 h-9 flex items-center justify-center font-bold transition-colors"
            style={`background:transparent;border:1px solid #444;color:${WHITE};cursor:pointer`}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = WHITE}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "#444"}
          >
            ←
          </button>
        </div>

        {/* Page type indicator (geometric color block) */}
        <div class="flex-1 flex flex-col items-center justify-center gap-4 pb-8">
          {/* Circle: edit=blue, new=red */}
          <div class="w-8 h-8 rounded-full" style={`background:${accentColor()}`} />
          {/* Small square */}
          <div class="w-4 h-4" style={`background:${YELLOW}`} />
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────── */}
      <div class="flex-1 flex flex-col overflow-hidden">

        {/* Header strip with accent color */}
        <div class="h-12 flex items-center px-5 shrink-0"
             style={`border-bottom:3px solid ${accentColor()};background:${WHITE}`}>
          <h2 class="font-black text-sm uppercase tracking-widest" style={`color:${BLACK}`}>
            {props.entry ? "Edit Entry" : "New Entry"}
          </h2>
        </div>

        {/* Scrollable form */}
        <div class="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit}>

            {/* Form fields as full-width rows */}
            <div class="px-6 pt-6 pb-4 flex flex-col gap-7">

              {/* Task name */}
              <div>
                <label class="bh-label">Task Name</label>
                <input
                  type="text"
                  class="bh-input"
                  placeholder="What did you work on?"
                  value={taskName()}
                  onInput={(e) => setTaskName(e.currentTarget.value)}
                  autofocus
                />
              </div>

              {/* Duration */}
              <div>
                <label class="bh-label">Duration (minutes)</label>
                <input
                  type="number"
                  class="bh-input"
                  min={1}
                  value={durationMinutes()}
                  onInput={(e) => setDurationMinutes(parseInt(e.currentTarget.value) || 1)}
                />
              </div>

              {/* Date */}
              <div>
                <label class="bh-label">Date</label>
                <input
                  type="date"
                  class="bh-input"
                  value={date()}
                  onInput={(e) => setDate(e.currentTarget.value)}
                />
              </div>

              {/* Project */}
              <div>
                <label class="bh-label flex items-center gap-2">
                  Project
                  <Show when={loadingProjects()}>
                    <div class="w-3 h-3 rounded-full animate-spin" style={`border:1.5px solid ${BORDER};border-top-color:${BLUE}`} />
                  </Show>
                </label>
                <select
                  class="bh-select"
                  onChange={(e) => setProjectId(e.currentTarget.value)}
                  disabled={loadingProjects()}
                >
                  <option value="" selected={projectId() === ""}>— No project —</option>
                  <For each={projects()}>
                    {(p) => <option value={p.id} selected={projectId() === p.id}>{p.name}</option>}
                  </For>
                </select>
              </div>

              {/* Category */}
              <Show when={projectId()}>
                <div>
                  <label class="bh-label flex items-center gap-2">
                    Category
                    <Show when={loadingCategories()}>
                      <div class="w-3 h-3 rounded-full animate-spin" style={`border:1.5px solid ${BORDER};border-top-color:${BLUE}`} />
                    </Show>
                  </label>
                  <select
                    class="bh-select"
                    onChange={(e) => setCategoryId(e.currentTarget.value)}
                    disabled={loadingCategories()}
                  >
                    <option value="" selected={categoryId() === ""}>— No category —</option>
                    <For each={categories()}>
                      {(c) => <option value={c.id} selected={categoryId() === c.id}>{c.name}</option>}
                    </For>
                  </select>
                </div>
              </Show>

              {/* Overtime toggle */}
              <div>
                <label class="bh-label">Overtime</label>
                <button
                  type="button"
                  class="flex items-center gap-3 py-2 transition-opacity"
                  style="background:transparent;border:none;cursor:pointer;padding-left:0"
                  onClick={() => setOvertime(v => !v)}
                >
                  {/* Square checkbox — Bauhaus square, not circle */}
                  <div class="w-5 h-5 flex items-center justify-center"
                       style={overtime()
                         ? `background:${RED};border:2px solid ${RED}`
                         : `background:transparent;border:2px solid ${BLACK}`}>
                    <Show when={overtime()}>
                      <span style={`color:${WHITE};font-size:11px;font-weight:900;line-height:1`}>✓</span>
                    </Show>
                  </div>
                  <span class="font-bold text-sm uppercase tracking-wide"
                        style={`color:${overtime() ? RED : BLACK}`}>
                    {overtime() ? "Yes — overtime" : "No — regular hours"}
                  </span>
                </button>
              </div>

              {/* Error */}
              <Show when={error()}>
                <div class="py-3 px-4 text-sm font-bold"
                     style={`background:${RED};color:${WHITE};border-left:4px solid #B71C1C`}>
                  {error()}
                </div>
              </Show>

            </div>

            {/* Action bar — pinned at bottom */}
            <div class="px-6 pb-6 flex flex-col gap-3"
                 style={`border-top:1px solid ${BORDER};padding-top:20px`}>
              <Show when={!props.entry && props.onStartTimer}>
                <button
                  type="button"
                  class="bh-btn bh-btn-lg w-full"
                  style={`background:${LIGHT};color:${BLACK};border:1px solid ${BORDER}`}
                  onClick={handleStartTimer}
                  disabled={loading()}
                >
                  <i class="ri-timer-line" /> Start Timer
                </button>
              </Show>

              <button
                type="submit"
                class="bh-btn bh-btn-lg w-full"
                style={`background:${accentColor()};color:${WHITE}`}
                disabled={loading()}
              >
                {loading()
                  ? <div class="w-4 h-4 rounded-full animate-spin" style={`border:2px solid rgba(255,255,255,0.3);border-top-color:${WHITE}`} />
                  : props.entry ? "Save Changes" : "Save Entry"}
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}
