#[macro_use]
extern crate tracing;

use tauri::Manager;

mod db_commands;
mod models;
mod setup;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup::tracing();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(setup::get_database_pool(app));
            info!("SandQlock started");
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
