# Observability

xstream uses OpenTelemetry (OTel) for structured logs and distributed traces. The telemetry backend is configured entirely through environment variables — switching from local Seq to a cloud provider (Axiom, Grafana Cloud, etc.) requires no code changes.

---

## Architecture

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

---

## What is instrumented

### Server
| Span | Trigger | Key attributes |
|---|---|---|
| `stream.request` | GET /stream/:jobId | `job_id`, `from_index`, `segments_sent` |
| `transcode.job` | startTranscodeJob | `job_id`, `resolution`, `chunk_start_s`, `chunk_duration_s` |
| `library.scan` | scanLibraries | `library_path`, `library_name`, `files_found` |

Structured log events are emitted for each significant state transition (init ready, transcode complete, scan matched, etc.) with a `component` attribute for easy filtering.

### Client
| Span / log | Trigger | Key attributes |
|---|---|---|
| `playback.session` | startPlayback | `video_id`, `resolution` |
| `graphql.request` | every Relay fetch | `operation.name` (via fetch instrumentation) |
| `stream.fetch` | StreamingService /stream/ fetch | `job_id` (via fetch instrumentation) |
| log: `playback.start` | startPlayback called | `video_id`, `resolution`, `duration_s` |
| log: `playback.seek` | seek triggered | `seek_target_s`, `snapped_to_s` |
| log: `playback.stall` | buffering >2s | `stall_duration_ms` |
| log: `playback.resolution_switch` | resolution changed | `from`, `to` |
| log: `playback.error` | any playback error | `message`, `component` |
| Long task spans | task >50ms blocks main thread | `duration_ms` (via instrumentation-long-task) |

---

## Searching in Seq

To find all events for a single playback session:

1. Open [http://localhost:5341](http://localhost:5341)
2. In the search bar, filter by trace ID:
   ```
   @TraceId = 'abc123...'
   ```
3. Or filter by component and time:
   ```
   component = 'chunker' and @Timestamp > 2m ago
   ```
4. Use the **Trace** view to see the parent-child span tree for a given `traceId`

---

## Environment variables

### Server

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:5341/ingest/otlp` | OTLP base URL (no trailing slash, no `/v1/...` path) |
| `OTEL_EXPORTER_OTLP_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers, e.g. `X-Seq-ApiKey=abc123` |

### Client (baked at build time by Rsbuild)

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_OTEL_ENDPOINT` | `/ingest/otlp` | OTLP base URL for browser. Relative path works in dev (proxied). Use full URL in prod. |
| `PUBLIC_OTEL_HEADERS` | _(empty)_ | Comma-separated `Key=Value` headers for browser OTLP export |

---

## Switching to a production backend

To route telemetry to Axiom in production, update the env vars (no code changes needed):

```bash
# Server
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <axiom-token>,X-Axiom-Dataset=xstream-prod

# Client (set before running bun run build)
PUBLIC_OTEL_ENDPOINT=https://api.axiom.co
PUBLIC_OTEL_HEADERS=Authorization=Bearer <axiom-token>,X-Axiom-Dataset=xstream-prod
```

Axiom accepts OTLP/HTTP natively. Other OTLP-compatible backends (Grafana Cloud, Honeycomb, Jaeger, etc.) follow the same pattern — just change the endpoint and headers.

---

## Seq API key setup

1. Run `bun seq:start` and open [http://localhost:5341](http://localhost:5341)
2. Sign in with the admin password from `.env` (`SEQ_ADMIN_PASSWORD`)
3. Navigate to **Settings → API Keys → Add API Key**
4. Give it a name (e.g. `xstream-dev`), set permissions to **Ingest**
5. Copy the key and add it to `.env`:
   ```
   OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<key>
   PUBLIC_OTEL_HEADERS=X-Seq-ApiKey=<key>
   ```
6. Restart the dev server (`bun run dev`) — telemetry will start flowing immediately

---

## Release-time metrics

See `docs/todo.md` items `OBS-001` through `OBS-004` for the planned metrics instrumentation (buffer rates, error classification, usage metrics). These require the OTel metrics SDK (`MeterProvider`) which is not yet wired up.
