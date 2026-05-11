# Observability Architecture

xstream uses OpenTelemetry (OTel) for structured logs and distributed traces. The telemetry backend is configured entirely through environment variables — switching the production sink (e.g. from Axiom to Grafana Cloud or back to a self-hosted Seq) requires no code changes.

```
Browser (client)
  OTel SDK (sdk-trace-web, sdk-logs)
    BatchSpanProcessor → OTLPTraceExporter  → POST <endpoint>/v1/traces
    BatchLogRecordProcessor → OTLPLogExporter → POST <endpoint>/v1/logs
              │
              │  Dev: Rsbuild proxy /ingest/otlp → http://localhost:5341 (local Seq)
              │  Prod (packaged Tauri): PUBLIC_OTEL_ENDPOINT baked at build time → Axiom
              │
              ▼
Server (Rust)
  OTel SDK (tracing, tracing-opentelemetry)
    PeriodicBatchSpanProcessor → OTLPExporter  → OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces
    PeriodicBatchLogProcessor  → OTLPExporter  → OTEL_EXPORTER_OTLP_ENDPOINT/v1/logs
              │
              ▼
        Local Seq (dev)  /  Axiom (prod)
```

The production sink is [Axiom](https://axiom.co) — a hosted OTLP/HTTP backend. We use it for the alpha because our data footprint (~180 MB/month) fits comfortably inside the free tier and we avoid the operational overhead of self-hosting. See [`../Deployment/04-Axiom-Production-Backend.md`](../Deployment/04-Axiom-Production-Backend.md) for the bring-up runbook, [`../Deployment/05-Telemetry-Ingestion-Security.md`](../Deployment/05-Telemetry-Ingestion-Security.md) for the threat model around the embedded ingestion tokens, and [`03-Config-And-Backends.md`](03-Config-And-Backends.md) for the env-var contract. Grafana Cloud, Honeycomb, and self-hosted Seq remain documented drop-in alternatives.

When the resolved endpoint is non-localhost, a redaction layer scrubs PII attributes before export — see [`01-Logging-Policy.md` § PII Redaction](01-Logging-Policy.md#pii-redaction). Local dev exports unredacted so engineers see full attribute content while debugging.

W3C `traceparent` / `tracestate` headers are injected by the client's fetch instrumentation into every GraphQL request and `/stream/:jobId` request. The server extracts these headers and creates child spans, linking the full client → server trace under a single `traceId`.
