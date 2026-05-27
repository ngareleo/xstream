//! Async-graphql `Extension` that times each operation and logs its name, duration, and error count inside the per-request span. See docs/architecture/Observability/.

use std::sync::Arc;
use std::time::Instant;

use async_graphql::async_trait;
use async_graphql::extensions::{Extension, ExtensionContext, ExtensionFactory, NextExecute};
use async_graphql::Response;

pub struct OperationTracer;

impl ExtensionFactory for OperationTracer {
    fn create(&self) -> Arc<dyn Extension> {
        Arc::new(OperationTracerImpl)
    }
}

struct OperationTracerImpl;

#[async_trait::async_trait]
impl Extension for OperationTracerImpl {
    async fn execute(
        &self,
        ctx: &ExtensionContext<'_>,
        operation_name: Option<&str>,
        next: NextExecute<'_>,
    ) -> Response {
        let started = Instant::now();
        let response = next.run(ctx, operation_name).await;
        // Runs inside the per-request http.request span, so this log inherits
        // the trace_id + session.id. Operation name stays an attribute (never a
        // span name) — it's client-defined, so using it as a name would explode
        // cardinality.
        tracing::info!(
            graphql.operation = operation_name.unwrap_or("anonymous"),
            graphql.duration_ms = started.elapsed().as_millis() as u64,
            graphql.error_count = response.errors.len(),
            "graphql operation"
        );
        response
    }
}
