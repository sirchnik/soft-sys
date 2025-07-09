use axum::{Extension, http::Method};
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::{env, sync::Arc};
use tower_http::cors::CorsLayer;

use crate::axum_app::routes::create_router;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<SqlitePool>,
    pub ws_sender: tokio::sync::broadcast::Sender<crate::shared::CanvasDataEvent>,
}

pub async fn create_axum(
    ws_sender: tokio::sync::broadcast::Sender<crate::shared::CanvasDataEvent>,
) -> tokio::task::JoinHandle<()> {
    let pool = SqlitePoolOptions::new()
        .connect(
            env::var("DATABASE_URL")
                .unwrap_or("sqlite://drawer.db".to_string())
                .as_str(),
        )
        .await
        .unwrap();
    let shared_state = Arc::new(AppState {
        db: Arc::new(pool),
        ws_sender,
    });

    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:3000"].map(|s| s.parse().unwrap())) // local development
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
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

    tracing::debug!("Axum listening on {}", listener.local_addr().unwrap());

    // Spawn Axum server
    let axum_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    return axum_handle;
}
