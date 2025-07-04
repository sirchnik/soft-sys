use axum::http::request::Parts;

use crate::{
    axum_app::error::AuthError,
    shared::jwt::{Claims, parse_jwt_from_cookies},
};

impl axum::extract::FromRequestParts<()> for Claims {
    type Rejection = AuthError;
    async fn from_request_parts(parts: &mut Parts, _state: &()) -> Result<Self, Self::Rejection> {
        // Extract JWT from cookie instead of Authorization header
        let cookies = parts
            .headers
            .get(axum::http::header::COOKIE)
            .ok_or(AuthError::MissingCredentials)?
            .to_str()
            .map_err(|_| AuthError::InvalidToken)?;
        let token_data = parse_jwt_from_cookies(cookies).map_err(|_| AuthError::InvalidToken)?;
        Ok(token_data.claims)
    }
}
