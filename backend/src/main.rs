mod auth;
mod error;
mod models;
mod routes;

use routes::create_router;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use anyhow::Result;
use axum::{Extension, http::Method};
use dotenv;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
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

    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:3000"].map(|s| s.parse().unwrap()))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_credentials(true)
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ]);

    let app = create_router().layer(Extension(shared_state)).layer(cors);

    let bind_to = env::var("BIND_TO").unwrap_or("0.0.0.0:8000".to_string());
    let listener = tokio::net::TcpListener::bind(bind_to).await.unwrap();

    tracing::debug!("listening on {}", listener.local_addr().unwrap());

    // Spawn Axum server
    let axum_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Spawn WebTransport server
    let webtransport_handle = tokio::spawn(async move {
        let config = ServerConfig::builder()
            .with_bind_default(4433)
            .with_identity(
                Identity::load_pemfiles("cert.pem", "key.pem")
                    .await
                    .unwrap(),
            )
            .build();
        let server = Endpoint::server(config).unwrap();
        loop {
            let incoming_session = server.accept().await;
            let incoming_request = incoming_session.await;
            if let Ok(incoming_request) = incoming_request {
                let connection = incoming_request.accept().await;
                if let Ok(_connection) = connection {
                    println!("New WebTransport connection established");
                }
            }
        }
    });

    // Wait for either server to finish (or error)
    let _ = tokio::try_join!(axum_handle, webtransport_handle)?;
    Ok(())
}
