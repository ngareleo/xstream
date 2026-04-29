//! Async-graphql `Extension` that logs every `errors[]` entry on a
//! response via `tracing::error!`.
//!
//! Why this lives here, not in resolvers:
//! - Resolvers `?`-propagate `DbError` / `GlobalIdError` etc. into
//!   `async_graphql::Error`. Those errors flow through async-graphql's
//!   own machinery and end up in the response's `errors[]` array — but
//!   nothing along that path emits a tracing event, so without this
//!   extension a failed query is *invisible to the operator*. The user
//!   sees the typed error in the response; the operator sees nothing.
//!
//! - The extension's `request` hook runs **inside the per-request
//!   `http.request` span** (created by `request_context::extract_request_context`),
//!   so the resulting `tracing::error!` events inherit the W3C trace
//!   context. `tracing-opentelemetry` translates that into the OTLP
//!   payload's TraceId, and Seq surfaces them under the same trace as
//!   the originating GraphQL request — clickable correlation, no manual
//!   trace_id field needed.
//!
//! Pairs with the "Never swallow errors" invariant in
//! `docs/code-style/Invariants/00-Never-Violate.md` §14: propagation
//! alone isn't enough; the error has to be *seen*.

use std::sync::Arc;

use async_graphql::async_trait;
use async_graphql::extensions::{Extension, ExtensionContext, ExtensionFactory, NextRequest};
use async_graphql::{PathSegment, Response};

pub struct ErrorLogger;

impl ExtensionFactory for ErrorLogger {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(ErrorLoggerImpl)
    }
}

struct ErrorLoggerImpl;

#[async_trait::async_trait]
impl Extension for ErrorLoggerImpl {
    async fn request(&self, ctx: &ExtensionContext<'_>, next: NextRequest<'_>) -> Response {
        let response = next.run(ctx).await;
        for err in &response.errors {
            // Render the path as a dotted GraphQL field selector
            // (e.g. `addToWatchlist.video`) so it groups cleanly in Seq.
            let path: String = err
                .path
                .iter()
                .map(|seg| match seg {
                    PathSegment::Field(name) => name.clone(),
                    PathSegment::Index(i) => i.to_string(),
                })
                .collect::<Vec<_>>()
                .join(".");
            tracing::error!(
                graphql.error_message = %err.message,
                graphql.error_path = %path,
                graphql.error_locations = ?err.locations,
                "graphql resolver error"
            );
        }
        response
    }
}
