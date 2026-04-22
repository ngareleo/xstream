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
| Span | Trigger | Key attributes / events |
|---|---|---|
| `stream.request` | GET /stream/:jobId | `job_id`, `from_index`, `segments_sent`. Child of the client's `chunk.stream` span (see "Threading trace context into fetch" below). |
| `job.resolve` | `startTranscodeJob()` entry — covers every code path that returns an `ActiveJob` | attrs: `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s`. Events: `job_cache_hit` (already in `jobStore`), `job_inflight_resolved` (another call was mid-registration and we polled it out), `job_restored_from_db` (completed segments replayed from disk), `job_started` (new ffmpeg spawned). Exactly one event fires per span. |
| `transcode.job` | ffmpeg process launch inside `startTranscodeJob`. Parent is `job.resolve` (the resolution of the `job_started` path). | `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s`, `job.chunk_duration_s`, `hwaccel` (`software` \| `vaapi` \| `videotoolbox` \| `qsv` \| `nvenc` \| `amf` — which encoder backend was used; slice stalls by this when investigating perf), `hwaccel.forced_software` (true on the retry span of a HW→software fallback). Events: `probe_complete`, `probe_error`, `transcode_started`, `transcode_progress` (periodic, ~every 10s while ffmpeg is running; `frames`, `fps`, `kbps`, `timemark`, `percent` — useful for spotting encode falling behind realtime), `transcode_fallback_to_software` (HW encode failed mid-job; chunker is retrying this chunk on software — the original span ends at the failure, a second span covers the retry with `hwaccel.forced_software = true`), `transcode_error`, `transcode_killed`, `transcode_complete`. Span duration is the full ffmpeg lifetime (probe + encode). |
| `library.scan` | scanLibraries | `library_path`, `library_name`, `files_found` |

Structured log events are emitted for each significant state transition (init ready, transcode complete, scan matched, etc.) with a `component` attribute for easy filtering. When a span event already covers a state transition, do not emit a duplicate log record — prefer `span.addEvent()` over a parallel `log.info()`.

### Client
| Span / log | Trigger | Key attributes |
|---|---|---|
| `playback.session` | startPlayback | `video.id`, `playback.resolution`. Events: `mse_init_failed`, `chunk_series_failed`, `background_mse_init_failed`, `background_chunk_request_failed`, `background_stream_error` (all with `message`), and `session_ended` (with `reason` = `teardown` \| `new_session`) recorded before span ends. Status set to ERROR on fatal foreground failures. |
| `chunk.stream` | each chunk streamed by `PlaybackController.streamChunk` (opened around `StreamingService.start`) | At start: `chunk.job_id`, `chunk.resolution`, `chunk.is_first`. At end: `chunk.bytes_streamed`, `chunk.segments_received`. Events: `chunk_no_real_content`, `chunk_error` (with `message`), and `chunk_cancelled_by_<reason>` where reason ∈ `teardown` \| `new_session` \| `seek` \| `resolution_switch` \| `resolution_switch_restart`. FetchInstrumentation's HTTP span for `GET /stream/:jobId` is a child, and the server's `stream.request` is a child of that. |
| `transcode.request` | `PlaybackController.requestChunk` — each `startTranscode` mutation including prefetches | `chunk.start_s`, `chunk.end_s`, `chunk.resolution`, `chunk.is_prefetch`, `chunk.job_id` (set on success). Parent is `playback.session`. The auto-generated `graphql.request` HTTP span nests underneath via `context.with`. Status set to ERROR on mutation failure. Filter `chunk.is_prefetch = true` to isolate prefetch RTT. |
| `buffer.backpressure` | `BufferManager.checkForwardBuffer` — one span per pause → resume cycle. Back-pressure pauses the network at `forwardTargetS` (default 60s) when we have *too much* buffered and resumes at `forwardResumeS` (default 20s); the 40s hysteresis gap keeps each pause ~40s long so cycles don't chain at steady state. This is the "deliberate throttle", **not** a user-visible freeze — for freezes see `playback.stalled`. See [`Streaming Protocol → Hysteresis: tuning the gap`](./Streaming%20Protocol.md#hysteresis-tuning-the-gap). | At pause: `buffer.buffered_ahead_s_at_pause`, `buffer.target_s`, `buffer.resume_threshold_s`, `buffer.bytes_at_pause`. At natural close (resume): `buffer.buffered_ahead_s_at_resume`. On early close: one event of `backpressure_ended_by_seek` \| `backpressure_ended_by_teardown`. Parent is `playback.session`. Span duration = pause length. |
| `playback.stalled` | `PlaybackController.handleWaiting` — the HTMLMediaElement `waiting` event fires when playback froze because the next frame isn't loaded yet (i.e. the forward buffer went empty). Ended in `handlePlaying` when the video resumes, or early on seek/teardown. Not opened before the session reaches `hasStartedPlayback = true` (the initial startup has its own loading path). | At open: `video.current_time_s`, `buffer.buffered_ahead_s` (-1 sentinel when the SourceBuffer is empty), `buffer.empty`. At close: `stall.duration_ms` + one event of `resumed` \| `seek` \| `teardown` \| `new_session`. Parent is `playback.session`. Span duration = user-visible freeze. |
| `graphql.request` | every Relay fetch | `operation.name` (via fetch instrumentation) |
| log: `playback.start` | startPlayback called | `video_id`, `resolution`, `duration_s` |
| log: `playback.seek` | seek triggered | `seek_target_s`, `snapped_to_s` |
| log: `playback.stall` | buffering >2s | `stall_duration_ms` |
| log: `playback.resolution_switch` | resolution changed | `from`, `to` |
| log: `playback.error` | any playback error | `message`, `component` |
| Long task spans | task >50ms blocks main thread | `duration_ms` (via instrumentation-long-task) |

---

## Logging Policy

### Core principle: message bodies must be self-describing

A log record's body should read as a complete sentence that tells the story without expanding attributes. A reader skimming Seq should understand what happened from the message alone.

```ts
// Bad — forces you to expand attributes to understand what happened
log.info("Stream paused", { buffered_ahead_s: 23.4 });

// Good — readable in the Seq event list without drilling in
log.info("Stream paused — 62.4s buffered ahead (target: 60s)", { buffered_ahead_s: 62.4, target_s: 60 });
```

Attributes exist for filtering and correlation, not as a substitute for a clear message.

---

### When to use a span vs. a log record

**Use a span** for operations with meaningful duration:
- An HTTP request
- A transcode job (start → complete/error)
- A playback session (play → teardown)
- A long async pipeline step

**Use a log record** for discrete events within a span:
- State transitions (`stream paused`, `init segment sent`, `seek flushed buffer`)
- Errors and warnings at a point in time
- Counters that would be verbose as span attributes (`segments_sent: 47` → periodic log)

**Never** emit a span for something instantaneous. Use `span.addEvent(name, attributes)` on the parent span instead.

---

### Levels

| Level | When to use |
|---|---|
| `info` | Normal lifecycle events — state changes, completions, transitions |
| `warn` | Recoverable problems — quota exceeded and evicted, idle timeout, dedup timeout |
| `error` | Failures that affect the user or indicate a bug — appendBuffer fatal, stream fetch failure, ffprobe crash |

Do not use `info` for errors that will degrade the user experience. Do not use `error` for expected edge cases that are handled gracefully (e.g. `client_disconnected` is `info`, not `error`).

---

### Attributes: what to include

Every log record gets a `component` attribute automatically (set when calling `getClientLogger("name")` or `getOtelLogger("name")`). Beyond that:

- **Always**: the primary entity ID (`job_id`, `video_id`, `library_path`)
- **On errors**: `message` (the error's `.message` string)
- **On durations**: `*_ms` or `*_s` suffixed numeric attributes
- **On counts**: `segment_count`, `segments_sent`, etc.
- **On state changes**: the reason or trigger (`kill_reason`, `ready_state`)

Do not include attributes that duplicate information already in the message body unless they are needed for Seq filtering.

---

### Client-side: always attach session context

All async client logs must carry the active session traceId. This is handled automatically by `getClientLogger` — it reads `getSessionContext()` at emit time. The context is set by `setSessionContext(ctx)` at playback start and cleared by `clearSessionContext()` at teardown.

```ts
// playbackSession.ts — the bridge between OTel context and async callbacks
import { setSessionContext, clearSessionContext } from "~/services/playbackSession.js";

// In startPlayback:
const sessionSpan = playbackTracer.startSpan("playback.session", ...);
setSessionContext(trace.setSpan(context.active(), sessionSpan));

// In teardown:
clearSessionContext();
```

Every `fetch()` call that should link to the playback session must also be wrapped:
```ts
await context.with(getSessionContext(), () => fetch(url, options));
```

Without this, `FetchInstrumentation` injects a new random traceId for each fetch, breaking the server → client link in Seq.

---

### Threading trace context into streaming fetches

The chunked-playback loop opens a per-chunk span and threads its context all the way into the `fetch()` call, so the server's `stream.request` nests under the correct `chunk.stream` rather than appearing as an orphan root trace.

```ts
// In useChunkedPlayback.streamChunk():
const chunkSpan = playbackTracer.startSpan(
  "chunk.stream",
  { attributes: { "chunk.job_id": rawJobId, "chunk.resolution": res, "chunk.is_first": isFirstChunk } },
  getSessionContext()
);
const chunkCtx = trace.setSpan(getSessionContext(), chunkSpan);

// StreamingService.start takes parentContext as its final argument:
await svc.start(rawJobId, 0, onSegment, onError, onDone, chunkCtx);

// Inside StreamingService.start:
response = await context.with(parentContext, () =>
  fetch(url, { signal: controller?.signal })
);
```

Two easy-to-miss invariants:

1. **`context.with(parentContext, fetch(...))` must wrap the `fetch()` call itself, not just the surrounding async function.** FetchInstrumentation reads the active context synchronously when the request is initiated; awaiting inside `context.with` is fine, but the `fetch()` call must be made inside it.
2. **End the span on both success and error paths** — wrap the `onDone` and `onError` callbacks to call `chunkSpan.end()` (and `setStatus({ code: SpanStatusCode.ERROR })` on error). A leaked span silently poisons child context attribution for the rest of the session.

---

### Server-side: propagate incoming trace context

Server spans that handle client requests must extract the `traceparent` from incoming headers and use it as the parent context. Otherwise server spans appear as isolated root traces in Seq instead of children of the client session.

```ts
// In a request handler:
const carrier: Record<string, string> = {};
req.headers.forEach((value, key) => { carrier[key] = value; });
const incomingCtx = propagation.extract(context.active(), carrier);
const span = tracer.startSpan("operation.name", { attributes }, incomingCtx);
```

graphql-yoga resolvers receive the extracted context through `ctx.otelCtx` (set in the yoga `context` function in `routes/graphql.ts`) and pass it to service functions:

```ts
// In a mutation resolver:
const job = await startTranscodeJob(localVideoId, resolution, start, end, ctx.otelCtx);

// In the service function:
const span = tracer.startSpan("transcode.job", { attributes }, parentOtelCtx);
```

---

### Cleanup and termination events

When killing or stopping a pipeline component, always log WHY, not just that it stopped.

```ts
// Bad
log.info("Killing job", { job_id: id });

// Good — reason propagated from the call site
killJob(id, "client_disconnected");
// → logs: "Killing ffmpeg — client_disconnected"
// → span event: transcode_killed { kill_reason: "client_disconnected" }
```

Standard kill reasons: `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `server_shutdown`.

For stream cleanup on the client side, log the segment count at the point of teardown so the message tells the whole story:
```ts
log.info(`Client disconnected after ${sentCount} segments — cleaning up`, { segments_sent: sentCount });
```

---

### Error handling: don't cascade

When a non-recoverable error occurs in a processing loop (e.g. `appendBuffer` on a closed SourceBuffer), log **once** and stop processing. Do not let the outer loop continue picking up items that will all fail identically.

```ts
// After a fatal appendBuffer error:
fatalError = true;
break; // break retry loop

// After the retry loop:
if (fatalError || this.seekAbort) {
  for (const remaining of this.appendQueue) remaining.resolve();
  this.appendQueue = [];
  break; // break the outer drain loop
}
```

One `error` log per failure event. Twenty identical errors mean the loop is not guarded.

---

### What NOT to log

- **Per-segment appends** — too noisy at any real bitrate. Log milestones instead (`every 20 segments` or on completion).
- **Re-scanned existing videos** — only log when a video is newly discovered (`isNew` check before upsert).
- **Successful no-ops** — if a function is called but exits early because nothing changed, log nothing.
- **Timing details that belong in span attributes** — put `encode_duration_ms` on the span, not a separate log record.

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

1. Run `bun run seq:start` — this auto-generates `.seq-credentials` on first run (gitignored, project root) and boots the container. Open [http://localhost:5341](http://localhost:5341).
2. Sign in with the username + password from `.seq-credentials`:
   ```sh
   grep '^SEQ_ADMIN_USERNAME=' .seq-credentials | cut -d= -f2
   grep '^SEQ_ADMIN_PASSWORD=' .seq-credentials | cut -d= -f2
   ```
   Seq forces a password change on the first login — pick a new password and immediately write it back to `.seq-credentials` so the `/otel-logs` skill (and future logins) can still find it:
   ```sh
   printf 'SEQ_ADMIN_USERNAME=admin\nSEQ_ADMIN_PASSWORD=<new>\n' > .seq-credentials
   ```
3. Navigate to **Settings → API Keys → Add API Key**
4. Give it a name (e.g. `xstream-dev`), set permissions to **Ingest**
5. Copy the key and add it to `.env`:
   ```
   OTEL_EXPORTER_OTLP_HEADERS=X-Seq-ApiKey=<key>
   PUBLIC_OTEL_HEADERS=X-Seq-ApiKey=<key>
   ```
6. Restart the dev server (`bun run dev`) — telemetry will start flowing immediately

To reset Seq entirely (forget the container-initial password), see CLAUDE.md → "Local Dev Setup → Seq credentials" — you must delete both the container and `~/.seq-store` before `SEQ_FIRSTRUN_ADMINPASSWORD` will be honoured again.

---

## Release-time metrics

See `docs/todo.md` items `OBS-001` through `OBS-004` for the planned metrics instrumentation (buffer rates, error classification, usage metrics). These require the OTel metrics SDK (`MeterProvider`) which is not yet wired up.
