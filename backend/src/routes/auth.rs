use crate::auth::jwt::KEYS;
use crate::error::AuthError;
use crate::models::{AuthBody, AuthPayload, Claims};
use axum::Json;
use jsonwebtoken::encode;

pub async fn protected(claims: Claims) -> Result<String, AuthError> {
    Ok(format!(
        "Welcome to the protected area :)\nYour data:\n{claims}",
    ))
}

pub async fn authorize(Json(payload): Json<AuthPayload>) -> Result<Json<AuthBody>, AuthError> {
    if payload.client_id.is_empty() || payload.client_secret.is_empty() {
        return Err(AuthError::MissingCredentials);
    }
    if payload.client_id != "foo" || payload.client_secret != "bar" {
        return Err(AuthError::WrongCredentials);
    }
    let claims = Claims { exp: 2000000000 };
    let token = encode(&jsonwebtoken::Header::default(), &claims, &KEYS.encoding)
        .map_err(|_| AuthError::TokenCreation)?;
    Ok(Json(AuthBody::new(token)))
}
