//! Supabase JWT verification via JWKS. See docs/architecture/Identity/.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use jsonwebtoken::{
    decode, decode_header,
    jwk::{AlgorithmParameters, EllipticCurve, JwkSet},
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
    keys: HashMap<String, CachedKey>,
    fetched_at: Option<Instant>,
}

#[derive(Clone)]
struct CachedKey {
    algorithm: Algorithm,
    key: DecodingKey,
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

        let cached = match self.get_key(&kid).await? {
            Some(k) => k,
            None => {
                // Force-refresh on miss in case the kid was just rotated.
                self.refresh().await?;
                self.get_key(&kid)
                    .await?
                    .ok_or(AuthError::UnknownKid { kid: kid.clone() })?
            }
        };

        let mut validation = Validation::new(cached.algorithm);
        validation.validate_aud = false;
        let data = decode::<Claims>(token, &cached.key, &validation)
            .map_err(AuthError::SignatureOrClaims)?;
        Ok(data.claims)
    }

    async fn get_key(&self, kid: &str) -> Result<Option<CachedKey>, AuthError> {
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
        let jwks: JwkSet = response
            .json()
            .await
            .map_err(|source| AuthError::JwksParse {
                url: self.inner.jwks_url.clone(),
                source,
            })?;

        let decoded = decode_jwks(jwks)?;
        let mut state = self.inner.state.write().await;
        state.keys = decoded;
        state.fetched_at = Some(Instant::now());
        Ok(())
    }
}

/// Decode every kid'd JWK in the set into a `CachedKey`. Unsupported
/// algorithms / curves are silently skipped — a server with a mixed JWKS
/// still verifies tokens signed with the supported subset.
fn decode_jwks(jwks: JwkSet) -> Result<HashMap<String, CachedKey>, AuthError> {
    let mut decoded = HashMap::with_capacity(jwks.keys.len());
    for jwk in jwks.keys {
        let Some(kid) = jwk.common.key_id.clone() else {
            continue;
        };
        let cached = match &jwk.algorithm {
            AlgorithmParameters::RSA(rsa) => CachedKey {
                algorithm: Algorithm::RS256,
                key: DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
                    .map_err(AuthError::KeyConversion)?,
            },
            AlgorithmParameters::EllipticCurve(ec) => {
                let algorithm = match ec.curve {
                    EllipticCurve::P256 => Algorithm::ES256,
                    EllipticCurve::P384 => Algorithm::ES384,
                    // P-521 isn't supported by ring (jsonwebtoken's backend),
                    // and Ed25519 lands here as EdDSA — skip until needed.
                    _ => continue,
                };
                CachedKey {
                    algorithm,
                    key: DecodingKey::from_ec_components(&ec.x, &ec.y)
                        .map_err(AuthError::KeyConversion)?,
                }
            }
            _ => continue,
        };
        decoded.insert(kid, cached);
    }
    Ok(decoded)
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

    #[test]
    fn decode_jwks_resolves_es256_p256_key() {
        // The actual JWKS shape Supabase serves for an asymmetric ES256
        // project. The x/y coordinates are base64url-encoded P-256
        // public-key components; jsonwebtoken validates them on decode.
        let raw = r#"{
            "keys": [{
                "x": "bRC55wVytXBJGaCPHhfmdQIWyVYcbB7XOFu1kkTqqOg",
                "y": "etV7kM3YSF0qBpjUSm4jtGx-eine6S-wgK-goSOcFjY",
                "alg": "ES256",
                "crv": "P-256",
                "kid": "28f672e7-b3e4-4ac1-af85-9683010013a9",
                "kty": "EC",
                "key_ops": ["verify"]
            }]
        }"#;
        let jwks: JwkSet = serde_json::from_str(raw).expect("static fixture parses");
        let decoded = decode_jwks(jwks).expect("EC P-256 key decodes");
        let cached = decoded
            .get("28f672e7-b3e4-4ac1-af85-9683010013a9")
            .expect("kid is present");
        assert_eq!(cached.algorithm, Algorithm::ES256);
    }

    #[test]
    fn decode_jwks_resolves_rs256_key() {
        // Minimal RSA JWK — the modulus is a real 2048-bit public key
        // (any valid RSA pubkey works; the value isn't load-bearing for
        // the parse step).
        let raw = r#"{
            "keys": [{
                "kty": "RSA",
                "alg": "RS256",
                "kid": "rsa-kid-1",
                "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
                "e": "AQAB"
            }]
        }"#;
        let jwks: JwkSet = serde_json::from_str(raw).expect("static fixture parses");
        let decoded = decode_jwks(jwks).expect("RSA key decodes");
        let cached = decoded.get("rsa-kid-1").expect("kid is present");
        assert_eq!(cached.algorithm, Algorithm::RS256);
    }

    #[test]
    fn decode_jwks_skips_kidless_entries() {
        let raw = r#"{
            "keys": [{
                "x": "bRC55wVytXBJGaCPHhfmdQIWyVYcbB7XOFu1kkTqqOg",
                "y": "etV7kM3YSF0qBpjUSm4jtGx-eine6S-wgK-goSOcFjY",
                "alg": "ES256",
                "crv": "P-256",
                "kty": "EC"
            }]
        }"#;
        let jwks: JwkSet = serde_json::from_str(raw).expect("static fixture parses");
        let decoded = decode_jwks(jwks).expect("decode succeeds");
        assert!(decoded.is_empty(), "kidless entries cannot be looked up");
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
