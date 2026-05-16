use sqlx::migrate::Migrator;
use sqlx::SqlitePool;
use tauri::App;
use tracing_subscriber::prelude::*;
use tracing_subscriber::{fmt, EnvFilter};

const DATABASE_FILE_NAME: &str = "database.sqlite3";

pub fn tracing() {
    let fmt_layer = fmt::layer()
        .without_time()
        .with_line_number(true)
        .with_level(true)
        .with_target(true);

    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("trace"))
        .unwrap();

    tracing_subscriber::registry()
        .with(filter_layer)
        .with(fmt_layer)
        .init();
}

static MIGRATOR: Migrator = sqlx::migrate!("../migrations");

#[cfg(dev)]
pub fn get_database_pool(_app: &App) -> SqlitePool {
    trace!("Connecting to developer database");
    tauri::async_runtime::block_on(async {
        let pool = SqlitePool::connect(&format!("sqlite:../{DATABASE_FILE_NAME}?mode=rwc"))
            .await
            .expect("Failed to connect to developer database");
        MIGRATOR.run(&pool).await.expect("Failed to run migrations");
        pool
    })
}

#[cfg(not(dev))]
pub fn get_database_pool(app: &App) -> SqlitePool {
    use tauri::Manager;

    tauri::async_runtime::block_on(async {
        let app_data_dir = app.path().app_data_dir().unwrap();
        let app_data_dir = dunce::simplified(&app_data_dir).to_path_buf();
        let file_path = app_data_dir.join(DATABASE_FILE_NAME);
        trace!("App data dir: {app_data_dir:?}, database file: {file_path:?}");

        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

        let url = format!("sqlite:{}?mode=rwc", file_path.to_string_lossy());
        let pool = SqlitePool::connect(&url)
            .await
            .expect("Failed to connect to database");

        if let Err(error) = MIGRATOR.run(&pool).await {
            warn!("Migration failed, resetting database: {error}");
            std::fs::write(&file_path, "").expect("Failed to clear database file");
            let pool = SqlitePool::connect(&url)
                .await
                .expect("Failed to reconnect after reset");
            MIGRATOR.run(&pool).await.expect("Failed to run migrations after reset");
            return pool;
        }

        pool
    })
}
