use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use opentelemetry::Context as OtelContext;
use opentelemetry_http::HeaderExtractor;
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;

/// Per-request context threaded through every handler from day one.
///
/// The Bun server's GraphQL context is a single field (`otelCtx`). The Rust
/// port replaces it with a richer struct so that when peer-sharing ships
/// (`docs/migrations/rust-rewrite/04-Web-Server-Layer.md` §3.3 / §4.3),
/// `peer_node_id` and `share_grant` can be populated by an auth middleware
/// without rewriting every handler signature.
///
/// Today both forward fields are always `None` — the *shape* exists.
#[derive(Clone, Debug, Default)]
pub struct RequestContext {
    pub otel_ctx: OtelContext,
    pub peer_node_id: Option<String>,
    pub share_grant: Option<ShareGrant>,
}

#[derive(Clone, Debug)]
pub struct ShareGrant {
    pub _placeholder: (),
}

pub async fn extract_request_context(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let otel_ctx = otel_context_from_headers(req.headers());
    let ctx = RequestContext {
        otel_ctx: otel_ctx.clone(),
        peer_node_id: None,
        share_grant: None,
    };
    req.extensions_mut().insert(ctx);

    let method = req.method().to_string();
    let target = req.uri().path().to_string();
    let span = tracing::info_span!(
        "http.request",
        http.method = %method,
        http.target = %target,
    );
    // Inbound `traceparent` becomes the parent of this span — so the OTel
    // export carries the same trace_id the client started.
    span.set_parent(otel_ctx);

    Ok(next.run(req).instrument(span).await)
}

fn otel_context_from_headers(headers: &HeaderMap) -> OtelContext {
    opentelemetry::global::get_text_map_propagator(|propagator| {
        propagator.extract(&HeaderExtractor(headers))
    })
}
