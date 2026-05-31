/**
 * GhostWindow — always-on-top frameless nudge overlay.
 *
 * Rendered when App.tsx detects ?ghost=1 in the URL.
 * Fetches the message from Rust state via invoke("get_ghost_message").
 * Dismisses itself via invoke("close_ghost_window").
 *
 * Drag region on the header lets the user move it around the screen.
 */

import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

const BLACK  = "#212121";
const YELLOW = "#FDD835";
const RED    = "#E53935";
const WHITE  = "#FAFAFA";
const BORDER = "#E0E0E0";

export default function GhostWindow() {
  const [message, setMessage] = createSignal("Loading…");
  const [dismissed, setDismissed] = createSignal(false);

  onMount(async () => {
    const msg = await invoke<string | null>("get_ghost_message").catch(() => null);
    setMessage(msg ?? "You have a reminder from your manager.");
  });

  async function dismiss() {
    setDismissed(true);
    await invoke("close_ghost_window").catch(() => {});
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        "flex-direction": "column",
        background: YELLOW,
        border: `3px solid ${BLACK}`,
        "box-shadow": `6px 6px 0 ${BLACK}`,
        "overflow": "hidden",
        "user-select": "none",
        "font-family": '"Arial", "Helvetica", sans-serif',
        opacity: dismissed() ? "0.5" : "1",
        transition: "opacity 0.1s",
      }}
    >
      {/* ── Drag region header ─── */}
      <div
        data-tauri-drag-region
        style={{
          background: BLACK,
          padding: "8px 12px",
          display: "flex",
          "align-items": "center",
          gap: "8px",
          cursor: "move",
          "flex-shrink": "0",
        }}
      >
        {/* Red dot indicator */}
        <div style={{ width: "8px", height: "8px", background: RED, "flex-shrink": "0" }} />
        <span
          style={{
            color: WHITE,
            "font-size": "11px",
            "font-weight": "900",
            "text-transform": "uppercase",
            "letter-spacing": "0.1em",
            flex: "1",
          }}
        >
          SandQlock — Reminder
        </span>
        {/* Subtle drag hint */}
        <span style={{ color: "rgba(255,255,255,0.3)", "font-size": "10px" }}>drag to move</span>
      </div>

      {/* ── Message ─── */}
      <div
        style={{
          flex: "1",
          padding: "14px 16px",
          "font-size": "13px",
          "font-weight": "600",
          color: BLACK,
          "line-height": "1.55",
          "overflow-y": "auto",
        }}
      >
        {message()}
      </div>

      {/* ── Dismiss button ─── */}
      <div
        style={{
          "border-top": `2px solid ${BLACK}`,
          background: WHITE,
          padding: "10px 12px",
          "flex-shrink": "0",
        }}
      >
        <button
          onClick={dismiss}
          style={{
            width: "100%",
            background: BLACK,
            color: WHITE,
            border: "none",
            padding: "9px",
            "font-family": "inherit",
            "font-size": "11px",
            "font-weight": "900",
            "text-transform": "uppercase",
            "letter-spacing": "0.1em",
            cursor: "pointer",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = RED)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = BLACK)}
        >
          Got it ✓
        </button>
      </div>
    </div>
  );
}
