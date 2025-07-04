use jsonwebtoken::errors::ErrorKind;
use jsonwebtoken::{DecodingKey, EncodingKey};
use serde::{Deserialize, Serialize};
use std::fmt::Display;
use std::sync::LazyLock;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub id: String,
    pub email: String,
    pub exp: usize,
    pub display_name: String,
    pub canvases: std::collections::HashMap<String, String>,
}

impl Display for Claims {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Expiry: {}", self.exp)
    }
}

pub static KEYS: LazyLock<Keys> = LazyLock::new(|| {
    let secret = std::env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    Keys::new(secret.as_bytes())
});

pub struct Keys {
    pub encoding: EncodingKey,
    pub decoding: DecodingKey,
}

impl Keys {
    pub fn new(secret: &[u8]) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
        }
    }
}

pub fn parse_jwt_from_cookies(cookies: &str) -> Result<jsonwebtoken::TokenData<Claims>, ErrorKind> {
    let jwt = cookies
        .split(';')
        .find_map(|c| {
            let c = c.trim();
            if c.starts_with("access_token=") {
                Some(&c[13..])
            } else {
                None
            }
        })
        .ok_or(ErrorKind::InvalidToken)?;
    let token_data =
        jsonwebtoken::decode::<Claims>(jwt, &KEYS.decoding, &jsonwebtoken::Validation::default())
            .map_err(|_| ErrorKind::InvalidToken)?;
    Ok(token_data)
}
