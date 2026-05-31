/**
 * Real-time nudge notifications via tauri-plugin-websocket.
 *
 * Connects to qlock's raw WebSocket transport:
 *   ws://localhost:4000/ws/notifications?token=<jwt>
 *
 * Server sends: {"type": "nudge", "message": "..."}
 * Client shows OS notification and calls the onNudge callback.
 *
 * No database. Nudge arrives → popup fires instantly.
 */

import WebSocket from "@tauri-apps/plugin-websocket";
import { invoke } from "@tauri-apps/api/core";

// Phoenix appends /websocket to the socket path for WebSocket upgrades
const WS_URL = "ws://localhost:4000/ws/notifications/websocket";
const RECONNECT_DELAY_MS = 5_000;

let ws: Awaited<ReturnType<typeof WebSocket.connect>> | null = null;
let reconnectTimer = 0;
let stopped = false;

export async function connectWsNotifications(
  token: string,
  onNudge: (message: string) => void,
): Promise<void> {
  stopped = false;
  await tryConnect(token, onNudge);
}

export function disconnectWsNotifications(): void {
  stopped = true;
  clearTimeout(reconnectTimer);
  ws?.disconnect().catch(() => {});
  ws = null;
}

async function tryConnect(
  token: string,
  onNudge: (message: string) => void,
): Promise<void> {
  if (stopped) return;

  try {
    ws = await WebSocket.connect(
      `${WS_URL}?token=${encodeURIComponent(token)}`,
    );

    ws.addListener((msg) => {
      console.log("[SandQlock] WS message received:", msg);

      // tauri-plugin-websocket message shape: { type: "Text"|"Binary"|"Close", data: string }
      if (msg.type === "Text") {
        try {
          const payload = JSON.parse(msg.data as string) as {
            type: string;
            message: string;
          };
          console.log("[SandQlock] WS parsed payload:", payload);

          if (payload.type === "nudge") {
            onNudge(payload.message);
            console.log("[SandQlock] Calling show_notification...");
            // Show native OS notification
            invoke("show_notification", {
              title: "SandQlock — Reminder",
              body: payload.message,
            })
              .then(() => console.log("[SandQlock] Notification shown ✓"))
              .catch((err) => console.error("[SandQlock] show_notification failed:", err));
          }
        } catch (err) {
          console.error("[SandQlock] Failed to parse WS message:", err, msg.data);
        }
      }

      // Reconnect on server close
      if (msg.type === "Close") {
        console.log("[SandQlock] WS closed, will reconnect...");
        ws = null;
        scheduleReconnect(token, onNudge);
      }
    });

    console.log("[SandQlock] WebSocket notification connected");
  } catch (err) {
    console.error("[SandQlock] WebSocket connection failed:", err);
    scheduleReconnect(token, onNudge);
  }
}

function scheduleReconnect(token: string, onNudge: (msg: string) => void) {
  if (stopped) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(
    () => tryConnect(token, onNudge),
    RECONNECT_DELAY_MS,
  );
}
