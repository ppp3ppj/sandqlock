use sea_orm::{DatabaseConnection, SqlxSqliteConnector};
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
pub fn get_database_pool(_app: &App) -> DatabaseConnection {
    trace!("Connecting to developer database");
    tauri::async_runtime::block_on(async {
        let pool = SqlitePool::connect(&format!("sqlite:../{DATABASE_FILE_NAME}?mode=rwc"))
            .await
            .unwrap();

        MIGRATOR
            .run(&pool)
            .await
            .expect("Failed to run database migrations");

        SqlxSqliteConnector::from_sqlx_sqlite_pool(pool)
    })
}

#[cfg(not(dev))]
pub fn get_database_pool(app: &App) -> DatabaseConnection {
    use tauri::Manager;

    tauri::async_runtime::block_on(async {
        // app_data_dir() returns the app-scoped dir e.g.
        // C:\Users\<user>\AppData\Roaming\com.ppp3ppj.sandqlock
        let app_data_dir = app.path().app_data_dir().unwrap();

        // Tauri path resolver returns UNC path on Windows (\\?\...).
        // dunce::simplified converts it to a regular path.
        // See https://github.com/tauri-apps/tauri/issues/5850
        let app_data_dir = dunce::simplified(&app_data_dir).to_path_buf();
        let file_path = app_data_dir.join(DATABASE_FILE_NAME);
        trace!("App data dir: {app_data_dir:?}, database file path: {file_path:?}");

        // Directory may not exist on first launch
        std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");

        let url = format!("sqlite:{}?mode=rwc", file_path.to_string_lossy());
        trace!("Connecting to production database at {url}");

        let pool = SqlitePool::connect(&url).await.unwrap();

        if let Err(error) = MIGRATOR.run(&pool).await {
            warn!("Migration failed, resetting database: {error}");
            std::fs::write(&file_path, "").expect("Failed to clear database file");

            let pool = SqlitePool::connect(&url).await.unwrap();
            MIGRATOR
                .run(&pool)
                .await
                .expect("Failed to run database migrations after reset");
            return SqlxSqliteConnector::from_sqlx_sqlite_pool(pool);
        }

        SqlxSqliteConnector::from_sqlx_sqlite_pool(pool)
    })
}
