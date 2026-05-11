//! POST /graphql handler. See `docs/architecture/Identity/02-Session-And-Refresh.md` §"Known gaps".

use async_graphql::http::GraphiQLSource;
use async_graphql::BatchRequest;
use axum::{
    body::{to_bytes, Body},
    extract::{Extension, Request},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};

use crate::graphql::XstreamSchema;
use crate::request_context::RequestContext;

/// Defensive cap on GraphQL request body; typical bodies are <4 KiB.
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

pub async fn graphql_post(
    Extension(schema): Extension<XstreamSchema>,
    Extension(req_ctx): Extension<RequestContext>,
    request: Request<Body>,
) -> Response {
    let body = match to_bytes(request.into_body(), MAX_BODY_BYTES).await {
        Ok(b) => b,
        Err(err) => {
            tracing::warn!(error = %err, "rejected GraphQL request — body read failed");
            return (StatusCode::BAD_REQUEST, "request body too large or unreadable")
                .into_response();
        }
    };

    let batch: BatchRequest = match serde_json::from_slice(&body) {
        Ok(req) => req,
        Err(err) => {
            tracing::warn!(error = %err, "rejected GraphQL request — malformed JSON");
            return (StatusCode::BAD_REQUEST, "malformed GraphQL request body")
                .into_response();
        }
    };

    let batch = batch.data(req_ctx);
    let response = schema.execute_batch(batch).await;

    let body = match serde_json::to_vec(&response) {
        Ok(b) => b,
        Err(err) => {
            tracing::error!(error = %err, "failed to serialize GraphQL response");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let mut resp = Response::new(Body::from(body));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    resp
}

/// Dev-only GraphiQL playground.
#[allow(dead_code)]
pub async fn graphiql() -> impl IntoResponse {
    axum::response::Html(GraphiQLSource::build().endpoint("/graphql").finish())
}
