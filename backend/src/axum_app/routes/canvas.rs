use crate::axum_app::axum::AppState;
use crate::shared::jwt::{Claims, KEYS};
use axum::body::Body;
use axum::http::StatusCode;
use axum::{Extension, http::header, response::Response};
use axum::{Json, extract::Path};
use jsonwebtoken::encode;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use tracing::*;

#[derive(Deserialize)]
pub struct ChangeRight {
    pub email: String,
    pub right: Option<String>,
}

#[derive(Serialize)]
pub struct UserRight {
    pub email: String,
    pub right: String,
}

#[derive(Serialize)]
pub struct CanvasRightsModerated {
    pub canvas_id: String,
    pub moderated: bool,
    pub right: String,
    pub rights: Option<Vec<UserRight>>,
}

#[derive(Deserialize)]
pub struct ModeratedPayload {
    pub moderated: bool,
}

pub async fn create_canvas(
    state: Extension<Arc<AppState>>,
    claims: Claims,
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
    let response = Response::new(Body::from(
        serde_json::json!({ "id": canvas_id }).to_string(),
    ));
    Ok(response)
}

pub async fn change_canvas_right(
    state: Extension<Arc<AppState>>,
    claims: Claims,
    Path(canvas_id): Path<String>,
    Json(payload): Json<ChangeRight>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    // Look up user_id by email
    let user_row = sqlx::query("SELECT id FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_one(&*state.db)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let user_id: String = user_row
        .try_get("id")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // Fetch current user's right for this canvas from DB
    let my_right_row =
        sqlx::query("SELECT right FROM user_canvas WHERE user_id = $1 AND canvas_id = $2")
            .bind(&claims.id)
            .bind(&canvas_id)
            .fetch_optional(&*state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let my_right = my_right_row
        .and_then(|row| row.try_get::<String, _>("right").ok())
        .unwrap_or_default();
    let allowed = match my_right.as_str() {
        "O" => true,                                  // Owner can assign any right
        "M" => payload.right.as_deref() != Some("O"), // Moderator can't assign O
        _ => false,
    };
    if !allowed {
        return Err(StatusCode::FORBIDDEN);
    }
    // Update or insert/remove right for the user
    let remove_right = match &payload.right {
        None => true,
        Some(r) if r.is_empty() || r == "null" => true,
        _ => false,
    };
    if remove_right {
        // Remove right
        let res = sqlx::query("DELETE FROM user_canvas WHERE user_id = $1 AND canvas_id = $2")
            .bind(&user_id)
            .bind(&canvas_id)
            .execute(&*state.db)
            .await;
        if res.is_err() {
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        // Broadcast right removal
        let _ = state
            .ws_sender
            .send(crate::shared::CanvasDataEvent::RightChanged(
                canvas_id.clone(),
                (user_id.clone(), None),
            ));
    } else {
        // Insert or update right
        let right = payload.right.as_ref().unwrap();
        let res = sqlx::query("INSERT INTO user_canvas (user_id, canvas_id, right) VALUES ($1, $2, $3) ON CONFLICT (user_id, canvas_id) DO UPDATE SET right = $3")
            .bind(&user_id)
            .bind(&canvas_id)
            .bind(right)
            .execute(&*state.db)
            .await;
        if res.is_err() {
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
        // Broadcast right change
        let _ = state
            .ws_sender
            .send(crate::shared::CanvasDataEvent::RightChanged(
                canvas_id.clone(),
                (user_id.clone(), Some(right.clone())),
            ));
    }
    // Remove redundant bool broadcast
    info!(
        "Changed right for user {} on canvas {} to {:?}",
        payload.email, canvas_id, payload.right
    );
    // If user changes their own right, update JWT and set cookie
    if user_id == claims.id {
        // No longer update canvases in claims, as rights are now always fetched from DB
        let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let cookie = format!("access_token={}; HttpOnly; Path=/; SameSite=Lax", token);
        let mut response = Response::new(Body::from("OK"));
        response
            .headers_mut()
            .insert(header::SET_COOKIE, cookie.parse().unwrap());
        return Ok(response);
    }
    Ok(Response::new(Body::from("OK")))
}

pub async fn set_moderated(
    state: Extension<Arc<AppState>>,
    claims: Claims,
    Path(canvas_id): Path<String>,
    Json(payload): Json<ModeratedPayload>,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    // Fetch current user's right for this canvas from DB
    let my_right_row =
        sqlx::query("SELECT right FROM user_canvas WHERE user_id = $1 AND canvas_id = $2")
            .bind(&claims.id)
            .bind(&canvas_id)
            .fetch_optional(&*state.db)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let my_right = my_right_row
        .and_then(|row| row.try_get::<String, _>("right").ok())
        .unwrap_or_default();
    let allowed = matches!(my_right.as_str(), "M" | "O");
    if !allowed {
        return Err(StatusCode::FORBIDDEN);
    }
    info!(
        "Setting moderated status for canvas {}: {}",
        canvas_id, payload.moderated
    );
    let res = sqlx::query("UPDATE canvas SET moderated = $1 WHERE id = $2")
        .bind(payload.moderated)
        .bind(&canvas_id)
        .execute(&*state.db)
        .await;
    if res.is_err() {
        error!(
            "Failed to update moderated status for canvas {}: {:?}",
            canvas_id,
            res.err()
        );
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    // After moderation change, broadcast ModeratedChanged event
    let _ = state
        .ws_sender
        .send(crate::shared::CanvasDataEvent::ModeratedChanged(
            canvas_id.clone(),
            payload.moderated,
        ));
    Ok(Response::new(Body::from("OK")))
}

pub async fn get_canvases_data(
    state: Extension<Arc<AppState>>,
    claims: Claims,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    // Find all canvases where user has any right
    let rows = sqlx::query("SELECT canvas_id, right FROM user_canvas WHERE user_id = $1")
        .bind(&claims.id)
        .fetch_all(&*state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut result = Vec::new();
    for row in rows {
        let canvas_id: String = row.try_get("canvas_id").unwrap_or_default();
        let my_right: String = row.try_get("right").unwrap_or_default();
        // Get moderated status
        let row2 = sqlx::query("SELECT moderated FROM canvas WHERE id = $1")
            .bind(&canvas_id)
            .fetch_one(&*state.db)
            .await;
        let moderated = match row2 {
            Ok(row) => row.try_get("moderated").unwrap_or(false),
            Err(_) => false,
        };
        // Only show rights if user is M or O
        let rights = if my_right == "M" || my_right == "O" {
            let rows2 = sqlx::query("SELECT users.email, user_canvas.right FROM user_canvas JOIN users ON user_canvas.user_id = users.id WHERE user_canvas.canvas_id = $1")
                .bind(&canvas_id)
                .fetch_all(&*state.db)
                .await
                .unwrap_or_default();
            Some(
                rows2
                    .into_iter()
                    .map(|row| UserRight {
                        email: row.try_get("email").unwrap_or_default(),
                        right: row.try_get("right").unwrap_or_default(),
                    })
                    .collect(),
            )
        } else {
            None
        };
        result.push(CanvasRightsModerated {
            canvas_id: canvas_id.clone(),
            moderated,
            right: my_right,
            rights,
        });
    }
    Ok(axum::Json(result))
}
