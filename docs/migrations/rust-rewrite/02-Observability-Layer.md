# Observability Layer — Bun → Rust Migration

**Scope.** OpenTelemetry instrumentation in the Bun server and the React client: span creation, structured logging, OTLP export, W3C trace-context propagation, and how the Rust port preserves all of it without breaking existing Seq queries.

**Read first.** The implementation-agnostic policies live in [`Observability/`](../../architecture/Observability/README.md) and survive the rewrite unchanged. This doc focuses on the **runtime SDK and the seams that change.**

- [`Observability/00-Architecture.md`](../../architecture/Observability/00-Architecture.md) — both-sides OTel pipeline, OTLP path, `/ingest/otlp` proxy
- [`Observability/01-Logging-Policy.md`](../../architecture/Observability/01-Logging-Policy.md) — levels, message-body discipline, `kill_reason` enum, threading rules
- [`Observability/04-Verification-Workflow.md`](../../architecture/Observability/04-Verification-Workflow.md) — trace-first verification + the long-span `addEvent` gotcha
- [`01-Streaming-Layer.md`](01-Streaming-Layer.md) — already covers `stream.request` traceparent extraction

---

## 1. Current Bun implementation

### 1.1 Server telemetry — `server/src/telemetry/`

Five files, all small. The package's public API is `getOtelLogger(component)` and `getTracer(component)`.

**Bootstrap order matters** (`server/src/index.ts:1-3`):

```ts
// telemetry must be the first import — it registers the global OTel
// TracerProvider and propagator before any service module runs.
import "./telemetry/index.js";
```

`telemetry/index.ts` (23 lines) is just three side-effect imports:

```ts
import "./tracer.js";   // → trace.setGlobalTracerProvider(...)
import "./logger.js";   // → constructs LoggerProvider with OTLP + dev console mirror
```

If any service module is imported before this, its top-level `getTracer()` / `getOtelLogger()` calls run against the no-op default provider and silently emit nothing. The Rust port preserves this ordering invariant via explicit init in `main()` before any service construction.

**OTLP endpoint config** (`telemetry/config.ts:15-23`):

```ts
export const endpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:5341/ingest/otlp";
export const headers = parseHeadersEnv(process.env.OTEL_EXPORTER_OTLP_HEADERS);
export const resource = resourceFromAttributes({
  "service.name": "xstream-server",
  "deployment.environment": process.env.NODE_ENV ?? "development",
});
```

Two env vars only: `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` (`Key=Val,Key2=Val2`). Switching from local Seq to Axiom / Grafana Cloud / etc. is environment-only — no code changes. The Rust port preserves both env-var names verbatim.

**Tracer provider + W3C propagator** (`telemetry/tracer.ts:8-19`):

```ts
const tracerProvider = new BasicTracerProvider({
  resource,
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers })),
  ],
});
trace.setGlobalTracerProvider(tracerProvider);
propagation.setGlobalPropagator(new W3CTraceContextPropagator());
```

`BasicTracerProvider` (not `NodeTracerProvider`) because Bun is closer to a browser/edge runtime than Node — no auto-instrumentation packages run.

**Logger provider** (`telemetry/logger.ts:12-22`):

```ts
const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new BatchLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
    ...(process.env.NODE_ENV !== "production"
      ? [new SimpleLogRecordProcessor(new PrettyConsoleExporter())]
      : []),
  ],
});
```

Dev mode mirrors every record to the terminal via the in-tree `PrettyConsoleExporter` (server/src/telemetry/console-exporter.ts). Prod ships only OTLP.

**Structured logger surface** (`telemetry/logger.ts:25-29, 36-64`): `getOtelLogger(component)` returns `{ info, warn, error }`, each writing a record with `severityText`, `body`, and the supplied attributes (plus the implicit `component`). Logs emit synchronously into the batch processor; the OTLP exporter flushes on its own timer. The Rust port mirrors this via `tracing::info!(target = "component", ...)` + a `tracing-opentelemetry` bridge.

### 1.2 Client telemetry — `client/src/telemetry.ts`

161 lines — single file. Same OTLP-export model, plus instrumentations.

**Init invariant** (`main.tsx:1-4`):

```ts
import { initTelemetry } from "./telemetry.js";
initTelemetry();
```

Must run **before** any other import that may trigger a `fetch` (Relay environment construction, `StreamingService`, etc.) — `FetchInstrumentation.enable()` patches `window.fetch` at call time, so any fetch made before init goes uninstrumented.

**Endpoint defaults to the Rsbuild dev proxy** (`telemetry.ts:51-52`):

```ts
const endpoint = (import.meta.env.PUBLIC_OTEL_ENDPOINT as string | undefined) ?? "/ingest/otlp";
const headers = parseHeadersEnv(import.meta.env.PUBLIC_OTEL_HEADERS as string | undefined);
```

`PUBLIC_*` is the Rsbuild prefix that exposes env vars to the bundle. The dev proxy (`client/rsbuild.config.*:46`) maps `/ingest/otlp` → `http://localhost:5341`, sidestepping CORS and keeping any production credentials out of the browser bundle.

**Instrumentations** (`telemetry.ts:103-109`):

```ts
new FetchInstrumentation({
  propagateTraceHeaderCorsUrls: [/.*/],
}).enable();
new LongTaskInstrumentation({}).enable();
```

`FetchInstrumentation` injects `traceparent`/`tracestate` on every fetch — including Relay GraphQL POSTs and `GET /stream/:jobId`. `LongTaskInstrumentation` raises browser long-task entries (>50 ms blocking) as their own spans, useful for correlating playback stalls with JS jank.

**Session-context bridge** (`client/src/services/playbackSession.ts`):

```ts
let _sessionCtx: Context = context.active();
export function setSessionContext(ctx: Context): void { _sessionCtx = ctx; }
export function clearSessionContext(): void { _sessionCtx = context.active(); }
export function getSessionContext(): Context { return _sessionCtx; }
```

Module-level singleton because the browser has no `AsyncLocalStorage`. Each `getClientLogger(...).info(...)` call attaches `getSessionContext()` to the log record (`telemetry.ts:139, 148, 157`), and every fetch on the playback path is wrapped: `await context.with(getSessionContext(), () => fetch(url, opts))`. Without the wrap, the SDK assigns a new random traceId per fetch and the trace tree fragments. Cross-reference [`Observability/01-Logging-Policy.md`](../../architecture/Observability/01-Logging-Policy.md) §"Threading trace context into streaming fetches".

**Long-span gotcha** (memory feedback): `playback.session` lives for the entire player-page session. `span.addEvent()` calls on it buffer in memory until the span ends — they don't appear in Seq mid-session. Use `log.info(...)` for mid-session signals; reserve `addEvent` on the long-lived span for events that only matter post-mortem. See §1.4 for the full one-shot vs snapshot pattern that's now codified for this span. This invariant is implementation-agnostic and survives the rewrite unchanged — but the Rust port's `tracing-opentelemetry` bridge has the same property, so the rule still applies for any long-lived server span (e.g. a future `peer.session`).

### 1.3 Span surface today (the OTel API contract)

<!-- Span surface synced from docs/architecture/Observability/server/00-Spans.md — verify against main before porting. -->

The Rust port must emit these span names with the same attribute keys; Seq queries and dashboards filter on them. See [`01-Streaming-Layer.md`](01-Streaming-Layer.md) §1.5 for the verbatim attribute and event lists for the streaming-pipeline spans (`stream.request`, `transcode.job`); the table here is the cross-layer index.

| Span | Origin | Key attributes |
|---|---|---|
| `playback.session` | client | session-level — long-lived for the player page (see §1.4 below for the long-span attribute pattern) |
| `chunk.stream` | client | `chunk.job_id`, `chunk.resolution`, `chunk.is_first` (`client/src/services/chunkPipeline.ts:254`) |
| `buffer.backpressure` | client | per-event short span (`client/src/services/bufferManager.ts:643`) |
| `stream.request` | server | `job.id` (`stream.ts:63-67`) — see [`01-Streaming-Layer.md`](01-Streaming-Layer.md) §1.5 for events |
| `job.resolve` | server | `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s` (`chunker.ts:107`) |
| `transcode.job` | server | `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s`, `job.chunk_duration_s`, `hwaccel`, `hwaccel.forced_software`, `hwaccel.vaapi_sw_pad`, `hwaccel.hdr_tonemap` (`chunker.ts:346`) — see [`01-Streaming-Layer.md`](01-Streaming-Layer.md) §1.5 for the full event list including `transcode_silent_failure` |

Standard `kill_reason` values used in span events and log attributes: `client_request`, `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `max_encode_timeout`, `cascade_retry`, `server_shutdown`. The Rust port emits the same string values verbatim — Seq filters keyed on these stay valid through the migration.

### 1.4 One-shot vs snapshot span-attribute pattern (commits `419861a`, `b6db738`)

Two distinct attribute shapes are now codified for long-lived spans (`playback.session`):

- **One-shot session metrics** — set once via `span.setAttribute(...)` after the value crystallizes. Cold-start metrics (`time_to_first_frame_ms`, `cold_start_init_wait_ms`, etc., `client/src/services/playbackController.ts`) are written in this style: gated by a `firstFrameRecorded` flag so they only land once per session. They appear on the span as ordinary attributes when the span ends.
- **Periodic snapshots** — emitted as `span.addEvent(...)` calls during the session lifetime. Each event carries the snapshot's attribute bag and a timestamp. Used for buffered-ahead, transfer-rate, and other time-series-like values.

**The Rust port's `tracing` layer must support both shapes.** `tracing-opentelemetry` exposes `span.set_attribute(...)` for the one-shot case and `span.add_event(name, attrs)` for the periodic case — both round-trip cleanly through `BatchSpanProcessor` to OTLP. The architectural rule (full text in [`Observability/01-Logging-Policy.md`](../../architecture/Observability/01-Logging-Policy.md)): one-shot for "decided values", events for "things happening over time"; never set the same key twice as a one-shot attribute on a long-lived span (the Seq view of the span shows only the last write, which masks bugs).

Note also the long-span gotcha (memory feedback): on `playback.session`, `addEvent` calls buffer in memory until the span ends — they do not appear in Seq mid-session. For mid-session debugging signals, use `log.info(...)` instead. The Rust `tracing-opentelemetry` bridge has the same property and the rule still applies.

---

## 2. Stable contracts (must not change)

| Contract | Where it's set today | Rust port must |
|---|---|---|
| OTLP endpoint env var | `OTEL_EXPORTER_OTLP_ENDPOINT` | Read the same env var |
| OTLP headers env var (CSV `Key=Val,…`) | `OTEL_EXPORTER_OTLP_HEADERS` | Parse identically (use `opentelemetry-otlp` env feature) |
| Service-name resource attr | `xstream-server` / `xstream-client` | Set the same values |
| W3C trace-context propagation | `W3CTraceContextPropagator` on both sides | Use `opentelemetry::propagation::TextMapPropagator` (W3C) |
| OTLP/HTTP protobuf transport | `@opentelemetry/exporter-trace-otlp-proto` | `opentelemetry-otlp` `http-proto` feature |
| `/v1/traces` and `/v1/logs` paths | `${endpoint}/v1/traces`, `${endpoint}/v1/logs` | Use the standard collector paths (default in `opentelemetry-otlp`) |
| Span names listed in §1.3 | scattered across `chunker.ts` + `stream.ts` | Emit identical names + attribute keys |
| `kill_reason` enum values | scattered | Emit identical strings |
| Logging policy (levels, message body, when to span vs log) | [`Observability/01-Logging-Policy.md`](../../architecture/Observability/01-Logging-Policy.md) | Implementation-agnostic — survives unchanged |

---

## 3. Rust target shape

### 3.1 Crates (locked)

| Concern | Crate | Why |
|---|---|---|
| Span/log API | `tracing` | De-facto Rust ecosystem standard; everything else integrates with it |
| Bridge to OTel | `tracing-opentelemetry` | Maps `tracing` spans + events to OTel spans |
| OTLP exporter | `opentelemetry-otlp` (with `http-proto` feature) | Same wire format as the current `@opentelemetry/exporter-*-otlp-proto` |
| OTel SDK | `opentelemetry_sdk` (with `rt-tokio`) | Provides `BatchSpanProcessor`, `BatchLogRecordProcessor` |
| Propagator | `opentelemetry::propagation::TextMapPropagator` (W3C) | Built-in W3C propagator |
| HTTP middleware | custom + `tower::Layer` | Extract `traceparent`, attach to request extensions |

The OTel-Logs API in Rust is still less stable than the Tracing one. The recommended pattern: use `tracing::info!`/`warn!`/`error!` with structured fields and let `tracing-opentelemetry`'s `OpenTelemetryLayer` forward them to OTLP as log records. Reach for `opentelemetry::logs::Logger` directly only if a specific log record needs attributes that don't fit `tracing`'s field model.

### 3.2 Server bootstrap sketch

```rust
fn init_telemetry() -> WorkerGuard {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:5341/ingest/otlp".into());
    let headers = parse_headers_env(std::env::var("OTEL_EXPORTER_OTLP_HEADERS").ok());

    let resource = Resource::new(vec![
        KeyValue::new("service.name", "xstream-server"),
        KeyValue::new("deployment.environment", env_or("NODE_ENV", "development")),
    ]);

    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .http()
                .with_endpoint(format!("{endpoint}/v1/traces"))
                .with_headers(headers.clone()),
        )
        .with_trace_config(trace::config().with_resource(resource.clone()))
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .expect("OTel tracer init");

    global::set_text_map_propagator(TraceContextPropagator::new());

    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);
    let fmt_layer = tracing_subscriber::fmt::layer().pretty();   // dev console mirror

    tracing_subscriber::registry()
        .with(otel_layer)
        .with(fmt_layer)
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Returned guard flushes on drop; main() holds it.
    init_otlp_logs(endpoint, headers, resource)
}
```

**Bootstrap-order invariant in Rust:** `init_telemetry()` is the first line of `main()` (before `AppState` construction, before any handler module is touched). Same property as the Bun `import "./telemetry/index.js"` ordering — identical reason, just enforced syntactically by `main`.

### 3.3 traceparent extraction middleware (axum)

```rust
async fn extract_traceparent(
    req: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    let parent_ctx = global::get_text_map_propagator(|propagator| {
        propagator.extract(&HeaderExtractor(req.headers()))
    });
    let span = tracing::info_span!("http.request", method = %req.method(), uri = %req.uri());
    span.set_parent(parent_ctx);
    let _enter = span.enter();
    Ok(next.run(req).await)
}
```

Mounted as the outermost tower layer on the axum router so every handler runs inside an extracted-parent span. Handlers that need to start their own named span (`stream.request`, `transcode.job`, `job.resolve`) do so as children of the active span — same shape as `stream.ts:63-67` does today. See [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) for the full middleware stack and how this combines with the `RequestContext` extension.

### 3.4 GraphQL subscription trace propagation

`async-graphql`'s WebSocket handler hands each subscription operation an OTel context derived from the upgrade request's headers, but per-operation propagation requires explicit wiring: extract `traceparent` from the connection's first `connection_init` payload (or from the upgrade headers) and store it on the subscription's `Context` so resolvers can use it as the parent for `playback.subscribe` etc. Out of the box, `async-graphql` does NOT propagate per-subscription traceparent — verify and wire during implementation.

### 3.5 Client telemetry — unchanged

The Rust rewrite touches the server only. The client's `telemetry.ts` keeps working against the Rust server because the wire formats (W3C `traceparent` headers, OTLP `/v1/traces` and `/v1/logs` POSTs) are identical. **In Tauri production**, the Rsbuild dev proxy disappears — the client must point directly at the Rust process's OTLP forwarder or at the Seq endpoint configured at build time. See [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md) for the Tauri-specific routing.

---

## 4. Forward constraints for peer-sharing

The traceparent flow already works cross-peer; what needs to be explicit is **how it threads through and what DOES NOT change**.

### 4.1 Cross-peer traceparent — same wire, no protocol change

When peer B's client makes `GET /stream/:jobId` against peer A's server, the React client's `FetchInstrumentation` injects `traceparent` regardless of origin. Peer A's axum extraction middleware (§3.3) extracts it; peer A's `stream.request` span nests under peer B's `chunk.stream` span; both nest under peer B's `playback.session`. Single trace, two machines, no protocol change.

**The Rust port must NOT strip the inbound `traceparent`** when (later) auth middleware is introduced. State this as an invariant: any auth/permission layer added between the OTel extraction layer and the handler must pass through OTel headers unchanged. The OTel extraction layer is structurally outside (above) the auth layer in the tower stack.

### 4.2 OTLP destination across peers

The current Bun setup ships traces to the LOCAL Seq instance (`http://localhost:5341/ingest/otlp`). Under sharing, two questions arise:

- **Does peer A ship its server-side spans to peer A's Seq, or to peer B's?** Architectural answer: peer A ships to peer A's own configured OTLP endpoint. Trace correlation works because the trace-id is shared via `traceparent`; assembling the full trace requires both Seq instances to point at the same backend (e.g. a shared dev Seq) OR a query-time merge. For first-cut sharing, accept that the trace splits across two backends and revisit when Tauri ships.
- **Should peer B's client OTLP go to peer A or peer B?** Peer B's own Seq — the client is co-located with peer B. The peer A server-side leg lives in peer A's backend. Document this so a debugger looking for "the full trace" knows to query both.

This belongs primarily in [`Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md); cross-link, don't duplicate.

### 4.3 Service-name discrimination

Today's resource attribute is `service.name = xstream-server`. Under sharing, multiple instances hitting the same Seq backend will be indistinguishable. **Forward constraint:** the Rust port reads an additional optional env var `XSTREAM_NODE_NAME` (or generates a stable per-install ID at first launch) and adds it as the `service.instance.id` resource attribute (OTel semantic conventions). Today's behaviour: omit the attribute (no breakage, defaults handle it). Tomorrow: every node carries a unique instance ID without code changes, just env config.

### 4.4 `kill_reason` enum stays additive

When sharing ships, new kill reasons appear (`peer_token_expired`, `peer_unauthorized`, `peer_disconnected`). The Rust port must use the same string values as today for existing reasons, and add new ones — never rename. Existing Seq alerts and saved searches keyed on `client_disconnected` / `stream_idle_timeout` continue to work.

### 4.5 Append a "Cross-peer traceparent" note to the existing logging policy

[`Observability/01-Logging-Policy.md`](../../architecture/Observability/01-Logging-Policy.md) currently covers client→server in a single instance only. When `Sharing/00-Peer-Streaming.md` lands, append a small section to that policy doc cross-linking to it, so future agents reading the policy file directly find the cross-peer rule. This is a doc-edit follow-up, not a runtime change.

---

## 5. Open questions

1. **Tracing-opentelemetry vs. direct OTel SDK.** `tracing` is idiomatic Rust; `opentelemetry::Tracer` is a more direct mirror of the JS SDK. The plan picks `tracing` + bridge — verify during implementation that span attributes (`hwaccel`, `kill_reason`, custom keys) round-trip through the bridge cleanly. Alternative: emit OTel spans directly via `opentelemetry_sdk` with no `tracing` involvement.

2. **OTLP/gRPC vs. HTTP.** Bun uses OTLP/HTTP-protobuf. The Rust crate supports both. The plan stays on HTTP for parity (same `/v1/traces`, `/v1/logs` paths; same proxy compatibility). Revisit if performance under sharing becomes a constraint.

3. **`PrettyConsoleExporter` parity.** Dev mode in Bun prints prettified records via `server/src/telemetry/console-exporter.ts`. The Rust port uses `tracing_subscriber::fmt::layer().pretty()` instead — a different formatter. Verify the dev console output is at least as useful before declaring parity.

4. **Long-task instrumentation.** Browser-side `LongTaskInstrumentation` is browser-API specific and has no server analogue. The client's instrumentation is unchanged across the rewrite. Document this for future agents who might wonder why the server doesn't have an equivalent — there is no Rust equivalent, by design.

5. **OTLP logs API stability in Rust.** Today's most pragmatic path is `tracing` + `tracing-opentelemetry` — but the OTel-Rust logs API is still pre-1.0. If it stabilises before implementation, switching to the direct logs API may be cleaner; the wire format and Seq queries do not change either way.

---

## 6. Critical files reference

| File | Lines | Role in the port |
|---|---|---|
| `server/src/telemetry/index.ts` | 23 | Bootstrap entry — replaced by `init_telemetry()` in Rust `main` |
| `server/src/telemetry/config.ts` | 23 | Env-var parsing + resource — same env-var contract in Rust |
| `server/src/telemetry/tracer.ts` | 27 | Tracer provider + W3C propagator |
| `server/src/telemetry/logger.ts` | 64 | Logger provider + `getOtelLogger` API |
| `server/src/telemetry/console-exporter.ts` | — | Dev pretty printer — Rust uses `tracing_subscriber::fmt::pretty` |
| `server/src/index.ts` | 136 | Bootstrap order — telemetry import is the FIRST import |
| `server/src/routes/stream.ts` | 368 | `stream.request` span + traceparent extract pattern |
| `server/src/services/chunker.ts` | 866 | `transcode.job` + `job.resolve` spans |
| `client/src/telemetry.ts` | 161 | Client SDK init — UNCHANGED across the rewrite |
| `client/src/services/playbackSession.ts` | (~25) | Browser session-context bridge — UNCHANGED |
| `client/src/main.tsx` | 56 | Init ordering — `initTelemetry()` first |
| `client/rsbuild.config.*` | — | Dev proxy `/ingest/otlp` → Seq — replaced by direct routing under Tauri |
