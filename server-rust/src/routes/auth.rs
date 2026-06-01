//! Local session lifecycle. See docs/architecture/Identity/.
//!
//! `POST /auth/session` exchanges a verified Supabase JWT for a service-signed
//! local session token; `POST /auth/logout` revokes it; `GET /auth/me` returns
//! the caller's identity when the local session is valid and active.

use axum::{
    extract::Extension,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
};
use serde::Serialize;

use crate::config::AppContext;
use crate::db::{insert_session, is_session_active, revoke_session, SessionRow};
use crate::services::local_session;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionResponse {
    token: String,
    user_id: String,
    email: Option<String>,
    expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MeResponse {
    user_id: String,
    email: Option<String>,
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?.trim();
    let prefix = value.get(..7)?;
    if prefix.eq_ignore_ascii_case("Bearer ") {
        Some(value[7..].trim())
    } else {
        None
    }
}

/// Exchange a Supabase JWT (verified online via JWKS) for a local session
/// token that validates offline for ~30 days.
pub async fn issue_session(Extension(ctx): Extension<AppContext>, headers: HeaderMap) -> Response {
    let Some(supabase_token) = bearer(&headers) else {
        return (StatusCode::UNAUTHORIZED, "missing bearer token").into_response();
    };
    let Some(jwks) = ctx.jwks_cache.clone() else {
        return (StatusCode::SERVICE_UNAVAILABLE, "auth is not configured").into_response();
    };
    let claims = match jwks.verify_token(supabase_token).await {
        Ok(c) => c,
        Err(err) => {
            tracing::debug!(error = %err, "issue_session: Supabase token verification failed");
            return (StatusCode::UNAUTHORIZED, "invalid Supabase token").into_response();
        }
    };

    let minted = match local_session::mint(
        &ctx.local_session_secret,
        &claims.sub,
        claims.email.as_deref(),
    ) {
        Ok(m) => m,
        Err(err) => {
            tracing::error!(error = %err, "issue_session: failed to mint local session");
            return (StatusCode::INTERNAL_SERVER_ERROR, "failed to mint session").into_response();
        }
    };
    let expires_at = minted
        .expires_at
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let row = SessionRow {
        jti: minted.jti,
        user_id: claims.sub.clone(),
        email: claims.email.clone(),
        issued_at: minted
            .issued_at
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        expires_at: expires_at.clone(),
        revoked_at: None,
    };
    if let Err(err) = insert_session(&ctx.db, &row) {
        tracing::error!(error = %err, "issue_session: failed to persist session row");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to persist session",
        )
            .into_response();
    }
    tracing::info!(user.id = %claims.sub, "local session issued");
    Json(SessionResponse {
        token: minted.token,
        user_id: claims.sub,
        email: claims.email,
        expires_at,
    })
    .into_response()
}

/// Revoke the caller's local session. Idempotent — an absent/unverifiable
/// token still returns 204 so a best-effort client logout never errors.
pub async fn logout(Extension(ctx): Extension<AppContext>, headers: HeaderMap) -> Response {
    if let Some(token) = bearer(&headers) {
        if let Ok(claims) = local_session::verify(&ctx.local_session_secret, token) {
            let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
            match revoke_session(&ctx.db, &claims.jti, &now) {
                Ok(_) => tracing::info!(user.id = %claims.sub, "local session revoked"),
                Err(err) => tracing::warn!(error = %err, "logout: failed to revoke session"),
            }
        }
    }
    StatusCode::NO_CONTENT.into_response()
}

/// Identity for a valid + active local session; 401 otherwise. The client
/// calls this on boot to decide "signed in" — it works offline.
pub async fn me(Extension(ctx): Extension<AppContext>, headers: HeaderMap) -> Response {
    let Some(token) = bearer(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let claims = match local_session::verify(&ctx.local_session_secret, token) {
        Ok(c) => c,
        Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
    };
    match is_session_active(&ctx.db, &claims.jti) {
        Ok(true) => Json(MeResponse {
            user_id: claims.sub,
            email: claims.email,
        })
        .into_response(),
        _ => StatusCode::UNAUTHORIZED.into_response(),
    }
}
