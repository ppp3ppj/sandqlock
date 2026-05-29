#[macro_use]
extern crate tracing;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

mod db_commands;
mod models;
mod setup;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup::tracing();

    tauri::Builder::default()
        // ── Existing plugins ──────────────────────────────
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        // ── New: OS notifications ─────────────────────────
        .plugin(tauri_plugin_notification::init())
        // ── New: Global keyboard shortcut ─────────────────
        //    CmdOrControl+Shift+T from any app → toggle timer
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut("CmdOrControl+Shift+T")
                .expect("invalid shortcut string")
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("shortcut:toggle-timer", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            app.manage(setup::get_database_pool(app));

            // ── System tray ───────────────────────────────
            let show_item =
                MenuItem::with_id(app, "show", "Show SandQlock", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let stop_item =
                MenuItem::with_id(app, "stop", "⏹  Stop Timer", true, None::<&str>)?;
            let cancel_item =
                MenuItem::with_id(app, "cancel", "✕  Cancel Timer", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit SandQlock", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&show_item, &sep1, &stop_item, &cancel_item, &sep2, &quit_item],
            )?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("SandQlock")
                // Menu item clicks → emit events to frontend
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "stop" => {
                        let _ = app.emit("tray:stop-timer", ());
                    }
                    "cancel" => {
                        let _ = app.emit("tray:cancel-timer", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                // Left-click tray icon → show main window
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Hide to tray on window close (don't quit) ─
            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                    }
                });
            }

            info!(
                "SandQlock started — tray active, global shortcut: CmdOrControl+Shift+T"
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_commands::list_time_entries,
            db_commands::search_time_entries,
            db_commands::get_weekly_summary,
            db_commands::create_time_entry,
            db_commands::update_time_entry,
            db_commands::delete_time_entry,
            db_commands::list_projects,
            db_commands::list_categories,
            db_commands::trigger_sync,
            db_commands::get_sync_status,
            // ── Tray + notification commands ───────────────
            db_commands::update_tray_timer,
            db_commands::set_tray_idle,
            db_commands::show_notification,
            db_commands::show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
