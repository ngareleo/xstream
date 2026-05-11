//! Supabase JWT verification via JWKS. See docs/architecture/Identity/.

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

/// JWKS cache TTL.
const JWKS_TTL: Duration = Duration::from_secs(600);

/// Decoded Supabase JWT claims.
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

/// Lazily-refreshed Supabase JWKS public-key cache.
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

    /// Verify a Bearer JWT; returns decoded `Claims` on success.
    pub async fn verify_token(&self, token: &str) -> Result<Claims, AuthError> {
        let header = decode_header(token).map_err(AuthError::MalformedHeader)?;
        let kid = header.kid.ok_or(AuthError::MissingKid)?;

        let key = match self.get_key(&kid).await? {
            Some(k) => k,
            None => {
                // Force-refresh on miss in case the kid was just rotated.
                self.refresh().await?;
                self.get_key(&kid)
                    .await?
                    .ok_or(AuthError::UnknownKid { kid: kid.clone() })?
            }
        };

        let mut validation = Validation::new(Algorithm::RS256);
        validation.validate_aud = false;
        let data = decode::<Claims>(token, &key, &validation)
            .map_err(AuthError::SignatureOrClaims)?;
        Ok(data.claims)
    }

    async fn get_key(&self, kid: &str) -> Result<Option<DecodingKey>, AuthError> {
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
        // No `kid` header → header-shape branch fires without touching the network.
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
