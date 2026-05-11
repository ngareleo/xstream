//! Supabase JWT verification via JWKS.
//!
//! Holds only **public** RS256 keys fetched from the Supabase project's
//! `/.well-known/jwks.json` endpoint. No shared secrets ship in the bundle.
//! Soft-fail by design: any verification failure (missing key, expired
//! token, network outage during JWKS refresh) returns an `AuthError` —
//! callers downgrade to `RequestContext.user_id = None` rather than 5xx.
//! Identity-for-telemetry is non-load-bearing in alpha; an unauthenticated
//! request still serves data, it just lands in Seq without a `user.id`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use jsonwebtoken::{
    decode, decode_header,
    jwk::{AlgorithmParameters, JwkSet},
    Algorithm, DecodingKey, Validation,
};
use serde::Deserialize;
use tokio::sync::RwLock;
use tracing::{debug, warn};

/// How long a cached JWK set is trusted before a background refresh fires
/// on the next lookup. Short enough that a key rotation in Supabase
/// propagates within minutes; long enough that we don't hammer the JWKS
/// endpoint per request.
const JWKS_TTL: Duration = Duration::from_secs(600);

/// Decoded claim shape — only `sub` is load-bearing today (Supabase user
/// UUID, lands in `RequestContext.user_id`). `email` is read for the
/// `currentUser.email` GraphQL field; everything else Supabase emits
/// (`role`, `aud`, `iss`, `exp`, `aal`, …) is verified by
/// `jsonwebtoken::decode` against `Validation` and then discarded.
#[derive(Debug, Clone, Deserialize)]
pub struct Claims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("JWT header is malformed: {0}")]
    MalformedHeader(#[source] jsonwebtoken::errors::Error),

    #[error("JWT header has no `kid` — Supabase asymmetric tokens always carry one")]
    MissingKid,

    #[error("no key matches kid `{kid}` even after JWKS refresh")]
    UnknownKid { kid: String },

    #[error("fetching JWKS from {url}")]
    JwksFetch {
        url: String,
        #[source]
        source: reqwest::Error,
    },

    #[error("parsing JWKS response from {url}")]
    JwksParse {
        url: String,
        #[source]
        source: reqwest::Error,
    },

    #[error("JWKS entry has unsupported key type (only RSA is wired up)")]
    UnsupportedKeyType,

    #[error("converting JWK to RSA decoding key: {0}")]
    KeyConversion(#[source] jsonwebtoken::errors::Error),

    #[error("verifying JWT signature / claims: {0}")]
    SignatureOrClaims(#[source] jsonwebtoken::errors::Error),
}

/// Public-key cache, refreshed lazily. One per `AppContext`; cheap to
/// clone (the inner state is an `Arc<RwLock<…>>`).
#[derive(Clone)]
pub struct JwksCache {
    inner: Arc<Inner>,
}

struct Inner {
    jwks_url: String,
    http: reqwest::Client,
    state: RwLock<CacheState>,
}

#[derive(Default)]
struct CacheState {
    keys: HashMap<String, DecodingKey>,
    fetched_at: Option<Instant>,
}

impl JwksCache {
    pub fn new(jwks_url: String, http: reqwest::Client) -> Self {
        Self {
            inner: Arc::new(Inner {
                jwks_url,
                http,
                state: RwLock::new(CacheState::default()),
            }),
        }
    }

    /// Verify an `Authorization: Bearer <token>` payload. Returns the
    /// decoded claims on success. Caller policy: on `Err`, log at debug
    /// and leave `RequestContext.user_id = None`.
    pub async fn verify_token(&self, token: &str) -> Result<Claims, AuthError> {
        let header = decode_header(token).map_err(AuthError::MalformedHeader)?;
        let kid = header.kid.ok_or(AuthError::MissingKid)?;

        let key = match self.get_key(&kid).await? {
            Some(k) => k,
            None => {
                // Cache miss — could be a freshly-rotated key. Refresh
                // once and retry the lookup.
                self.refresh().await?;
                self.get_key(&kid)
                    .await?
                    .ok_or(AuthError::UnknownKid { kid: kid.clone() })?
            }
        };

        let mut validation = Validation::new(Algorithm::RS256);
        // Supabase JWTs carry an `aud` of "authenticated" for signed-in
        // sessions. We don't enforce it as required — the signature +
        // expiry checks are the real guards — but we don't reject either.
        validation.validate_aud = false;
        let data = decode::<Claims>(token, &key, &validation)
            .map_err(AuthError::SignatureOrClaims)?;
        Ok(data.claims)
    }

    async fn get_key(&self, kid: &str) -> Result<Option<DecodingKey>, AuthError> {
        // Refresh on first use or when TTL has elapsed. The read here
        // is cheap; the write path is taken only when refresh is needed.
        let needs_refresh = {
            let state = self.inner.state.read().await;
            match state.fetched_at {
                None => true,
                Some(t) => t.elapsed() >= JWKS_TTL,
            }
        };
        if needs_refresh {
            if let Err(err) = self.refresh().await {
                warn!(error = %err, "JWKS refresh failed; serving from stale cache");
            }
        }
        let state = self.inner.state.read().await;
        Ok(state.keys.get(kid).cloned())
    }

    async fn refresh(&self) -> Result<(), AuthError> {
        debug!(url = %self.inner.jwks_url, "fetching JWKS");
        let response = self
            .inner
            .http
            .get(&self.inner.jwks_url)
            .send()
            .await
            .map_err(|source| AuthError::JwksFetch {
                url: self.inner.jwks_url.clone(),
                source,
            })?;
        let jwks: JwkSet = response.json().await.map_err(|source| AuthError::JwksParse {
            url: self.inner.jwks_url.clone(),
            source,
        })?;

        let mut decoded = HashMap::with_capacity(jwks.keys.len());
        for jwk in jwks.keys {
            let Some(kid) = jwk.common.key_id.clone() else {
                continue;
            };
            let key = match &jwk.algorithm {
                AlgorithmParameters::RSA(rsa) => {
                    DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
                        .map_err(AuthError::KeyConversion)?
                }
                _ => continue,
            };
            decoded.insert(kid, key);
        }
        let mut state = self.inner.state.write().await;
        state.keys = decoded;
        state.fetched_at = Some(Instant::now());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_render_with_source_chain() {
        let err = AuthError::MissingKid;
        let rendered = format!("{}", err);
        assert!(rendered.contains("kid"), "rendered = {rendered}");
    }

    #[tokio::test]
    async fn verify_returns_missing_kid_on_unkidded_token() {
        // A token with `alg: none` and no `kid` exercises the
        // header-shape branch without touching the network.
        let header = r#"{"alg":"HS256","typ":"JWT"}"#;
        let payload = r#"{"sub":"abc"}"#;
        use base64::Engine;
        let header_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(header);
        let payload_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload);
        let token = format!("{header_b64}.{payload_b64}.sig");
        let cache = JwksCache::new(
            "https://invalid.test/.well-known/jwks.json".to_string(),
            reqwest::Client::new(),
        );
        let err = cache.verify_token(&token).await.unwrap_err();
        assert!(matches!(err, AuthError::MissingKid), "got {err:?}");
    }
}
