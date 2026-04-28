# Web Server Layer — Bun → Rust Migration

**Scope.** The HTTP/WebSocket front door — `Bun.serve()`'s fetch handler, route dispatch, WS upgrade, CORS, idle-timeout policy, and the shutdown sequence. This layer doesn't have its own concept folder under `docs/` today; pieces of it are scattered across the streaming, GraphQL, and startup docs. This file consolidates them and maps the whole thing to `axum`.

**Read first.**

- [`Startup/00-Boot-And-Shutdown.md`](../../architecture/Startup/00-Boot-And-Shutdown.md) — current boot order
- [`01-Streaming-Layer.md`](01-Streaming-Layer.md) — `/stream/:jobId` handler details
- [`02-Observability-Layer.md`](02-Observability-Layer.md) — traceparent extraction middleware
- [`03-GraphQL-Layer.md`](03-GraphQL-Layer.md) — yoga handler + WS subscription transport (separate batch)

---

## 1. Current Bun implementation

### 1.1 Server entry — `server/src/index.ts` (136 lines)

The whole HTTP surface fits in this one file. Bootstrap function `bootstrap()` runs at process start; all other side-effecting work hangs off it.

**Boot order** (`index.ts:22-115`):

```
import "./telemetry/index.js"        // Side-effect: registers global TracerProvider + W3C propagator
↓
mkdir(config.segmentDir)              // Ensure tmp/segments/ exists
↓
resolveFfmpegPaths()                  // Validate manifest-pinned ffmpeg + wire fluent-ffmpeg
↓
detectHwAccel(...)                    // Probe VAAPI (fatal on failure when HW_ACCEL=auto)
↓
getDb()                               // Open SQLite + run migrations
↓
restoreInterruptedJobs()              // Force any stale running jobs → error
↓
Library scan loop (background)        // while (true) { scanLibraries(); sleep(scanIntervalMs) }
↓
Bun.serve({ port, fetch, websocket }) // HTTP + WS server
```

Each step is fail-fast: a thrown exception in any of the first six steps aborts startup with `process.exit(1)` (`index.ts:133-136`). The library-scan loop is fire-and-forget — errors inside it are caught per-iteration (`index.ts:69-71`) so a transient failure doesn't kill the loop.

**`Bun.serve` shape** (`index.ts:77-113`):

```ts
Bun.serve({
  port: config.port,
  // Disable idle timeout — the /stream/:jobId endpoint is a long-lived
  // chunked HTTP response and would be killed by the 10s default.
  idleTimeout: 0,

  async fetch(req, server) {
    const url = new URL(req.url);

    // Upgrade WebSocket connections for GraphQL subscriptions (graphql-ws protocol).
    if (url.pathname === "/graphql" && req.headers.get("upgrade") === "websocket") {
      const protocol = req.headers.get("sec-websocket-protocol") ?? "";
      if (!handleProtocols(protocol)) {
        return new Response("Bad Request: unsupported WebSocket subprotocol", { status: 400 });
      }
      if (!server.upgrade(req)) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return new Response();
    }

    // GraphQL endpoint (GET for introspection, POST for queries/mutations)
    if (url.pathname === "/graphql" || url.pathname.startsWith("/graphql")) {
      return yoga.handle(req);
    }

    // Binary streaming endpoint
    if (url.pathname.startsWith("/stream/")) {
      return handleStream(req);
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: makeWsHandler({ schema }),
});
```

Three routes, plus the implicit WS upgrade path:

| Method | Path | Handler |
|---|---|---|
| `GET`, `POST` | `/graphql`, `/graphql/*` | `yoga.handle(req)` |
| `WS` (upgrade) | `/graphql` | `graphql-ws/lib/use/bun` handler |
| `GET` | `/stream/:jobId` | `handleStream(req)` |
| any | other | 404 |

There is **no static-file serving** — the Rsbuild dev server (`localhost:5173`) serves the React bundle and proxies `/graphql`, `/stream`, and `/ingest/otlp` to the Bun server (`localhost:3001`) and Seq (`localhost:5341`). See §1.3.

**`idleTimeout: 0` is load-bearing.** The default Bun idle timeout (10 s) would cut a `/stream/:jobId` connection mid-encode. The actual idle policy is enforced inside `stream.ts` itself via `config.stream.connectionIdleTimeoutMs` (default 180 000 ms, in `server/src/config.ts`'s `StreamConfig`); cf. [`01-Streaming-Layer.md`](01-Streaming-Layer.md) §1.1.

### 1.1.5 Two-layer config model — `AppConfig` (server) ↔ `clientConfig` (client)

Server tunables live on `AppConfig` (`server/src/config.ts`, 159 lines) under two structured namespaces — `transcode` (`maxConcurrentJobs`, `forceKillTimeoutMs`, `shutdownTimeoutMs`, `orphanTimeoutMs`, `maxEncodeRateMultiplier`, `capacityRetryHintMs`, `inflightDedupTimeoutMs`) and `stream` (`connectionIdleTimeoutMs`) — plus top-level fields (`port`, `segmentDir`, `dbPath`, `scanIntervalMs`, `hardwareAcceleration`). Commits `d3f98fa` and `9d146b3` consolidated previously-scattered module-level consts into this shape.

Client tunables live on `clientConfig` (`client/src/config/appConfig.ts`, 124 lines) and are **deliberately structured to mirror `AppConfig`** — the file's docstring says verbatim "Mirrors the server's `AppConfig` shape". Same nested-namespace style, camelCase, side-effect-free; non-toggleable defaults only (runtime-mutable user preferences live in `featureFlags.ts`). Commits `680e209` (consolidation), `dbe2a8b` (two-layer doc), `484fd97` and `e832cd1` (groom sweeps that retired the old UPPER_SNAKE_CASE constant references).

**Forward constraint.** The Rust port (server) and the Tauri-bundled client should preserve this two-layer symmetry — same nested namespaces (`playback`, `streaming`, `transcode`, `stream`, etc.) on both sides where the concept overlaps. The Rust server's `AppState` reads `AppConfig` once at boot and threads it into handlers; the client's clientConfig stays a compile-time module on the React side. Cross-link to [`../../client/Config/00-ClientConfig.md`](../../client/Config/00-ClientConfig.md) (client-side authoritative doc) and [`../../server/Config/00-AppConfig.md`](../../server/Config/00-AppConfig.md) (server-side).

### 1.2 GraphQL handler mount — `server/src/routes/graphql.ts` (57 lines)

Yoga is configured with the merged schema, the `/graphql` endpoint path, dev-only CORS, and a `context()` factory that extracts the inbound `traceparent`:

```ts
export const yoga = createYoga<GQLContext>({
  schema,
  graphqlEndpoint: "/graphql",
  cors:
    process.env.NODE_ENV === "production"
      ? false
      : { origin: "http://localhost:5173", credentials: true },
  context: ({ request }): GQLContext => {
    const carrier: Record<string, string> = {};
    request.headers.forEach((value, key) => { carrier[key] = value; });
    const otelCtx = propagation.extract(context.active(), carrier);
    return { otelCtx };
  },
});
```

Two things to note:

- **CORS is a hardcoded origin** (`http://localhost:5173`) in dev and disabled entirely in prod. Any new origin (e.g. a peer's node) requires a code change today — see §4 for the migration constraint.
- **`GQLContext` is a single field** — `otelCtx`. Resolvers receive it as `ctx.otelCtx` and pass it through to service functions. The Rust port replaces this with a richer `RequestContext` struct (see §3.2) but `otelCtx` is the seed value.

### 1.3 Dev proxy — `client/rsbuild.config.ts:39-56`

```ts
server: {
  port: 5173,
  proxy: {
    "/graphql": { target: "http://localhost:3001", ws: true },
    "/ingest/otlp": { target: "http://localhost:5341", changeOrigin: true },
    "/stream": {
      target: "http://localhost:3001",
      proxyTimeout: 0,
      timeout: 0,
    },
  },
},
```

**`proxyTimeout: 0` and `timeout: 0` on `/stream`** are required because ffprobe can take 10+ seconds on large 4 K HEVC sources before the first byte is written; default proxy timeouts would kill the connection mid-init. **The Rust port + Tauri eliminates this proxy entirely** (the client is served from the webview directly), but during the dev-coexist phase where the Rust server runs alongside the existing client, the proxy stays — pointing at whichever port the Rust server binds.

### 1.4 Graceful shutdown — `index.ts:118-131`

```ts
async function shutdown(signal: string): Promise<void> {
  log.info("Shutdown initiated", { signal });
  await killAllJobs();              // SIGTERM ffmpeg children via ffmpegPool, then SIGKILL after config.transcode.shutdownTimeoutMs
  closeDb();                         // Flushes WAL
  log.info("Shutdown complete");
  process.exit(0);
}
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT",  () => { void shutdown("SIGINT");  });
```

What's NOT in the shutdown today (and should be): no OTel flush. Spans / log records buffered in `BatchSpanProcessor` / `BatchLogRecordProcessor` are dropped on `process.exit(0)`. The Rust port adds `tracer_provider.shutdown()` + `logger_provider.shutdown()` to the signal handler so in-flight telemetry reaches Seq/Axiom.

---

## 2. Stable contracts (must not change)

| Contract | Where it's set today | Rust port must |
|---|---|---|
| Routes: `POST /graphql`, `WS /graphql`, `GET /stream/:jobId` | `index.ts:87-106` | Same paths, same methods |
| Long-lived `/stream/:jobId` body (no idle cut at the server) | `Bun.serve idleTimeout: 0` + `stream.ts` 180 s self-policed | Same: no server-frame idle timeout, app-level 180 s |
| WS subprotocol: `graphql-ws` (i.e. `graphql-transport-ws`) | `graphql-ws/lib/use/bun` `handleProtocols` | Use the same subprotocol via `async-graphql-axum::GraphQLSubscription` |
| Default dev port: `3001` | `config.ts:78` | Same default; same `PORT` env var override |
| Prod port: `process.env.PORT ?? 8080` | `config.ts:90` | Same |
| Bind interface in dev: loopback only | implicit (Bun.serve default) | Same — loopback only by default; remote-bind is a future, opt-in step |
| 404 on unknown paths | `index.ts:108` | Same |
| SIGTERM + SIGINT trigger graceful shutdown | `index.ts:126-131` | Same |
| Shutdown order: kill ffmpeg → close DB | `index.ts:120-122` | Same — plus add OTel flush at the end |

---

## 3. Rust target shape

### 3.1 Crates (locked)

| Concern | Crate | Why |
|---|---|---|
| HTTP framework | `axum` 0.7+ | The Rust ecosystem default; integrates cleanly with `async-graphql`, `tower`, `tracing` |
| Server runtime | `axum_server` (or `hyper` + `axum::serve`) | `axum_server::Handle::graceful_shutdown` is the cleanest match for our SIGTERM contract |
| Async runtime | `tokio` (multi-threaded) | Same runtime the rest of the stack pulls in |
| Middleware | `tower::Layer` + `tower-http` | CORS, traceparent extraction, request context — all tower |
| CORS | `tower-http::cors::CorsLayer` | Configurable via runtime data (not compile-time) — required for §4 |
| GraphQL HTTP | `async-graphql-axum::GraphQL` | Replaces `yoga.handle` |
| GraphQL WS subscriptions | `async-graphql-axum::GraphQLSubscription` | Real `graphql-transport-ws` over `WebSocketUpgrade` |
| Signal handling | `tokio::signal` | SIGTERM + SIGINT |

### 3.2 Router sketch

```rust
pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(state.config.cors_allowlist.clone())
        .allow_credentials(true)
        .allow_headers([CONTENT_TYPE, ACCEPT, AUTHORIZATION, /* W3C trace */ "traceparent".parse().unwrap(), "tracestate".parse().unwrap()])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS]);

    Router::new()
        .route("/graphql", get(graphql_subscription).post(graphql_handler))
        .route("/stream/:job_id", get(stream_handler))
        .with_state(state)
        // Outermost: extract W3C traceparent into RequestContext
        .layer(middleware::from_fn(extract_request_context))
        .layer(cors)
        .layer(TraceLayer::new_for_http())     // tower-http request/response logging
        .fallback(|| async { (StatusCode::NOT_FOUND, "Not Found") })
}
```

Layer order (outermost first, closest to handler last):

1. `TraceLayer::new_for_http()` — coarse request/response tracing (think nginx access log)
2. `CorsLayer` — handles preflight, sets `Access-Control-*` headers
3. `extract_request_context` middleware — extracts `traceparent`, builds `RequestContext`
4. (Future, when sharing ships) — auth verification middleware: reads share-token header from `RequestContext`, populates `ShareGrant`, rejects unauthorized
5. Handler

### 3.3 The `RequestContext` extension — threaded from day one

This is the load-bearing forward constraint flagged in the plan. Establish the seam now while the surface is small; retrofitting auth into every handler signature later is a diffuse, untestable change.

```rust
#[derive(Clone)]
pub struct RequestContext {
    pub otel_ctx: opentelemetry::Context,
    // Future fields — present as Option<...> from day one:
    pub peer_node_id: Option<String>,
    pub share_grant: Option<ShareGrant>,
}

async fn extract_request_context(
    mut req: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    let otel_ctx = global::get_text_map_propagator(|prop| {
        prop.extract(&HeaderExtractor(req.headers()))
    });
    let ctx = RequestContext { otel_ctx, peer_node_id: None, share_grant: None };
    req.extensions_mut().insert(ctx);
    Ok(next.run(req).await)
}
```

Every handler signature takes `Extension<RequestContext>`:

```rust
async fn stream_handler(
    Path(job_id): Path<String>,
    Query(q): Query<StreamQuery>,
    Extension(state): Extension<AppState>,
    Extension(ctx): Extension<RequestContext>,
    headers: HeaderMap,
) -> impl IntoResponse { /* ... */ }
```

Today `share_grant` is always `None`. Tomorrow, the auth middleware populates it before the handler runs. Handlers that need to enforce permissions read `ctx.share_grant.as_ref()` — a one-line check, zero refactor.

### 3.4 GraphQL HTTP + WS handlers

```rust
async fn graphql_handler(
    Extension(schema): Extension<XstreamSchema>,
    Extension(ctx): Extension<RequestContext>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(req.into_inner().data(ctx)).await.into()
}

async fn graphql_subscription(
    ws: WebSocketUpgrade,
    Extension(schema): Extension<XstreamSchema>,
) -> impl IntoResponse {
    ws.protocols(["graphql-transport-ws"])
        .on_upgrade(move |socket| {
            GraphQLWebSocket::new(socket, schema, GraphQLProtocols::SubscriptionsTransportWS)
                .serve()
        })
}
```

`async-graphql` resolvers read the `RequestContext` via `ctx.data_unchecked::<RequestContext>()` — same threading model as today's `ctx.otelCtx`. See [`03-GraphQL-Layer.md`](03-GraphQL-Layer.md) for the resolver layout.

**Subscription transport flip.** Today's Bun server uses graphql-yoga's HTTP+SSE for subscriptions because the `graphql-ws` Bun upgrade isn't fully wired (cf. note at top of `docs/server/GraphQL-Schema/00-Surface.md`). The Rust port using `async-graphql-axum::GraphQLSubscription` delivers true `graphql-transport-ws` WebSocket subscriptions. The client's `graphql-ws` `createClient` works against this without changes — the wire protocol is standardised.

### 3.5 Idle-timeout policy

axum / hyper do NOT impose a default idle timeout on response bodies; long-lived `/stream/:jobId` works without configuration. **No equivalent of `Bun.serve idleTimeout: 0` is needed.** The 180 s app-level idle policy lives entirely in the streaming handler (cf. [`01-Streaming-Layer.md`](01-Streaming-Layer.md) §1.1, `config.stream.connectionIdleTimeoutMs`).

### 3.6 Graceful shutdown

```rust
async fn run(state: AppState) -> anyhow::Result<()> {
    let app = build_router(state.clone());
    let handle = axum_server::Handle::new();
    let shutdown_handle = handle.clone();

    tokio::spawn(async move {
        let mut sigterm = tokio::signal::unix::signal(SignalKind::terminate()).unwrap();
        let mut sigint = tokio::signal::unix::signal(SignalKind::interrupt()).unwrap();
        tokio::select! {
            _ = sigterm.recv() => tracing::info!("Shutdown initiated, signal=SIGTERM"),
            _ = sigint.recv()  => tracing::info!("Shutdown initiated, signal=SIGINT"),
        }
        // 1. Stop accepting new connections; wait up to 30s for in-flight to drain.
        shutdown_handle.graceful_shutdown(Some(Duration::from_secs(30)));
        // 2. Kill ffmpeg children with 5s SIGTERM deadline, then SIGKILL stragglers.
        chunker::kill_all_active_jobs(Duration::from_secs(5)).await;
        // 3. Drop the DB pool — rusqlite flushes WAL on Connection drop.
        drop(state.db);
        // 4. Flush OTel — this is missing from the Bun server today; gain in the Rust port.
        opentelemetry::global::shutdown_tracer_provider();
        tracing::info!("Shutdown complete");
    });

    axum_server::bind(state.config.bind_addr).handle(handle).serve(app.into_make_service()).await?;
    Ok(())
}
```

Order matches the Bun shutdown (kill ffmpeg → close DB), with two additions: (a) `axum_server` first stops accepting new connections and drains in-flight, (b) OTel flush at the end.

### 3.7 Tauri-mode binding

Under Tauri (cf. [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md)), the Rust server binds to `127.0.0.1:<random_free_port>` and the webview connects via that port. The port is determined at startup:

```rust
let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
let port = listener.local_addr()?.port();
// Pass `port` to Tauri so the webview can build the right URL
tauri_app.emit_all("server-ready", port)?;
```

Static-file serving is NOT introduced — the React bundle continues to be served by the webview itself (`tauri://localhost`), the Rust server only handles `/graphql` and `/stream/:jobId` API traffic.

---

## 4. Forward constraints for peer-sharing

### 4.1 CORS allowlist must be configurable, not hardcoded

Today: `cors: { origin: "http://localhost:5173", credentials: true }` in dev, `false` in prod (`graphql.ts:44-47`). When sharing ships, peer B's origin (`tauri://localhost` from peer B's app, or a non-loopback URL during testing) must be added to the allowlist without a recompile.

The Rust port reads `cors_allowlist` from runtime config (cf. [`server/Config/00-AppConfig.md`](../../server/Config/00-AppConfig.md) — extend with a `cors_allowlist` field). For the first cut, the allowlist is `["http://localhost:5173", "tauri://localhost"]`. When sharing ships, trusted-peer origins are appended as the share-token middleware accepts them.

### 4.2 Bind address must be configurable, not loopback-only

Today: implicit loopback. The Rust port reads `bind_addr` from `AppConfig` with a default of `127.0.0.1` (cf. §3.2 `axum_server::bind(state.config.bind_addr)`). When sharing ships, the user opts into a non-loopback bind (`0.0.0.0`, or a Tailscale interface, etc.) via config. The default stays loopback — no surprise exposure.

### 4.3 `RequestContext` middleware threaded from day one

Already covered in §3.3 — repeated here as a load-bearing constraint, not a nice-to-have.

### 4.4 Header-passthrough invariant

The auth/permission middleware (when added later) must NOT strip the `traceparent` and `tracestate` headers; OTel extraction lives outside it (above it in the tower stack), so headers are read once and propagated to handlers via `RequestContext.otel_ctx`. The original headers stay intact for any handler that wants them. State this in the doc-comment of the future auth middleware so a future agent doesn't unsafely "clean up" headers.

### 4.5 Request-id surfacing

Today there is no `x-request-id` header. The Rust port adds one as a side effect of the OTel extraction layer — set the response's `traceresponse` header (W3C standard) and a redundant `x-trace-id` for human consumption. This makes "find this request in Seq" a one-step operation for the user when sharing surfaces a stranger's request. Out of scope for the first port cut; flag it here.

---

## 5. Open questions

1. **`axum` vs. `actix-web`.** Locked pick: `axum`. `actix-web` has slightly higher raw throughput in benchmarks but `axum` integrates more cleanly with `tower` (which is the middleware ecosystem this layer leans on heavily) and with `async-graphql-axum`. Revisit if benchmark performance becomes the bottleneck — unlikely given that ffmpeg + disk I/O dominate the request profile.

2. **`tower-http::trace::TraceLayer` vs. custom middleware.** `TraceLayer` produces structured spans for every HTTP request — useful but noisy. The Rust port uses the custom `extract_request_context` middleware (§3.3) for the *correlation* concern (extracting `traceparent`) and `TraceLayer` for the *visibility* concern (per-request span). They're complementary, not redundant.

3. **`graphql-transport-ws` vs. `graphql-ws`.** Today's Bun server uses the older `graphql-ws` package; `async-graphql` defaults to the newer `graphql-transport-ws` subprotocol. The client's `graphql-ws` `createClient` supports both (it's a transport, not a tied protocol). Verify the protocol negotiation succeeds against the client unchanged before declaring parity.

4. **OTel flush on shutdown — adopt now or wait for the Rust port.** The current Bun shutdown drops batched telemetry on `process.exit(0)`. Adding `tracerProvider.shutdown()` + `loggerProvider.shutdown()` to `index.ts:122` is a 4-line fix. If sharing ships before the Rust rewrite ships, add it now so the Bun prototype carries the same guarantee.

5. **Static file serving in dev.** Under the current setup, Rsbuild serves static files. Under the Rust dev mode (Bun and Rust both running side-by-side during the migration), nothing serves static files except Rsbuild — no change needed. Under Tauri production, the webview serves static files. **At no point does the Rust server itself serve static files.** Document this so the migration doesn't accidentally introduce a `tower-http::services::ServeDir` mount that nobody actually needs.

---

## 6. Critical files reference

| File | Lines | Role in the port |
|---|---|---|
| `server/src/index.ts` | 136 | Replaced by `main()` + `build_router()` + `run()` in Rust |
| `server/src/routes/graphql.ts` | 57 | Yoga mount → `async-graphql-axum::GraphQL` + `GraphQLSubscription` |
| `server/src/routes/stream.ts` | 368 | Already covered by [`01-Streaming-Layer.md`](01-Streaming-Layer.md) |
| `server/src/config.ts` | 102 | `AppConfig` shape — extend with `cors_allowlist` and `bind_addr` (cf. [`05-Database-Layer.md`](05-Database-Layer.md) for DB-path additions) |
| `client/rsbuild.config.ts` | 168 | Dev proxy unchanged for the Rust port; eliminated under Tauri |
