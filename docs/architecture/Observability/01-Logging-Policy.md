# Logging Policy

## Core principle: message bodies must be self-describing

A log record's body should read as a complete sentence that tells the story without expanding attributes. A reader skimming Seq should understand what happened from the message alone.

```ts
// Bad — forces you to expand attributes to understand what happened
log.info("Stream paused", { buffered_ahead_s: 23.4 });

// Good — readable in the Seq event list without drilling in
log.info("Stream paused — 62.4s buffered ahead (target: 60s)", { buffered_ahead_s: 62.4, target_s: 60 });
```

Attributes exist for filtering and correlation, not as a substitute for a clear message.

## When to use a span vs. a log record

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

## Levels

| Level | When to use |
|---|---|
| `info` | Normal lifecycle events — state changes, completions, transitions |
| `warn` | Recoverable problems — quota exceeded and evicted, idle timeout, dedup timeout |
| `error` | Failures that affect the user or indicate a bug — appendBuffer fatal, stream fetch failure, ffprobe crash |

Do not use `info` for errors that will degrade the user experience. Do not use `error` for expected edge cases that are handled gracefully (e.g. `client_disconnected` is `info`, not `error`).

## Attributes: what to include

Every log record gets a `component` attribute automatically (set when calling `getClientLogger("name")` or `getOtelLogger("name")`). Beyond that:

- **Always**: the primary entity ID (`job_id`, `video_id`, `library_path`)
- **On errors**: `message` (the error's `.message` string)
- **On durations**: `*_ms` or `*_s` suffixed numeric attributes
- **On counts**: `segment_count`, `segments_sent`, etc.
- **On state changes**: the reason or trigger (`kill_reason`, `ready_state`)

Do not include attributes that duplicate information already in the message body unless they are needed for Seq filtering.

## Client-side: always attach session context

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

## Threading trace context into streaming fetches

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

## Server-side: propagate incoming trace context

Server spans that handle client requests must extract the `traceparent` from incoming headers and use it as the parent context. Otherwise server spans appear as isolated root traces in Seq instead of children of the client session.

```ts
// In a request handler:
const carrier: Record<string, string> = {};
req.headers.forEach((value, key) => { carrier[key] = value; });
const incomingCtx = propagation.extract(context.active(), carrier);
const span = tracer.startSpan("operation.name", { attributes }, incomingCtx);
```

Rust async-graphql resolvers receive the extracted context via the axum request extensions and pass it to service functions. The context flows through the OTel middleware on every request, so the span tree is automatically connected without explicit context passing in most cases.

## Cleanup and termination events

When killing or stopping a pipeline component, always log WHY, not just that it stopped.

```rust
// Bad
info!(job.id = %id, "Killing job");

// Good — reason propagated from the call site
pool.kill_job(&id, KillReason::ClientDisconnected);
// → logs: "Killing ffmpeg — client_disconnected"
// → span event: transcode_killed { kill_reason: "client_disconnected" }
```

Standard kill reasons (the full `KillReason` enum in `server-rust/src/services/kill_reason.rs`): `client_request`, `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `max_encode_timeout`, `cascade_retry`, `server_shutdown`. The wire-format strings are pinned by `KillReason::as_wire_str` and the round-trip mapper test — Seq dashboards filter on these literals.

`max_encode_timeout` is reserved for the wall-clock budget kill: budget = `(end_time_seconds - start_time_seconds) × TranscodeConfig::max_encode_rate_multiplier × 1_000` ms (multiplier defaults to 3 — see `server-rust/src/config.rs` — covering SW-1080p worst-case). It runs alongside (not instead of) the `orphan_no_connection` 30 s kill: the orphan guard covers abandoned jobs, this covers stuck encodes that still have a live connection. The Rust port preserves the wire string and config field; the timer wiring itself is pending (the Bun-era `maxEncodeTimer` in `chunker.ts` has not been ported yet — tracked alongside the rest of the chunker port).

For stream cleanup on the client side, log the segment count at the point of teardown so the message tells the whole story:

```ts
log.info(`Client disconnected after ${sentCount} segments — cleaning up`, { segments_sent: sentCount });
```

## Error handling: don't cascade

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

## Span attribute shape: one-shot vs snapshot

A long-lived span like `playback.session` can carry two kinds of attributes that must not be confused:

**One-shot metrics** — set exactly once, guarded by a boolean (`firstFrameRecorded`, `firstPrefetchRecorded`). Use this for events that are intrinsically cold-start-scoped and must not be overwritten by seek-resumes or MSE recovery cycles. Examples: `playback.time_to_first_frame_ms`, `playback.time_to_first_prefetch_ms`. The guard resets only in `resetForNewSession`.

**Snapshot / continuous metrics** — overwritten on each update cycle (e.g. `updateSessionTimelineAttrs()`). Use this for state that is always current and meaningful at span-end. Examples: `playback.foreground_chunk_start_s`, `playback.rolling_avg_first_byte_latency_ms`.

Both patterns are valid. Choose by asking: "Is the first occurrence of this metric the load-bearing one, or is the most recent occurrence?"  If first-occurrence, use a one-shot guard. If most-recent, use a snapshot update. Don't mix them on the same metric.

## What NOT to log

- **Per-segment appends** — too noisy at any real bitrate. Log milestones instead (`every 20 segments` or on completion).
- **Re-scanned existing videos** — only log when a video is newly discovered (`isNew` check before upsert).
- **Successful no-ops** — if a function is called but exits early because nothing changed, log nothing.
- **Timing details that belong in span attributes** — put `encode_duration_ms` on the span, not a separate log record.

## Cross-peer traceparent

The W3C `traceparent` header carries the trace context end-to-end across the wire. Today this matters within a single node (client → server). Once peer-to-peer sharing ships (`docs/architecture/Sharing/00-Peer-Streaming.md`), the same `traceparent` flows from peer B's client → peer A's server, producing a single trace across two machines.

Load-bearing rules — the Rust port must respect these from day one even though sharing has not landed:

- **Never strip an inbound `traceparent`.** Whichever middleware extracts the request context must propagate the header's value into the resolver/handler context untouched. Do not regenerate a span ID for inbound requests; the inbound parent span ID is the parent.
- **OTel exporter destination is per-node.** Each node ships to its own configured OTLP endpoint. Cross-peer correlation works because both sides emit spans with the same `trace_id` — operators with a shared Seq pull both nodes into one view; operators with one Seq per node correlate by `trace_id` across logs.
- **No app-level peer ID in trace fields.** A `peer_pubkey` may appear as a span attribute on inbound peer requests but is NOT used for correlation — `trace_id` is the only correlation key.

Cross-reference: `docs/architecture/Sharing/00-Peer-Streaming.md` §5 (Cross-peer observability) and §8 (Invariants 5 + 8).
