use crate::auth::jwt::KEYS;
use crate::error::AuthError;
use crate::models::{AuthPayload, Claims};
use axum::{
    Json,
    http::header,
    response::{IntoResponse, Response},
};
use jsonwebtoken::encode;

pub async fn protected(claims: Claims) -> Result<String, AuthError> {
    Ok(format!(
        "Welcome to the protected area :)\nYour data:\n{claims}",
    ))
}

pub async fn authorize(Json(payload): Json<AuthPayload>) -> Result<impl IntoResponse, AuthError> {
    if payload.client_id.is_empty() || payload.client_secret.is_empty() {
        return Err(AuthError::MissingCredentials);
    }
    if payload.client_id != "foo" || payload.client_secret != "bar" {
        return Err(AuthError::WrongCredentials);
    }
    let claims = Claims { exp: 2000000000 };
    let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
        .map_err(|_| AuthError::TokenCreation)?;
    let cookie = format!("access_token={}; HttpOnly; Path=/; SameSite=Lax", token);
    let mut response = Response::new(axum::body::Body::from("Authorized"));
    response
        .headers_mut()
        .insert(header::SET_COOKIE, cookie.parse().unwrap());
    Ok(response)
}
