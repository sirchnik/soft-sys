mod auth;

use crate::routes::auth::{login, register};
use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Router, routing::get_service, routing::post};
use std::env;
use tower_http::services::ServeDir;

pub fn create_router() -> Router {
    let frontend_path = env::var("FRONTEND_PATH").unwrap_or_else(|_| "frontend".to_string());
    let dist_path = format!("{}/dist", frontend_path);
    let static_path = format!("{}/static", frontend_path);
    let index_path = format!("{}/index.html", frontend_path);
    Router::new()
        .nest(
            "/api",
            Router::new()
                .route("/login", post(login))
                .route("/register", post(register))
                .route("/me", axum::routing::get(crate::routes::auth::me)),
        )
        .nest_service("/dist", get_service(ServeDir::new(dist_path)))
        .nest_service("/static", get_service(ServeDir::new(static_path)))
        .fallback(|req: Request| async move {
            let path = req.uri().path();
            if path.starts_with("/api/") || path.starts_with("/dist/") {
                StatusCode::NOT_FOUND.into_response()
            } else {
                match tokio::fs::read(&index_path).await {
                    Ok(contents) => {
                        (StatusCode::OK, [("content-type", "text/html")], contents).into_response()
                    }
                    Err(_) => StatusCode::NOT_FOUND.into_response(),
                }
            }
        })
}
