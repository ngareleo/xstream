//! Tracing + OpenTelemetry initialisation — OTLP/HTTP exporter to Seq, W3C TraceContext propagator.

use std::time::Duration;

use opentelemetry::{global, trace::TracerProvider as _, KeyValue};
use opentelemetry_otlp::{Protocol, WithExportConfig};
use opentelemetry_sdk::{
    propagation::TraceContextPropagator, runtime, trace::TracerProvider, Resource,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "xstream-server-rust";
const DEFAULT_ENDPOINT: &str = "http://localhost:5341/ingest/otlp";

/// Initialise tracing + OTLP exporter. Call exactly once at process start.
/// Returns `Err` if the exporter pipeline can't be built — the caller
/// decides whether that's fatal (today: yes; main exits non-zero).
pub fn init() -> AppResult<()> {
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
        .map_err(|err| AppError::Telemetry(Box::new(err)))?;

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
