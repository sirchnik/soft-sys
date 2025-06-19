mod axum_app;
mod wtransport_app;

use tokio::task::JoinHandle;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use anyhow::Result;
use dotenv;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;
use std::sync::Arc;

use crate::wtransport_app::create_wtransport;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SqlitePool>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().unwrap();

    let required_envs = ["JWT_SECRET"];
    let missing_envs: Vec<&str> = required_envs
        .iter()
        .cloned()
        .filter(|key| env::var(key).is_err())
        .collect();

    if !missing_envs.is_empty() {
        tracing::error!("Missing required environment variables: {:?}", missing_envs);
        std::process::exit(1);
    }

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| format!("{}=debug", env!("CARGO_CRATE_NAME")).into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let pool = SqlitePoolOptions::new()
        .connect(
            env::var("DATABASE_URL")
                .unwrap_or("sqlite://drawer.db".to_string())
                .as_str(),
        )
        .await
        .unwrap();

    let shared_state = Arc::new(AppState { db: Arc::new(pool) });

    let axum_handle: JoinHandle<()> = axum_app::create_axum(shared_state.clone()).await;

    let wtransport_handle: JoinHandle<()> = create_wtransport(shared_state.clone()).await;

    // Wait for either server to finish (or error)
    let _ = tokio::try_join!(axum_handle, wtransport_handle)?;
    Ok(())
}
