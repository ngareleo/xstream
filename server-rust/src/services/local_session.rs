//! Service-issued local session tokens (HS256, ~30-day, offline-valid). See docs/architecture/Identity/.

use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::db::{get_setting, set_setting, Db};
use crate::error::DbResult;

/// `user_settings` key holding the per-install HMAC secret.
const SECRET_SETTING_KEY: &str = "localSessionSecret";

/// Absolute session lifetime. When it lapses the user must do an online
/// Supabase login again — there is no sliding refresh.
pub const SESSION_TTL_DAYS: i64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalClaims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    pub jti: String,
    pub iat: i64,
    pub exp: i64,
}

/// A freshly-minted token plus the fields the caller persists to `sessions`.
pub struct Minted {
    pub token: String,
    pub jti: String,
    pub issued_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

/// Per-install HMAC secret, generated and persisted on first use. Lives in
/// `user_settings` so it survives a `wipe_db` (which preserves that table).
pub fn get_or_create_secret(db: &Db) -> DbResult<String> {
    if let Some(existing) = get_setting(db, SECRET_SETTING_KEY)? {
        if !existing.is_empty() {
            return Ok(existing);
        }
    }
    // 256 bits of entropy from two v4 UUIDs — avoids pulling in a fresh RNG
    // crate just for key generation.
    let secret = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    set_setting(db, SECRET_SETTING_KEY, &secret)?;
    Ok(secret)
}

/// Sign a session token for `user_id`. Does NOT touch the DB — the caller
/// inserts the matching `sessions` row so the token can later be revoked.
pub fn mint(
    secret: &str,
    user_id: &str,
    email: Option<&str>,
) -> Result<Minted, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now();
    let expires_at = now + chrono::Duration::days(SESSION_TTL_DAYS);
    let jti = uuid::Uuid::new_v4().to_string();
    let claims = LocalClaims {
        sub: user_id.to_string(),
        email: email.map(str::to_string),
        jti: jti.clone(),
        iat: now.timestamp(),
        exp: expires_at.timestamp(),
    };
    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(Minted {
        token,
        jti,
        issued_at: now,
        expires_at,
    })
}

/// Verify a token's signature and expiry. Does NOT check revocation — the
/// caller does an `is_session_active` DB lookup on the returned `jti`.
pub fn verify(secret: &str, token: &str) -> Result<LocalClaims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_aud = false;
    let data = decode::<LocalClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )?;
    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    const SECRET: &str = "test-secret-key-material-0123456789abcdef";

    #[test]
    fn mint_then_verify_round_trips_identity() {
        let minted = mint(SECRET, "user-42", Some("a@b.c")).expect("mint");
        let claims = verify(SECRET, &minted.token).expect("verify");
        assert_eq!(claims.sub, "user-42");
        assert_eq!(claims.email.as_deref(), Some("a@b.c"));
        assert_eq!(claims.jti, minted.jti);
        // Absolute ~30-day TTL.
        assert_eq!(
            minted.expires_at.timestamp() - minted.issued_at.timestamp(),
            30 * 24 * 3600
        );
    }

    #[test]
    fn verify_rejects_a_token_signed_with_a_different_secret() {
        let minted = mint(SECRET, "user-1", None).expect("mint");
        assert!(verify("a-different-secret", &minted.token).is_err());
    }

    #[test]
    fn verify_rejects_an_expired_token() {
        // Hand-build a token whose exp is in the past.
        let now = chrono::Utc::now();
        let claims = LocalClaims {
            sub: "user-1".to_string(),
            email: None,
            jti: "j1".to_string(),
            iat: (now - chrono::Duration::days(40)).timestamp(),
            exp: (now - chrono::Duration::days(10)).timestamp(),
        };
        let token = encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(SECRET.as_bytes()),
        )
        .expect("encode");
        assert!(verify(SECRET, &token).is_err());
    }

    #[test]
    fn get_or_create_secret_is_stable_across_calls() {
        let db = Db::open(Path::new(":memory:")).expect("db");
        let first = get_or_create_secret(&db).expect("first");
        let second = get_or_create_secret(&db).expect("second");
        assert_eq!(first, second);
        assert!(!first.is_empty());
    }
}
