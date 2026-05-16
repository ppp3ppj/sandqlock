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
  initialDuration?: number;
  onBack: () => void;
  onSaved: () => void;
  onStartTimer?: (draft: TimerDraft) => void;
}

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

  // Populate form fields when entry changes
  createEffect(() => {
    setTaskName(props.entry?.task_name ?? "");
    setDurationMinutes(props.entry?.duration_minutes ?? props.initialDuration ?? 30);
    setDate(props.entry?.date ?? props.date);
    setOvertime(props.entry?.overtime ?? false);
    setProjectId(props.entry?.project_id ?? "");
    setCategoryId(props.entry?.category_id ?? "");
    setError(undefined);
  });

  // Load projects on mount
  createEffect(() => {
    setLoadingProjects(true);
    listProjects(props.token)
      .then(setProjects)
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  });

  // Load categories when project changes
  createEffect(() => {
    const pid = projectId();
    setCategories([]);
    if (!pid) {
      setCategoryId("");
      return;
    }
    setLoadingCategories(true);
    listCategories(props.token, pid)
      .then((cats) => {
        setCategories(cats);
        // Keep current category only if it belongs to the loaded list; otherwise clear
        setCategoryId((prev) => (cats.some((c) => c.id === prev) ? prev : ""));
      })
      .catch(() => {})
      .finally(() => setLoadingCategories(false));
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!taskName().trim()) {
      setError("Task name is required.");
      return;
    }
    if (durationMinutes() < 1) {
      setError("Duration must be at least 1 minute.");
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const attrs: TimeEntryInput = {
        task_name: taskName().trim(),
        duration_minutes: durationMinutes(),
        date: date(),
        overtime: overtime(),
        project_id: projectId() || null,
        category_id: categoryId() || null,
      };
      if (props.entry) {
        await updateTimeEntry(props.token, props.entry.id, attrs);
      } else {
        await createTimeEntry(props.token, attrs);
      }
      props.onSaved();
      props.onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleStartTimer() {
    if (!taskName().trim()) {
      setError("Task name is required.");
      return;
    }
    props.onStartTimer!({
      task_name: taskName().trim(),
      project_id: projectId() || null,
      category_id: categoryId() || null,
      overtime: overtime(),
      date: date(),
    });
  }

  return (
    <div class="flex flex-col min-h-screen bg-base-200">
      {/* Header */}
      <div class="navbar bg-primary text-primary-content px-4 shadow">
        <div class="flex-none">
          <button class="btn btn-ghost btn-sm btn-circle text-primary-content" onClick={props.onBack}>
            <i class="ri-arrow-left-line text-xl" />
          </button>
        </div>
        <div class="flex-1 px-2">
          <span class="font-bold text-base">
            {props.entry ? "Edit Entry" : "New Entry"}
          </span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} class="flex flex-col gap-4 p-4">
        {/* Task name */}
        <label class="form-control w-full">
          <div class="label pb-1">
            <span class="label-text text-xs font-medium">Task name</span>
          </div>
          <input
            type="text"
            class="input input-bordered w-full bg-base-100"
            placeholder="What did you work on?"
            value={taskName()}
            onInput={(e) => setTaskName(e.currentTarget.value)}
            autofocus
          />
        </label>

        {/* Duration */}
        <label class="form-control w-full">
          <div class="label pb-1">
            <span class="label-text text-xs font-medium">Duration (minutes)</span>
          </div>
          <input
            type="number"
            class="input input-bordered w-full bg-base-100"
            min={1}
            value={durationMinutes()}
            onInput={(e) => setDurationMinutes(parseInt(e.currentTarget.value) || 1)}
          />
        </label>

        {/* Date */}
        <label class="form-control w-full">
          <div class="label pb-1">
            <span class="label-text text-xs font-medium">Date</span>
          </div>
          <input
            type="date"
            class="input input-bordered w-full bg-base-100"
            value={date()}
            onInput={(e) => setDate(e.currentTarget.value)}
          />
        </label>

        {/* Project */}
        <label class="form-control w-full">
          <div class="label pb-1">
            <span class="label-text text-xs font-medium">Project</span>
            <Show when={loadingProjects()}>
              <span class="loading loading-spinner loading-xs text-primary" />
            </Show>
          </div>
          <select
            class="select select-bordered w-full bg-base-100"
            onChange={(e) => setProjectId(e.currentTarget.value)}
            disabled={loadingProjects()}
          >
            <option value="" selected={projectId() === ""}>— No project —</option>
            <For each={projects()}>
              {(p) => <option value={p.id} selected={projectId() === p.id}>{p.name}</option>}
            </For>
          </select>
        </label>

        {/* Category — only shown when a project is selected */}
        <Show when={projectId()}>
          <label class="form-control w-full">
            <div class="label pb-1">
              <span class="label-text text-xs font-medium">Category</span>
              <Show when={loadingCategories()}>
                <span class="loading loading-spinner loading-xs text-primary" />
              </Show>
            </div>
            <select
              class="select select-bordered w-full bg-base-100"
              onChange={(e) => setCategoryId(e.currentTarget.value)}
              disabled={loadingCategories()}
            >
              <option value="" selected={categoryId() === ""}>— No category —</option>
              <For each={categories()}>
                {(c) => <option value={c.id} selected={categoryId() === c.id}>{c.name}</option>}
              </For>
            </select>
          </label>
        </Show>

        {/* Overtime */}
        <label class="flex items-center gap-3 cursor-pointer select-none bg-base-100 rounded-lg px-4 py-3">
          <input
            type="checkbox"
            class="checkbox checkbox-sm checkbox-primary"
            checked={overtime()}
            onChange={(e) => setOvertime(e.currentTarget.checked)}
          />
          <span class="text-sm font-medium">Overtime</span>
        </label>

        {/* Error */}
        <Show when={error()}>
          <div class="alert alert-error py-2 text-sm">
            <i class="ri-error-warning-line" />
            {error()}
          </div>
        </Show>

        {/* Actions */}
        <Show when={!props.entry && props.onStartTimer}>
          <button
            type="button"
            class="btn btn-outline btn-primary w-full"
            onClick={handleStartTimer}
            disabled={loading()}
          >
            <i class="ri-timer-line" /> Start Timer
          </button>
        </Show>

        <button
          type="submit"
          class="btn btn-primary w-full"
          disabled={loading()}
        >
          {loading() ? <span class="loading loading-spinner loading-sm" /> : "Save"}
        </button>
      </form>
    </div>
  );
}
