# Observability Architecture

xstream uses OpenTelemetry (OTel) for structured logs and distributed traces. The telemetry backend is configured entirely through environment variables — switching from local Seq to a cloud provider (Axiom, Grafana Cloud, etc.) requires no code changes.

```
Browser (client)
  OTel SDK (sdk-trace-web, sdk-logs)
    BatchSpanProcessor → OTLPTraceExporter  → POST /ingest/otlp/v1/traces
    BatchLogRecordProcessor → OTLPLogExporter → POST /ingest/otlp/v1/logs
              │
              │  Rsbuild dev proxy: /ingest/otlp → http://localhost:5341
              │  (no CORS issues; client credentials stay out of the bundle)
              ▼
Server (Bun)
  OTel SDK (sdk-trace-base, sdk-logs)
    BatchSpanProcessor → OTLPTraceExporter  → OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces
    BatchLogRecordProcessor → OTLPLogExporter → OTEL_EXPORTER_OTLP_ENDPOINT/v1/logs
              │
              ▼
        Seq (dev)  /  Axiom (prod)
```

W3C `traceparent` / `tracestate` headers are injected by the client's fetch instrumentation into every GraphQL request and `/stream/:jobId` request. The server extracts these headers and creates child spans, linking the full client → server trace under a single `traceId`.
