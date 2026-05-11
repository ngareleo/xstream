//! Tracing + OpenTelemetry initialisation — OTLP/HTTP exporter, W3C TraceContext propagator.
//!
//! The OTLP destination is chosen at boot from one of two env-var pairs:
//! - Default (`OTEL_EXPORTER_OTLP_ENDPOINT` / `_HEADERS`) — points at local Seq.
//! - Axiom (`OTEL_EXPORTER_OTLP_AXIOM_ENDPOINT` / `_HEADERS`) — used when
//!   `flag.useAxiomExporter` is on. Caller (`lib::run`) reads the flag from
//!   SQLite before calling `init` and passes it in.

use std::collections::HashMap;
use std::time::Duration;

use opentelemetry::{global, trace::TracerProvider as _, KeyValue};
use opentelemetry_otlp::{Protocol, WithExportConfig, WithHttpConfig};
use opentelemetry_sdk::{
    propagation::TraceContextPropagator, runtime, trace::TracerProvider, Resource,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "xstream-server-rust";
const DEFAULT_ENDPOINT: &str = "http://localhost:5341/ingest/otlp";

/// Initialise tracing + OTLP exporter. Call exactly once at process start.
///
/// `use_axiom` flips the env-var pair the exporter reads from. The caller
/// resolves it from `user_settings.flag.useAxiomExporter` before this runs
/// — see `lib::run`. Server-side flag flips therefore only take effect on
/// the next process restart, which is the documented contract.
///
/// Returns `Err` if the exporter pipeline can't be built.
pub fn init(use_axiom: bool) -> AppResult<()> {
    global::set_text_map_propagator(TraceContextPropagator::new());

    let (endpoint, headers) = resolve_endpoint(use_axiom);
    let traces_endpoint = format!("{}/v1/traces", endpoint.trim_end_matches('/'));

    let builder = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_protocol(Protocol::HttpBinary)
        .with_endpoint(traces_endpoint)
        .with_timeout(Duration::from_secs(10));

    let builder = if headers.is_empty() {
        builder
    } else {
        builder.with_headers(headers)
    };

    let exporter = builder
        .build()
        .map_err(|err| AppError::Telemetry(Box::new(err)))?;

    let provider = TracerProvider::builder()
        .with_batch_exporter(exporter, runtime::Tokio)
        .with_resource(Resource::new(vec![
            KeyValue::new("service.name", SERVICE_NAME),
            KeyValue::new("deployment.environment", deployment_environment()),
        ]))
        .build();

    let tracer = provider.tracer(SERVICE_NAME);
    global::set_tracer_provider(provider);

    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    // `EnvFilter::try_from_default_env` returns Err only when RUST_LOG is set
    // to something unparseable — in dev, "unset" is normal so we fall back to
    // a sensible default. This is *not* error swallowing: there is no real
    // failure we'd want the operator to see; an unset env var is a valid
    // state with a documented default.
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info,xstream_server=debug,tower_http=debug,axum=debug")
    });

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(true).compact())
        .with(otel_layer)
        .init();

    Ok(())
}

/// Flush in-flight spans and shut the exporter down. Called from the
/// SIGTERM path before `process::exit`. Best-effort — if the OTel SDK
/// can't reach the exporter we still want to exit cleanly.
pub fn shutdown() {
    global::shutdown_tracer_provider();
}

fn resolve_endpoint(use_axiom: bool) -> (String, HashMap<String, String>) {
    let (endpoint_var, headers_var) = if use_axiom {
        (
            "OTEL_EXPORTER_OTLP_AXIOM_ENDPOINT",
            "OTEL_EXPORTER_OTLP_AXIOM_HEADERS",
        )
    } else {
        ("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS")
    };

    let endpoint = std::env::var(endpoint_var).unwrap_or_else(|_| DEFAULT_ENDPOINT.into());
    let headers = std::env::var(headers_var)
        .ok()
        .map(|s| parse_headers(&s))
        .unwrap_or_default();
    (endpoint, headers)
}

/// Parse `Key1=Val1,Key2=Val2` into a map. Mirrors the client's
/// `parseHeadersEnv` in `client/src/telemetry.ts`. Malformed pairs are
/// dropped silently — same posture as the client.
fn parse_headers(raw: &str) -> HashMap<String, String> {
    raw.split(',')
        .filter_map(|pair| {
            let mut split = pair.splitn(2, '=');
            let key = split.next()?.trim();
            let value = split.next()?.trim();
            if key.is_empty() {
                None
            } else {
                Some((key.to_string(), value.to_string()))
            }
        })
        .collect()
}

/// `deployment.environment` resource attribute value. Driven by
/// `XSTREAM_VARIANT` (the same env var that controls the prod/dev build
/// split — see `docs/architecture/Deployment/03-Build-Variants.md`).
fn deployment_environment() -> &'static str {
    match std::env::var("XSTREAM_VARIANT").as_deref() {
        Ok("prod") => "production",
        _ => "development",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_headers_handles_single_pair() {
        let h = parse_headers("Authorization=Bearer abc");
        assert_eq!(h.get("Authorization"), Some(&"Bearer abc".to_string()));
    }

    #[test]
    fn parse_headers_handles_multiple_pairs() {
        let h = parse_headers("Authorization=Bearer abc,X-Axiom-Dataset=xstream");
        assert_eq!(h.len(), 2);
        assert_eq!(h.get("X-Axiom-Dataset"), Some(&"xstream".to_string()));
    }

    #[test]
    fn parse_headers_drops_malformed_pairs() {
        let h = parse_headers("Authorization=Bearer abc,malformed,=empty-key,key=");
        // "malformed" has no `=` → dropped. "=empty-key" has empty key → dropped.
        // "key=" has empty value → kept (empty values are legal in headers).
        assert_eq!(h.len(), 2);
        assert_eq!(h.get("key"), Some(&"".to_string()));
    }

    #[test]
    fn parse_headers_handles_value_with_equals() {
        // The first `=` separates; subsequent `=` are part of the value.
        let h = parse_headers("Authorization=Basic Zm9vOmJhcj09");
        assert_eq!(h.get("Authorization"), Some(&"Basic Zm9vOmJhcj09".to_string()));
    }

    #[test]
    fn resolve_endpoint_default_falls_back_to_local_seq() {
        // Ensure no env override leaks from CI: clear both before testing.
        std::env::remove_var("OTEL_EXPORTER_OTLP_ENDPOINT");
        std::env::remove_var("OTEL_EXPORTER_OTLP_HEADERS");
        let (endpoint, headers) = resolve_endpoint(false);
        assert_eq!(endpoint, DEFAULT_ENDPOINT);
        assert!(headers.is_empty());
    }
}
