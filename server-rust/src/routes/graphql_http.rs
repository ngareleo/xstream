//! Custom POST /graphql handler that bridges axum extensions into
//! async-graphql `Data`.
//!
//! Why not `async_graphql_axum::GraphQL::new(schema)`? Its Service
//! wrapper doesn't expose a hook for per-request data — the
//! `request.data(RequestContext)` step is the only way an async-graphql
//! resolver can see what `extract_auth_identity` stamped on the axum
//! `RequestContext`. And we can't write a handler that uses
//! `GraphQLRequest`/`GraphQLResponse` extractors either: async-graphql-axum
//! 7.x pins axum 0.8, while the rest of the server is on axum 0.7, so the
//! `Handler` trait the two crates produce don't unify.
//!
//! The workaround is to skip the async-graphql-axum extractors entirely:
//! collect the request body ourselves and deserialize into async-graphql's
//! own `BatchRequest`, attach `RequestContext`, execute, then JSON-encode
//! the response. The shape is the standard GraphQL-over-HTTP body
//! (`{"query": "...", "variables": {...}, "operationName": "..."}` or a
//! JSON array for batches).

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

/// Maximum request body size — defensive cap to keep a hostile client
/// from streaming an unbounded JSON document at the parser. 4 MiB is
/// well above any realistic GraphQL query (typical bodies are <4 KiB).
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

/// Optional GraphiQL playground — useful in dev. The Tauri shell never
/// hits this route in production. Kept here as a sibling of the POST
/// handler so the schema URL stays consistent.
#[allow(dead_code)]
pub async fn graphiql() -> impl IntoResponse {
    axum::response::Html(GraphiQLSource::build().endpoint("/graphql").finish())
}
