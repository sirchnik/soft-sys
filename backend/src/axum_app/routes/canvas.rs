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
    pub right: String,
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
    pub rights: Vec<UserRight>,
}

#[derive(Deserialize)]
pub struct ModeratedPayload {
    pub moderated: bool,
}

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
    // Check if user has permission to change rights
    let my_right = claims.canvases.get(&canvas_id).cloned().unwrap_or_default();
    let allowed = match my_right.as_str() {
        "O" => true,                 // Owner can assign any right
        "M" => payload.right != "O", // Moderator can't assign O
        _ => false,
    };
    if !allowed {
        return Err(StatusCode::FORBIDDEN);
    }
    // Update or insert right for the user
    let res = sqlx::query("INSERT INTO user_canvas (user_id, canvas_id, right) VALUES ($1, $2, $3) ON CONFLICT (user_id, canvas_id) DO UPDATE SET right = $3")
        .bind(&user_id)
        .bind(&canvas_id)
        .bind(&payload.right)
        .execute(&*state.db)
        .await;
    if res.is_err() {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    // If user changes their own right, update JWT and set cookie
    if user_id == claims.id {
        let mut new_claims = claims;
        if payload.right == "R"
            || payload.right == "W"
            || payload.right == "V"
            || payload.right == "M"
            || payload.right == "O"
        {
            new_claims
                .canvases
                .insert(canvas_id.clone(), payload.right.clone());
        } else {
            new_claims.canvases.remove(&canvas_id);
        }
        let token = encode(
            &jsonwebtoken::Header::default(),
            &new_claims,
            &KEYS.encoding,
        )
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
    let my_right = claims.canvases.get(&canvas_id).cloned().unwrap_or_default();
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
    Ok(Response::new(Body::from("OK")))
}

pub async fn get_canvases_data(
    state: Extension<Arc<AppState>>,
    claims: Claims,
) -> Result<impl axum::response::IntoResponse, StatusCode> {
    // Find all canvases where user is M or O
    let mut result = Vec::new();
    for (canvas_id, my_right) in &claims.canvases {
        if my_right != "M" && my_right != "O" {
            continue;
        }
        // Get moderated status
        let row = sqlx::query("SELECT moderated FROM canvas WHERE id = $1")
            .bind(canvas_id)
            .fetch_one(&*state.db)
            .await;
        let moderated = match row {
            Ok(row) => row.try_get("moderated").unwrap_or(false),
            Err(_) => false,
        };
        // Get rights
        let rows = sqlx::query("SELECT users.email, user_canvas.right FROM user_canvas JOIN users ON user_canvas.user_id = users.id WHERE user_canvas.canvas_id = $1")
            .bind(canvas_id)
            .fetch_all(&*state.db)
            .await
            .unwrap_or_default();
        let rights: Vec<UserRight> = rows
            .into_iter()
            .map(|row| UserRight {
                email: row.try_get("email").unwrap_or_default(),
                right: row.try_get("right").unwrap_or_default(),
            })
            .collect();
        result.push(CanvasRightsModerated {
            canvas_id: canvas_id.clone(),
            moderated,
            rights,
        });
    }
    Ok(axum::Json(result))
}
