import { createSignal, createEffect, Show } from "solid-js";
import { createTimeEntry, updateTimeEntry, TimeEntry, TimeEntryInput } from "../lib/qlock-api";

interface Props {
  token: string;
  entry: TimeEntry | null;
  date: string;
  onBack: () => void;
  onSaved: () => void;
}

export default function TimeEntryFormPage(props: Props) {
  const [taskName, setTaskName] = createSignal("");
  const [durationMinutes, setDurationMinutes] = createSignal(30);
  const [date, setDate] = createSignal("");
  const [overtime, setOvertime] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();

  createEffect(() => {
    setTaskName(props.entry?.task_name ?? "");
    setDurationMinutes(props.entry?.duration_minutes ?? 30);
    setDate(props.entry?.date ?? props.date);
    setOvertime(props.entry?.overtime ?? false);
    setError(undefined);
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

        {/* Submit */}
        <button
          type="submit"
          class="btn btn-primary w-full mt-2"
          disabled={loading()}
        >
          {loading() ? <span class="loading loading-spinner loading-sm" /> : "Save"}
        </button>
      </form>
    </div>
  );
}
