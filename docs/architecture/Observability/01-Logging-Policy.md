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

graphql-yoga resolvers receive the extracted context through `ctx.otelCtx` (set in the yoga `context` function in `routes/graphql.ts`) and pass it to service functions:

```ts
// In a mutation resolver:
const job = await startTranscodeJob(localVideoId, resolution, start, end, ctx.otelCtx);

// In the service function:
const span = tracer.startSpan("transcode.job", { attributes }, parentOtelCtx);
```

## Cleanup and termination events

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

## What NOT to log

- **Per-segment appends** — too noisy at any real bitrate. Log milestones instead (`every 20 segments` or on completion).
- **Re-scanned existing videos** — only log when a video is newly discovered (`isNew` check before upsert).
- **Successful no-ops** — if a function is called but exits early because nothing changed, log nothing.
- **Timing details that belong in span attributes** — put `encode_duration_ms` on the span, not a separate log record.
