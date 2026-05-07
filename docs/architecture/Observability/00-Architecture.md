# Observability Architecture

xstream uses OpenTelemetry (OTel) for structured logs and distributed traces. The telemetry backend is configured entirely through environment variables — switching the production sink (e.g. from self-hosted Seq to Axiom or Grafana Cloud) requires no code changes.

```
Browser (client)
  OTel SDK (sdk-trace-web, sdk-logs)
    BatchSpanProcessor → OTLPTraceExporter  → POST <endpoint>/v1/traces
    BatchLogRecordProcessor → OTLPLogExporter → POST <endpoint>/v1/logs
              │
              │  Dev: Rsbuild proxy /ingest/otlp → http://localhost:5341
              │  Prod (packaged Tauri): PUBLIC_OTEL_ENDPOINT baked at build time
              │
              ▼
Server (Rust)
  OTel SDK (tracing, tracing-opentelemetry)
    PeriodicBatchSpanProcessor → OTLPExporter  → OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces
    PeriodicBatchLogProcessor  → OTLPExporter  → OTEL_EXPORTER_OTLP_ENDPOINT/v1/logs
              │
              ▼
        Seq local (dev)  /  Seq self-hosted on a droplet (prod)
```

The production sink is a self-hosted Seq instance — same image as local dev, just behind Caddy + Let's Encrypt on a DigitalOcean droplet. See [`../Deployment/03-Remote-Seq-DigitalOcean.md`](../Deployment/03-Remote-Seq-DigitalOcean.md) for the bring-up runbook and [`03-Config-And-Backends.md`](03-Config-And-Backends.md) for the env-var contract. Axiom remains a documented drop-in alternative for projects that prefer a SaaS sink.

When the resolved endpoint is non-localhost, a redaction layer scrubs PII attributes before export — see [`01-Logging-Policy.md` § PII Redaction](01-Logging-Policy.md#pii-redaction). Local dev exports unredacted so engineers see full attribute content while debugging.

W3C `traceparent` / `tracestate` headers are injected by the client's fetch instrumentation into every GraphQL request and `/stream/:jobId` request. The server extracts these headers and creates child spans, linking the full client → server trace under a single `traceId`.
