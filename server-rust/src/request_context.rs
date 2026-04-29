use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use opentelemetry::trace::TraceContextExt;
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

    // Pull the trace_id out of the inbound OtelContext so the access log
    // line carries it explicitly. tracing-opentelemetry already attaches
    // the trace_id to every event emitted inside `span` for the OTLP
    // export — but local stdout doesn't render it. The structured field
    // makes it visible in BOTH (`info!(trace_id = …)` lands in stdout AND
    // the OTel attribute pile). Empty hex string when no inbound trace
    // (the propagator returned an invalid SpanContext).
    let trace_id = {
        let span_ctx = otel_ctx.span().span_context().clone();
        if span_ctx.is_valid() {
            span_ctx.trace_id().to_string()
        } else {
            String::new()
        }
    };

    let method = req.method().to_string();
    let target = req.uri().path().to_string();
    let span = tracing::info_span!(
        "http.request",
        http.method = %method,
        http.target = %target,
        http.status = tracing::field::Empty,
        duration_ms = tracing::field::Empty,
        trace_id = %trace_id,
    );
    // Inbound `traceparent` becomes the parent of this span — so the OTel
    // export carries the same trace_id the client started.
    span.set_parent(otel_ctx);

    let started = std::time::Instant::now();
    let response = next.run(req).instrument(span.clone()).await;
    let duration_ms = started.elapsed().as_millis() as u64;
    let status = response.status().as_u16();

    // Record the late-binding fields on the span so OTel exports them, then
    // emit a structured info event inside the span scope so a one-line
    // access log lands in Seq alongside the trace. Same shape as the Bun
    // side: method, path, status, duration_ms, trace_id.
    span.record("http.status", status);
    span.record("duration_ms", duration_ms);
    span.in_scope(|| {
        tracing::info!(
            http.method = %method,
            http.target = %target,
            http.status = status,
            duration_ms = duration_ms,
            trace_id = %trace_id,
            "{} {} {} — {}ms (trace={})",
            method,
            target,
            status,
            duration_ms,
            if trace_id.is_empty() { "-" } else { trace_id.as_str() },
        );
    });

    Ok(response)
}

pub(crate) fn otel_context_from_headers(headers: &HeaderMap) -> OtelContext {
    opentelemetry::global::get_text_map_propagator(|propagator| {
        propagator.extract(&HeaderExtractor(headers))
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Mirrors `server/src/graphql/__tests__/traceparent.test.ts` at the
// extraction layer. Bun's version drives yoga's full request path and
// captures spans through an in-memory exporter; here we verify the
// load-bearing primitive — `otel_context_from_headers` — directly,
// because the Rust pipeline that consumes the OtelContext (the
// `set_parent` call in `extract_request_context`) is a one-line bridge
// that the Bun test was indirectly verifying. End-to-end TraceId
// inheritance was independently confirmed by the live Seq query in
// commit b40b989's e2e session.

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderMap;
    use opentelemetry::trace::TraceContextExt;
    use opentelemetry_sdk::propagation::TraceContextPropagator;

    fn install_propagator_once() {
        // Tests share global state; calling set_text_map_propagator more
        // than once is harmless (last write wins) but doing it lazily
        // means a single-test run via `cargo test test_name` still works.
        opentelemetry::global::set_text_map_propagator(TraceContextPropagator::new());
    }

    #[test]
    fn extracts_inbound_trace_and_span_id_from_traceparent_header() {
        install_propagator_once();
        let mut headers = HeaderMap::new();
        let trace_id = "0123456789abcdef0123456789abcdef";
        let span_id = "1122334455667788";
        let traceparent = format!("00-{trace_id}-{span_id}-01");
        headers.insert(
            "traceparent",
            traceparent.parse().expect("static header value parses"),
        );

        let ctx = otel_context_from_headers(&headers);
        let span = ctx.span();
        let span_ctx = span.span_context();

        assert!(
            span_ctx.is_valid(),
            "span context from a well-formed traceparent must be valid"
        );
        assert_eq!(span_ctx.trace_id().to_string(), trace_id);
        assert_eq!(span_ctx.span_id().to_string(), span_id);
        assert!(
            span_ctx.is_remote(),
            "extracted context is the *remote* parent"
        );
    }

    #[test]
    fn returns_invalid_context_when_no_traceparent_header_present() {
        install_propagator_once();
        let headers = HeaderMap::new();
        let ctx = otel_context_from_headers(&headers);
        let span = ctx.span();
        // No header → span context is the empty/invalid one. Downstream
        // `set_parent` on this is a no-op, so resolver spans become root
        // spans (the right behaviour for an unparented request).
        assert!(!span.span_context().is_valid());
    }

    #[test]
    fn returns_invalid_context_when_traceparent_header_is_malformed() {
        install_propagator_once();
        let mut headers = HeaderMap::new();
        headers.insert(
            "traceparent",
            "this-is-not-a-traceparent".parse().expect("ascii header"),
        );
        let ctx = otel_context_from_headers(&headers);
        // Malformed traceparent ≠ panic. The propagator returns an invalid
        // context and we silently drop it, same as if the header were absent.
        // Operators noticing missing trace correlation in Seq will look at
        // the request log — no need to fail the request itself.
        assert!(!ctx.span().span_context().is_valid());
    }
}
