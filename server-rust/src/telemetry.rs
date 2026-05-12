//! Tracing + OpenTelemetry init. See docs/architecture/Observability/03-Config-And-Backends.md.

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

/// Initialise tracing + OTLP exporter. Call once at process start.
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

    // Unset RUST_LOG is a valid state — fall back to the documented default.
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

/// Flush in-flight spans and shut the exporter down. Best-effort.
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

/// Parse `Key1=Val1,Key2=Val2` into a map. Malformed pairs are dropped.
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

/// `deployment.environment` resource attribute value, driven by `XSTREAM_VARIANT`.
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
        assert_eq!(h.len(), 2);
        assert_eq!(h.get("key"), Some(&"".to_string()));
    }

    #[test]
    fn parse_headers_handles_value_with_equals() {
        let h = parse_headers("Authorization=Basic Zm9vOmJhcj09");
        assert_eq!(
            h.get("Authorization"),
            Some(&"Basic Zm9vOmJhcj09".to_string())
        );
    }

    #[test]
    fn resolve_endpoint_default_falls_back_to_local_seq() {
        std::env::remove_var("OTEL_EXPORTER_OTLP_ENDPOINT");
        std::env::remove_var("OTEL_EXPORTER_OTLP_HEADERS");
        let (endpoint, headers) = resolve_endpoint(false);
        assert_eq!(endpoint, DEFAULT_ENDPOINT);
        assert!(headers.is_empty());
    }
}
