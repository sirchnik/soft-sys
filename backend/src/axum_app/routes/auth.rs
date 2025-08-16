use crate::axum_app::axum::AppState;
use crate::axum_app::error::AuthError;
use crate::shared::jwt::{Claims, KEYS};
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
use serde::Serialize;
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

    match sqlx::query("INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)")
        .bind(&payload.email)
        .bind(&payload.display_name)
        .bind(&hash.to_string())
        .execute(&*state.db)
        .await
    {
        Ok(_) => return Ok(StatusCode::CREATED),
        Err(sqlx::Error::Database(_db_err)) => return Ok(StatusCode::BAD_REQUEST),
        Err(e) => {
            tracing::error!("Database error: {:?}", e);
            return Ok(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }
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

    let claims = Claims {
        email: payload.email.clone(),
        exp: 2000000000,
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

#[derive(Debug, Deserialize)]
pub struct UpdateUserPayload {
    pub email: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub display_name: String,
}

pub async fn update_user(
    state: Extension<Arc<AppState>>,
    claims: Claims,
    axum::extract::Path(user_id): axum::extract::Path<String>,
    Json(payload): Json<UpdateUserPayload>,
) -> Result<impl IntoResponse, AuthError> {
    if claims.id != user_id {
        return Err(AuthError::WrongCredentials);
    }
    let mut tx = state.db.begin().await.unwrap();
    if let Some(email) = payload.email.as_ref() {
        sqlx::query("UPDATE users SET email = ? WHERE id = ?")
            .bind(email)
            .bind(&user_id)
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    if let Some(display_name) = payload.display_name.as_ref() {
        sqlx::query("UPDATE users SET display_name = ? WHERE id = ?")
            .bind(display_name)
            .bind(&user_id)
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    tx.commit().await.unwrap();
    // Fetch updated user
    let row = sqlx::query("SELECT id, email, display_name FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&*state.db)
        .await
        .unwrap();
    let user = UserResponse {
        id: row.try_get("id").unwrap(),
        email: row.try_get("email").unwrap(),
        display_name: row.try_get("display_name").unwrap(),
    };
    // Create new claims and JWT
    let claims = Claims {
        id: user.id.clone(),
        email: user.email.clone(),
        exp: 2000000000,
        display_name: user.display_name.clone(),
    };
    let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
        .map_err(|_| AuthError::TokenCreation)?;
    let cookie = format!("access_token={}; HttpOnly; Path=/; SameSite=Lax", token);
    let mut response = axum::response::Response::new(axum::body::Body::from(
        serde_json::to_string(&user).unwrap(),
    ));
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    Ok(response)
}
