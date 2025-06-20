use crate::axum_app::AppState;
use crate::axum_app::auth::jwt::KEYS;
use crate::axum_app::error::AuthError;
use crate::axum_app::models::Claims;
use argon2::password_hash::SaltString;
use argon2::password_hash::rand_core::OsRng;
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use axum::body::Body;
use axum::http::StatusCode;
use axum::{
    Extension, Json,
    http::header,
    response::{IntoResponse, Response},
};
use jsonwebtoken::encode;
use serde::Deserialize;
use sqlx::Row;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct RegisterPayload {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

pub async fn register(
    state: Extension<Arc<AppState>>,
    Json(payload): Json<RegisterPayload>,
) -> Result<impl IntoResponse, AuthError> {
    let mut rng = OsRng;
    let salt = SaltString::generate(&mut rng);

    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(payload.password.as_bytes(), &salt)
        .unwrap();

    sqlx::query("INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)")
        .bind(&payload.email)
        .bind(&payload.display_name)
        .bind(&hash.to_string())
        .execute(&*state.db)
        .await
        .unwrap();

    Ok(StatusCode::CREATED)
}

#[derive(Debug, Deserialize)]
pub struct LoginPayload {
    pub email: String,
    pub password: String,
}

pub async fn login(
    state: Extension<Arc<AppState>>,
    Json(payload): Json<LoginPayload>,
) -> Result<impl IntoResponse, AuthError> {
    // Query user by email
    let row = sqlx::query("SELECT password_hash, display_name,id FROM users WHERE email = $1")
        .bind(&payload.email)
        .fetch_optional(&*state.db)
        .await
        .unwrap(); // 500 if fail

    let row = match row {
        Some(row) => row,
        None => return Err(AuthError::WrongCredentials),
    };

    let user_id: String = row.try_get("id").unwrap();
    let hash: String = row
        .try_get("password_hash")
        .map_err(|_| AuthError::WrongCredentials)?;
    let display_name: String = row.try_get("display_name").unwrap();

    // Verify password
    let parsed_hash = argon2::PasswordHash::new(&hash).map_err(|_| AuthError::WrongCredentials)?;
    Argon2::default()
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .map_err(|_| AuthError::WrongCredentials)?;

    let rows = sqlx::query("SELECT canvas_id, right FROM user_canvas WHERE user_id = $1")
        .bind(&user_id)
        .fetch_all(&*state.db)
        .await
        .unwrap(); // 500 if fail

    let mut canvases = HashMap::new();
    for row in rows {
        let canvas_id: String = row.try_get("canvas_id").unwrap();
        let right: String = row.try_get("right").unwrap();
        canvases.insert(canvas_id, right);
    }

    let claims = Claims {
        email: payload.email.clone(),
        exp: 2000000000,
        canvases,
        display_name: display_name.clone(),
        id: user_id.clone(),
    };
    let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
        .map_err(|_| AuthError::TokenCreation)?;
    let cookie = format!("access_token={}; HttpOnly; Path=/; SameSite=Lax", token);
    let mut response = Response::new(Body::from(
        serde_json::json!({"email": payload.email, "display_name": display_name}).to_string(),
    ));
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    Ok(response)
}

pub async fn me(claims: Claims) -> impl IntoResponse {
    axum::Json(claims)
}

pub async fn logout() -> impl IntoResponse {
    let cookie = "access_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
    let mut response = Response::new(Body::from("Logged out"));
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    response
}
