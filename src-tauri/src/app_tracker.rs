//! Passive app time tracker — polls the active window every 60 seconds
//! and records the seconds in SQLite. No user input required.
//!
//! Platform support:
//!   macOS   — osascript (asks Automation permission once on first use)
//!   Windows — winapi GetForegroundWindow + GetWindowText (no permission)
//!   Linux   — xdotool (X11); returns "Unknown" on Wayland

use sqlx::SqlitePool;

// ── Active window detection ───────────────────────────────────────────────────

/// Returns the name of the currently focused application, or None if detection fails.
pub fn get_active_app() -> Option<String> {
    #[cfg(target_os = "macos")]
    return macos_active_app();

    #[cfg(target_os = "windows")]
    return windows_active_app();

    #[cfg(target_os = "linux")]
    return linux_active_app();

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    None
}

// ── macOS ─────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn macos_active_app() -> Option<String> {
    // Asks for Automation permission the first time (system dialog).
    // After that, silent — no user interaction needed.
    let out = std::process::Command::new("osascript")
        .arg("-e")
        .arg(
            "tell application \"System Events\"\n\
               get name of first application process whose frontmost is true\n\
             end tell",
        )
        .output()
        .ok()?;

    if out.status.success() {
        String::from_utf8(out.stdout)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    }
}

// ── Windows ───────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn windows_active_app() -> Option<String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use winapi::um::{
        processthreadsapi::OpenProcess,
        psapi::GetModuleFileNameExW,
        winnt::PROCESS_QUERY_INFORMATION,
        winuser::{GetForegroundWindow, GetWindowThreadProcessId},
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() { return None; }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);

        let handle = OpenProcess(PROCESS_QUERY_INFORMATION, 0, pid);
        if handle.is_null() { return None; }

        let mut buf = vec![0u16; 512];
        let len = GetModuleFileNameExW(handle, std::ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32);
        winapi::um::handleapi::CloseHandle(handle);

        buf.truncate(len as usize);
        let path = OsString::from_wide(&buf).to_string_lossy().to_string();

        // Extract just the exe name without path or extension
        std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
    }
}

// ── Linux ─────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn linux_active_app() -> Option<String> {
    // Try xdotool first (X11)
    if let Some(name) = run_xdotool() {
        return Some(name);
    }
    // Fallback: xprop (also X11, more commonly pre-installed)
    if let Some(name) = run_xprop() {
        return Some(name);
    }
    // Wayland — blocked by design
    Some("Unknown (Wayland)".to_string())
}

#[cfg(target_os = "linux")]
fn run_xdotool() -> Option<String> {
    let out = std::process::Command::new("xdotool")
        .args(["getactivewindow", "getwindowname"])
        .output()
        .ok()?;
    if out.status.success() {
        String::from_utf8(out.stdout)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    }
}

#[cfg(target_os = "linux")]
fn run_xprop() -> Option<String> {
    // Get active window ID
    let id_out = std::process::Command::new("xprop")
        .args(["-root", "_NET_ACTIVE_WINDOW"])
        .output()
        .ok()?;
    let id_str = String::from_utf8(id_out.stdout).ok()?;
    let win_id = id_str.split_whitespace().last()?.to_string();

    // Get the window name
    let name_out = std::process::Command::new("xprop")
        .args(["-id", &win_id, "WM_NAME"])
        .output()
        .ok()?;
    let name_str = String::from_utf8(name_out.stdout).ok()?;

    // Parse: WM_NAME(STRING) = "My Window Title"
    name_str
        .split('=')
        .nth(1)
        .map(|s| s.trim().trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
}

// ── SQLite recording ──────────────────────────────────────────────────────────

/// Records a 60-second tick for `app_name` on today's date.
/// Uses INSERT OR IGNORE + UPDATE to upsert atomically.
pub async fn record_tick(pool: &SqlitePool, app_name: &str) {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let _ = sqlx::query(
        "INSERT INTO app_tracking (app_name, date, seconds)
         VALUES (?, ?, 60)
         ON CONFLICT(app_name, date) DO UPDATE SET
           seconds    = seconds + 60,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    )
    .bind(app_name)
    .bind(&today)
    .execute(pool)
    .await;
}

// ── Background poller ─────────────────────────────────────────────────────────

/// Spawns a background task inside Tauri's managed async runtime that
/// polls the active app every 60 seconds and records it to SQLite.
pub fn start(pool: SqlitePool) {
    // tauri::async_runtime::spawn works from sync setup() context —
    // tokio::spawn would panic because no reactor is running yet.
    tauri::async_runtime::spawn(async move {
        info!("App tracker started — polling every 60s");

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;

            if let Some(app) = get_active_app() {
                let skip = ["sandqlock", "Finder", "loginwindow", "Unknown (Wayland)"];
                if skip.iter().any(|s| app.to_lowercase().contains(&s.to_lowercase())) {
                    continue;
                }
                record_tick(&pool, &app).await;
                debug!("App tracker: +60s for '{app}'");
            }
        }
    });
}
