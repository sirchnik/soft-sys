use axum::extract::Request;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Router, routing, routing::get_service};
use std::env;
use tower_http::services::ServeDir;

use crate::axum_app::routes::{auth, canvas};

pub fn create_router() -> Router {
    let frontend_path = env::var("FRONTEND_PATH").unwrap_or_else(|_| "frontend".to_string());
    let dist_path = format!("{}/dist", frontend_path);
    let static_path = format!("{}/static", frontend_path);
    let index_path = format!("{}/index.html", frontend_path);
    Router::new()
        .nest(
            "/api",
            Router::new()
                .nest(
                    "/auth",
                    Router::new()
                        .route("/login", routing::post(auth::login))
                        .route("/register", routing::post(auth::register))
                        .route("/me", routing::get(auth::me))
                        .route("/logout", routing::post(auth::logout)),
                )
                .nest(
                    "/canvas",
                    Router::new()
                        .route("/", routing::post(canvas::create_canvas))
                        .route(
                            "/{canvas_id}/right",
                            routing::post(canvas::change_canvas_right),
                        )
                        .route(
                            "/{canvas_id}/moderated",
                            routing::post(canvas::set_moderated),
                        )
                        .route("/datas", routing::get(canvas::get_canvases_data)),
                )
                .route("/user/{id}", routing::patch(auth::update_user)),
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
