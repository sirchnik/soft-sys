use crate::axum_app::AppState;
use crate::shared::jwt::{Claims, KEYS};
use axum::body::Body;
use axum::http::StatusCode;
use axum::{Extension, http::header, response::Response};
use jsonwebtoken::encode;
use sqlx::Row;
use std::sync::Arc;

pub async fn create_canvas(
    state: Extension<Arc<AppState>>,
    mut claims: Claims,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    // Insert new canvas
    let row = sqlx::query("INSERT INTO canvas DEFAULT VALUES RETURNING id")
        .fetch_one(&*state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let canvas_id: String = row
        .try_get("id")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // Insert into user_canvas as owner
    sqlx::query("INSERT INTO user_canvas (user_id, canvas_id, right) VALUES ($1, $2, $3)")
        .bind(&claims.id)
        .bind(&canvas_id)
        .bind("O")
        .execute(&*state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // Add the new canvas to the claims in memory
    claims.canvases.insert(canvas_id.clone(), "O".to_string());
    // Encode new JWT and set cookie
    let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let cookie = format!("access_token={}; HttpOnly; Path=/; SameSite=Lax", token);
    let mut response = Response::new(Body::from(
        serde_json::json!({ "id": canvas_id }).to_string(),
    ));
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    Ok(response)
}
