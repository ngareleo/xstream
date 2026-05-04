//! Async-graphql `Extension` that logs every `errors[]` entry via `tracing::error!` inside the per-request span. See docs/architecture/Observability/.

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
