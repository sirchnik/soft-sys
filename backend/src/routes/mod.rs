mod auth;

use crate::routes::auth::{authorize, protected};
use axum::routing::{get, post};
use axum::Router;

pub fn create_router() -> Router {
    Router::new()
        .route("/protected", get(protected))
        .route("/authorize", post(authorize))
}
