use axum::{
    extract::{Extension, Request},
    http::{header, HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use opentelemetry::trace::TraceContextExt;
use opentelemetry::Context as OtelContext;
use opentelemetry_http::HeaderExtractor;
use tracing::Instrument;
use tracing_opentelemetry::OpenTelemetrySpanExt;

use crate::config::AppContext;

/// Per-request context. Identity in `docs/architecture/Identity/`, sharing in `docs/architecture/Sharing/`.
#[derive(Clone, Debug, Default)]
pub struct RequestContext {
    pub otel_ctx: OtelContext,
    pub peer_node_id: Option<String>,
    pub share_grant: Option<ShareGrant>,
    pub user_id: Option<String>,
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
        user_id: None,
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
        user.id = tracing::field::Empty,
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
    // access log lands in Seq alongside the trace. Standard shape:
    // method, path, status, duration_ms, trace_id.
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

/// Verify the Bearer JWT and record `user.id` on the http.request span. See `docs/architecture/Identity/02-Session-And-Refresh.md`.
pub async fn extract_auth_identity(
    Extension(app_ctx): Extension<AppContext>,
    mut req: Request,
    next: Next,
) -> Response {
    let Some(jwks) = app_ctx.jwks_cache.clone() else {
        return next.run(req).await;
    };

    let bearer = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(strip_bearer_prefix);

    if let Some(token) = bearer {
        match jwks.verify_token(token).await {
            Ok(claims) => {
                if let Some(req_ctx) = req.extensions_mut().get_mut::<RequestContext>() {
                    req_ctx.user_id = Some(claims.sub.clone());
                }
                tracing::Span::current().record("user.id", claims.sub.as_str());
            }
            Err(err) => {
                tracing::debug!(error = %err, "JWT verification failed; continuing as anonymous");
            }
        }
    }

    next.run(req).await
}

fn strip_bearer_prefix(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    // `Bearer ` is case-insensitive on the wire per RFC 6750.
    let lower = trimmed.get(..7)?;
    if lower.eq_ignore_ascii_case("Bearer ") {
        Some(trimmed[7..].trim())
    } else {
        None
    }
}

//
// Verifies the load-bearing primitive `otel_context_from_headers` — the
// W3C `traceparent` header is parsed into an `OtelContext` whose SpanContext
// carries the inbound trace_id. The middleware's `span.set_parent(otel_ctx)`
// call is then a one-line bridge from the parsed context to the request's
// tracing span. End-to-end TraceId inheritance was independently confirmed
// by a live Seq query in commit b40b989.

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
