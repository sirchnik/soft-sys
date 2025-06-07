mod auth;

use crate::routes::auth::{login, register};
use axum::Router;
use axum::routing::post;

pub fn create_router() -> Router {
    Router::new()
        .route("/login", post(login))
        .route("/register", post(register))
}
