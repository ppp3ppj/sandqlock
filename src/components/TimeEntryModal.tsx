import { createSignal, createEffect, Show } from "solid-js";
import { createTimeEntry, updateTimeEntry, TimeEntry, TimeEntryInput } from "../lib/qlock-api";

interface Props {
  show: boolean;
  entry: TimeEntry | null;
  date: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function TimeEntryModal(props: Props) {
  const [taskName, setTaskName] = createSignal("");
  const [durationMinutes, setDurationMinutes] = createSignal(30);
  const [date, setDate] = createSignal("");
  const [overtime, setOvertime] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();

  createEffect(() => {
    if (props.show) {
      setTaskName(props.entry?.task_name ?? "");
      setDurationMinutes(props.entry?.duration_minutes ?? 30);
      setDate(props.entry?.date ?? props.date);
      setOvertime(props.entry?.overtime ?? false);
      setError(undefined);
    }
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
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Show when={props.show}>
      <div class="modal modal-open">
        <div class="modal-box w-full max-w-sm">
          <h3 class="font-bold text-lg mb-4">
            {props.entry ? "Edit Entry" : "Add Entry"}
          </h3>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">
            {/* Task name */}
            <label class="form-control w-full">
              <div class="label pb-1">
                <span class="label-text text-xs font-medium">Task name</span>
              </div>
              <input
                type="text"
                class="input input-bordered w-full"
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
                class="input input-bordered w-full"
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
                class="input input-bordered w-full"
                value={date()}
                onInput={(e) => setDate(e.currentTarget.value)}
              />
            </label>

            {/* Overtime */}
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
                checked={overtime()}
                onChange={(e) => setOvertime(e.currentTarget.checked)}
              />
              <span class="text-sm">Overtime</span>
            </label>

            {/* Error */}
            <Show when={error()}>
              <div class="alert alert-error py-2 text-sm">
                <i class="ri-error-warning-line" />
                {error()}
              </div>
            </Show>

            <div class="modal-action mt-2">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={props.onClose}
                disabled={loading()}
              >
                Cancel
              </button>
              <button type="submit" class="btn btn-primary btn-sm" disabled={loading()}>
                {loading() ? <span class="loading loading-spinner loading-xs" /> : "Save"}
              </button>
            </div>
          </form>
        </div>
        <div class="modal-backdrop" onClick={props.onClose} />
      </div>
    </Show>
  );
}
