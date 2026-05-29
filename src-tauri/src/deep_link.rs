use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Payload for `deeplink:start` — forwarded to the SolidJS frontend.
#[derive(Debug, Clone, Serialize)]
pub struct StartPayload {
    pub task: String,
    pub project_name: Option<String>,
    pub category_name: Option<String>,
}

/// Parse one deep-link URL and emit the appropriate frontend event.
///
/// Supported URLs:
///   sandqlock://start?task=Meeting
///   sandqlock://start?task=Code+review&project=Alpha&category=Backend
///   sandqlock://stop
///   sandqlock://new          (open new-entry form)
///   sandqlock://new?task=X   (form with pre-filled task name)
///   sandqlock://show          (bring window to front)
pub fn handle(app: &AppHandle, url_str: &str) {
    let Ok(url) = url::Url::parse(url_str) else {
        warn!("deep-link: could not parse URL: {url_str}");
        return;
    };

    let command = url.host_str().unwrap_or("");
    info!("deep-link: {command}  ({url_str})");

    match command {
        // ── sandqlock://start?task=...&project=...&category=... ──────────────
        "start" => {
            let mut task = None;
            let mut project_name = None;
            let mut category_name = None;

            for (key, value) in url.query_pairs() {
                match key.as_ref() {
                    "task"     => task          = Some(value.into_owned()),
                    "project"  => project_name  = Some(value.into_owned()),
                    "category" => category_name = Some(value.into_owned()),
                    _          => {}
                }
            }

            let Some(task) = task.filter(|t| !t.is_empty()) else {
                warn!("deep-link: start requires a non-empty `task` parameter");
                return;
            };

            show_window(app);
            let _ = app.emit(
                "deeplink:start",
                StartPayload { task, project_name, category_name },
            );
        }

        // ── sandqlock://stop ─────────────────────────────────────────────────
        "stop" => {
            let _ = app.emit("deeplink:stop", ());
        }

        // ── sandqlock://new?task=Meeting ─────────────────────────────────────
        "new" => {
            let task: Option<String> = url
                .query_pairs()
                .find(|(k, _)| k == "task")
                .map(|(_, v)| v.into_owned())
                .filter(|t| !t.is_empty());

            show_window(app);
            let _ = app.emit("deeplink:new", task);
        }

        // ── sandqlock://show ─────────────────────────────────────────────────
        "show" => {
            show_window(app);
        }

        other => {
            warn!("deep-link: unknown command `{other}` — ignoring");
        }
    }
}

fn show_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
