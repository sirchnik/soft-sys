mod axum_app;
mod wtransport_app;

use tokio::task::JoinHandle;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use anyhow::Result;
use dotenv;
use std::env;

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

    let axum_handle: JoinHandle<()> = axum_app::create_axum().await;

    let wtransport_handle: JoinHandle<()> = wtransport_app::create_wtransport().await;

    // Wait for either server to finish (or error)
    let _ = tokio::try_join!(axum_handle, wtransport_handle)?;
    Ok(())
}
