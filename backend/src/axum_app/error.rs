use crate::axum_app::auth::jwt::KEYS;
use crate::axum_app::models::Claims;
use axum::{
    Json,
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
};
use jsonwebtoken::{Validation, decode};
use serde_json::json;

#[derive(Debug)]
pub enum AuthError {
    WrongCredentials,
    MissingCredentials,
    TokenCreation,
    InvalidToken,
}

impl axum::extract::FromRequestParts<()> for Claims {
    type Rejection = AuthError;
    async fn from_request_parts(parts: &mut Parts, _state: &()) -> Result<Self, Self::Rejection> {
        // Extract JWT from cookie instead of Authorization header
        let cookies = parts
            .headers
            .get(axum::http::header::COOKIE)
            .ok_or(AuthError::MissingCredentials)?;
        let cookie_str = cookies.to_str().map_err(|_| AuthError::InvalidToken)?;
        let jwt = cookie_str
            .split(';')
            .find_map(|c| {
                let c = c.trim();
                if c.starts_with("access_token=") {
                    Some(&c[13..])
                } else {
                    None
                }
            })
            .ok_or(AuthError::MissingCredentials)?;
        let token_data = decode::<Claims>(jwt, &KEYS.decoding, &Validation::default())
            .map_err(|_| AuthError::InvalidToken)?;
        Ok(token_data.claims)
    }
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AuthError::WrongCredentials => (StatusCode::UNAUTHORIZED, "Wrong credentials"),
            AuthError::MissingCredentials => (StatusCode::BAD_REQUEST, "Missing credentials"),
            AuthError::TokenCreation => (StatusCode::INTERNAL_SERVER_ERROR, "Token creation error"),
            AuthError::InvalidToken => (StatusCode::BAD_REQUEST, "Invalid token"),
        };
        let body = Json(json!({
            "error": error_message,
        }));
        (status, body).into_response()
    }
}
