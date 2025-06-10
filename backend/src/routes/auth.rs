use crate::error::AuthError;
use crate::models::Claims;
use crate::{AppState, auth::jwt::KEYS};
use argon2::password_hash::SaltString;
use argon2::password_hash::rand_core::OsRng;
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use axum::{
    Extension, Json,
    http::header,
    response::{IntoResponse, Response},
};
use jsonwebtoken::encode;
use serde::Deserialize;
use sqlx::Row;
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

    use axum::http::StatusCode;
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
        .map_err(|_| AuthError::WrongCredentials)?;

    let row = match row {
        Some(row) => row,
        None => return Err(AuthError::WrongCredentials),
    };

    let hash: String = row
        .try_get("password_hash")
        .map_err(|_| AuthError::WrongCredentials)?;
    let display_name: String = row.try_get("display_name").unwrap();
    let user_id: String = row.try_get("id").unwrap();

    // Verify password
    let parsed_hash = argon2::PasswordHash::new(&hash).map_err(|_| AuthError::WrongCredentials)?;
    Argon2::default()
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .map_err(|_| AuthError::WrongCredentials)?;

    let claims = Claims {
        email: payload.email.clone(),
        exp: 2000000000,
        display_name: display_name.clone(),
        id: user_id.clone(),
    };
    let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
        .map_err(|_| AuthError::TokenCreation)?;
    let cookie = format!("access_token={}; HttpOnly; Path=/; SameSite=Lax", token);
    let mut response = Response::new(axum::body::Body::from(
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
    let mut response = Response::new(axum::body::Body::from("Logged out"));
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    response
}
