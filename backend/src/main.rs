mod auth;
mod error;
mod models;
mod routes;

use routes::create_router;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use axum::Extension;
use sqlx::SqlitePool;
use sqlx::sqlite::SqlitePoolOptions;
use std::env;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SqlitePool>,
}

#[tokio::main]
async fn main() {
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

    let app = create_router().layer(Extension(shared_state));

    if env::var("JWT_SECRET").is_err() {
        tracing::error!("JWT_SECRET is not set, using default secret for development purposes.");
        std::process::exit(1);
    }

    let bind_to = env::var("BIND_TO").unwrap_or("0.0.0.0:8000".to_string());
    let listener = tokio::net::TcpListener::bind(bind_to).await.unwrap();

    tracing::debug!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
