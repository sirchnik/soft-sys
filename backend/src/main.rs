mod axum_app;

use tokio::task::JoinHandle;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use anyhow::Result;
use dotenv;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;
use std::sync::Arc;
use wtransport::{Endpoint, Identity, ServerConfig};

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

    // Spawn WebTransport server
    let webtransport_handle = tokio::spawn(async move {
        let identity = Identity::load_pemfiles(
            &env::var("CERT_PATH").unwrap_or_else(|_| "../cert.pem".to_string()),
            &env::var("KEY_PATH").unwrap_or_else(|_| "../key.pem".to_string()),
        )
        .await
        .unwrap();
        let config = ServerConfig::builder()
            .with_bind_default(4433)
            .with_identity(identity)
            .build();
        tracing::debug!("WebTransport listening on port 4433");
        let server = Endpoint::server(config).unwrap();
        loop {
            let incoming_session = server.accept().await;
            let incoming_request = incoming_session.await;
            if let Ok(incoming_request) = incoming_request {
                let connection = incoming_request.accept().await;
                if let Ok(connection) = connection {
                    let (a, mut b) = connection.accept_bi().await.unwrap();
                    let mut buf = [0; 1024];
                    b.read(&mut buf).await.unwrap();
                    let received = String::from_utf8_lossy(&buf).to_string();
                    tracing::debug!("Received data: {}", received);
                    println!("New WebTransport connection established");
                }
            }
        }
    });

    // Wait for either server to finish (or error)
    let _ = tokio::try_join!(axum_handle, webtransport_handle)?;
    Ok(())
}
