# SandQlock — Native Desktop Features

> These features use Tauri's native OS APIs and work at the OS level —
> they are not possible (or are much heavier) in a web browser or Electron app.

---

## 1. Global Keyboard Shortcut

### What it does
Press **`Ctrl+Shift+T`** (Windows / Linux) or **`Cmd+Shift+T`** (macOS)
from **any application** — browser, terminal, VS Code, anything —
to control the timer without switching windows.

### Behavior

| Timer state | Shortcut result |
|-------------|-----------------|
| **Not running** | SandQlock window comes to front, the **New Entry form opens** so you can type a task name and start tracking immediately |
| **Running** | Timer stops, entry is saved, **OS notification fires** with the duration logged |

### How to use it — step by step

**Start tracking from scratch:**

1. You are working in another app (browser, code editor, etc.)
2. Press `Ctrl+Shift+T`
3. SandQlock window appears in front
4. The New Entry form is open — type your task name
5. Click **Start Timer** — window can now be closed or minimized

**Stop and save from anywhere:**

1. Timer is already running (you see the live indicator in the tray)
2. Press `Ctrl+Shift+T` from any app
3. Timer stops, entry saved automatically
4. OS notification confirms: *"25m 43s logged: Daily standup"*
5. You never left your current app

---

### Changing the shortcut

Edit `src-tauri/src/lib.rs` — find this line:

```rust
.with_shortcut("CmdOrControl+Shift+T")
```

Replace with any combination. Examples:

```rust
.with_shortcut("CmdOrControl+Shift+Q")   // Ctrl/Cmd+Shift+Q
.with_shortcut("CmdOrControl+Alt+T")     // Ctrl/Cmd+Alt+T
.with_shortcut("F9")                     // Just F9
.with_shortcut("Alt+Shift+T")            // Alt+Shift+T
```

Rebuild after changing: `cargo tauri dev`

**Key names:** `CmdOrControl`, `Ctrl`, `Alt`, `Shift`, `Meta` (Win key / Cmd),
`F1`–`F12`, `A`–`Z`, `0`–`9`, `Space`, `Tab`, `Enter`, `Escape`

> **If the shortcut does not register:** Another app already owns that combination.
> Check System Settings → Keyboard Shortcuts. Common conflicts:
> `Ctrl+Shift+T` is "reopen closed tab" in many browsers.
> Use `CmdOrControl+Alt+T` as a safe fallback.

---

## 2. System Tray

### What it does
SandQlock lives in the OS system tray (Windows taskbar corner / macOS menu bar)
even when the main window is closed. The timer keeps running while the app is hidden.

### Tray icon location

| OS | Where to look |
|----|---------------|
| Windows | Bottom-right taskbar, click `^` to expand hidden icons |
| macOS | Top-right menu bar |
| Linux (GNOME) | May need GNOME Shell extension or `libayatana-appindicator` |

### Live tooltip (hover the tray icon)

| Timer state | Tooltip shows |
|-------------|---------------|
| Not running | `SandQlock` |
| Running | `⏱ 25:43  Daily standup` — updates every second |

### Tray right-click menu

```
Show SandQlock          ← brings main window to front
─────────────────
⏹  Stop Timer          ← saves entry, fires notification
✕  Cancel Timer         ← discards, resets to zero
─────────────────
Quit SandQlock          ← fully exits the app
```

### Closing the window does NOT quit

Clicking the **×** button hides the window — it does not exit the app.
The timer, sync loop, and shortcut listener all stay active.

To fully quit: right-click tray icon → **Quit SandQlock**

---

## 3. OS Notifications

### When they fire

| Event | Notification |
|-------|-------------|
| Timer stopped (saved) | **"SandQlock — Timer Saved"** / `"25m 43s logged: Daily standup"` |

Notifications use the native OS notification system:
- Windows: Action Center pop-up (bottom-right)
- macOS: Notification Center (top-right)
- Linux: Desktop notification daemon (libnotify)

### First run on macOS
macOS will ask for notification permission the first time.
Click **Allow** in the system prompt that appears.

If you missed it: **System Settings → Notifications → SandQlock → Allow**

---

## 4. Typical Workflow Using All Three Features

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  1.  Open SandQlock once to log in.                              │
│                                                                  │
│  2.  Close the window (× button) — app moves to system tray.    │
│                                                                  │
│  3.  Start a meeting / focus session.                            │
│      Press Ctrl+Shift+T from any app.                           │
│      SandQlock opens, form ready — type task, click Start Timer. │
│                                                                  │
│  4.  Close window again. Work normally.                          │
│      Hover tray icon anytime to see ⏱ 45:02  Team meeting.      │
│                                                                  │
│  5.  Meeting ends.                                               │
│      Option A: Press Ctrl+Shift+T again (never leave your app). │
│      Option B: Right-click tray → "⏹ Stop Timer".               │
│                                                                  │
│  6.  Notification: "47m 13s logged: Team meeting" ✓             │
│                                                                  │
│  7.  Repeat from step 3 for the next task.                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Troubleshooting

### Shortcut not working

1. Check if another app owns `Ctrl+Shift+T` — browser "reopen tab" is a common conflict
2. Change the shortcut string in `lib.rs` (see [Changing the shortcut](#changing-the-shortcut) above)
3. On Linux: some desktop environments require elevated permissions for global shortcuts
4. Restart SandQlock after changing the shortcut

### No tray icon on Linux

Install the AppIndicator library:

```bash
# Ubuntu / Debian
sudo apt install libayatana-appindicator3-dev

# Fedora
sudo dnf install libappindicator-gtk3

# Arch
sudo pacman -S libappindicator-gtk3
```

Then rebuild: `cargo tauri dev`

### Notifications not appearing

| OS | Fix |
|----|-----|
| macOS | System Settings → Notifications → SandQlock → set to **Alerts** or **Banners** |
| Windows | Settings → System → Notifications → SandQlock → **On** |
| Linux | Check that `notify-send` works in terminal: `notify-send "test" "hello"` |

### App does not stay in tray after closing (still quits)

This can happen on first build if the old binary is cached. Clean rebuild:

```bash
cargo tauri dev --force-reinstall
```

---

## 6. Implementation Files (for developers)

| File | What it does |
|------|-------------|
| `src-tauri/src/lib.rs` | Tray setup, global shortcut registration, window close → hide behavior |
| `src-tauri/src/db_commands.rs` | `update_tray_timer`, `set_tray_idle`, `show_notification`, `show_main_window` |
| `src/App.tsx` | `listen("shortcut:toggle-timer")`, `listen("tray:stop-timer")`, tray tooltip update loop |

### Event flow diagram

```
User presses Ctrl+Shift+T
        │
        ▼
Rust: tauri-plugin-global-shortcut fires
        │  emit("shortcut:toggle-timer")
        ▼
SolidJS: listen() in App.tsx receives event
        │
        ├─ timerRunning? ──Yes──▶ handleTimerStop()
        │                              │  invoke("set_tray_idle")
        │                              │  invoke("show_notification", { title, body })
        │                              └─ saves entry to SQLite → syncs
        │
        └─ Not running ──────────▶ invoke("show_main_window")
                                   setView("form")

─────────────────────────────────────────────

User right-clicks tray → "⏹ Stop Timer"
        │
        ▼
Rust: on_menu_event fires for id "stop"
        │  emit("tray:stop-timer")
        ▼
SolidJS: listen("tray:stop-timer") → handleTimerStop()
        │  (same as shortcut path above)

─────────────────────────────────────────────

Timer is running (every 1 second)
        │
        ▼
SolidJS: setInterval fires
        │  setTimerSeconds(s + 1)
        │  invoke("update_tray_timer", { seconds, task })
        ▼
Rust: app.tray_by_id("main").set_tooltip("⏱ 25:43  Daily standup")
```
