//! Tracing + OpenTelemetry initialisation.
//!
//! Mirrors the Bun setup (`server/src/telemetry/`):
//! - OTLP/HTTP protobuf exporter
//! - Endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT`, defaulting to
//!   `http://localhost:5341/ingest/otlp` (Seq in dev)
//! - W3C TraceContext propagator registered globally so the
//!   `RequestContext` middleware can extract `traceparent` from any peer.

use std::time::Duration;

use opentelemetry::{global, trace::TracerProvider as _, KeyValue};
use opentelemetry_otlp::{Protocol, WithExportConfig};
use opentelemetry_sdk::{
    propagation::TraceContextPropagator, runtime, trace::TracerProvider, Resource,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

const SERVICE_NAME: &str = "xstream-server-rust";
const DEFAULT_ENDPOINT: &str = "http://localhost:5341/ingest/otlp";

/// Initialise tracing + OTLP exporter. Call exactly once at process start.
///
/// Panics if the exporter pipeline cannot be built — this is fail-fast by
/// design (matches the Bun server's behaviour where missing telemetry
/// is surfaced loudly rather than silently dropped).
pub fn init() {
    global::set_text_map_propagator(TraceContextPropagator::new());

    let endpoint =
        std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.into());
    let traces_endpoint = format!("{}/v1/traces", endpoint.trim_end_matches('/'));

    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_http()
        .with_protocol(Protocol::HttpBinary)
        .with_endpoint(traces_endpoint)
        .with_timeout(Duration::from_secs(10))
        .build()
        .expect("build OTLP span exporter");

    let provider = TracerProvider::builder()
        .with_batch_exporter(exporter, runtime::Tokio)
        .with_resource(Resource::new(vec![KeyValue::new(
            "service.name",
            SERVICE_NAME,
        )]))
        .build();

    let tracer = provider.tracer(SERVICE_NAME);
    global::set_tracer_provider(provider);

    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info,xstream_server=debug,tower_http=debug,axum=debug")
    });

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(true).compact())
        .with(otel_layer)
        .init();
}

/// Flush in-flight spans and shut the exporter down. Call from the SIGTERM
/// path before `process::exit`.
pub fn shutdown() {
    global::shutdown_tracer_provider();
}
