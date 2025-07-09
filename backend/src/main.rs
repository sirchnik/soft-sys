mod axum_app;
mod shared;
mod wsocket_app;

use tokio::task::JoinHandle;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use anyhow::Result;
use dotenv;
use std::env;

#[tokio::main]
async fn main() -> Result<()> {
    if let Err(e) = dotenv::dotenv() {
        tracing::warn!("Failed to load .env file: {}", e);
    }

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

    // Create broadcast channel for ws communication
    let (ws_sender, mut dummy_receiver) =
        tokio::sync::broadcast::channel::<shared::CanvasDataEvent>(100);

    // Spawn a task to log every broadcast for testing
    tokio::spawn(async move {
        loop {
            match dummy_receiver.recv().await {
                Ok(msg) => tracing::trace!("[Broadcast LOG] Received: {:?}", msg),
                Err(e) => tracing::warn!("[Broadcast LOG] Error receiving broadcast: {}", e),
            }
        }
    });

    let axum_handle: JoinHandle<()> = axum_app::create_axum(ws_sender.clone()).await;

    let wtransport_handle: JoinHandle<()> = wsocket_app::create_websocket_server(ws_sender).await;

    // Wait for either server to finish (or error)
    let _ = tokio::try_join!(axum_handle, wtransport_handle)?;
    Ok(())
}
