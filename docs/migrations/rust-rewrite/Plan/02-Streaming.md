# Step 2 — Rust Streaming

## Where this step sits

Second Rust step. Predecessor: [Step 1 — GraphQL + Observability](01-GraphQL-And-Observability.md), shipped behind `useRustGraphQL`. Successor: [Step 3 — Tauri Packaging](03-Tauri-Packaging.md).

At the end of this step, with **both** flags on, the player page works against the Rust `/stream/:jobId` endpoint — meaning the entire product runs on Rust. With only the GraphQL flag on (Step 1 state), behaviour is unchanged from Step 1 — player page stays broken in that mid-state. With both flags off, Bun serves everything as today.

## Scope

**In:**

- `axum` `/stream/:jobId` endpoint with the existing length-prefixed binary framing.
- Chunker port: per-connection pull isolation, per-consumer `mpsc` channel for backpressure.
- ffmpeg pool: `Arc<Semaphore>` cap (today's `config.transcode.maxConcurrentJobs`), dying-set exclusion, SIGTERM → SIGKILL escalation grace, `KillReason` union, shutdown sweep.
- Content-addressed cache key `(videoId, resolution, startS, endS)` decoupled from job ID. Cache index lives alongside the segment files.
- `transcode.job` and `stream.request` span surfaces preserved (including `transcode_silent_failure` event).
- Independent `useRustStreaming` flag wired into the client streaming services.

**Out:**

- Tauri shell, embedded server, distribution — Steps [3](03-Tauri-Packaging.md) and [4](04-Release.md).
- Peer-to-peer sharing. Forward-constrained but not shipped — see [`../../../architecture/Sharing/00-Peer-Streaming.md`](../../../architecture/Sharing/00-Peer-Streaming.md).
- Removing the Bun stream endpoint. Both keep running until [Step 3](03-Tauri-Packaging.md).

## Stable contracts to preserve

Authoritative list at [`../00-Rust-Tauri-Port.md`](../00-Rust-Tauri-Port.md). For Step 2 specifically:

- **`/stream/:jobId` framing** — 4-byte big-endian uint32 length prefix + raw fMP4 bytes, init segment **first**. Length prefix is per-chunk, not per-stream.
- **No JSON serialization in the request path.** Same reasoning as the Tauri-IPC ban in [`../08-Tauri-Packaging.md`](../08-Tauri-Packaging.md) §3 — any IPC layer that re-encodes the body breaks framing.
- **Pull-based** — the server emits chunks only when the client requests, never push. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md).
- **Init-segment-first invariant** — every per-chunk re-init scenario (resolution switch, MSE detach recovery) must keep this discipline. Detail in [`../../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](../../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md).

## Cutover mechanism

Side-by-side, mirrors Step 1.

- **Two `/stream` endpoints, two ports.** Bun's `/stream/:jobId` keeps serving on its current port. Rust binds the same port chosen for Step 1's GraphQL service (one Rust process serves both `/graphql` and `/stream/*`, matching the Bun shape).
- **Independent client flag.** Add `useRustStreaming` to [`client/src/config/flagRegistry.ts`](../../../../client/src/config/flagRegistry.ts). The client streaming service ([`client/src/services/StreamingService`](../../../../client/src/services/)) selects the alternate origin when on. **Independent of `useRustGraphQL`** — each can be flipped alone, allowing per-channel A/B and isolating regressions.
- **Bun is the default.** `main` builds with the flag false. `main` stays fully functional unless the user opts in.
- **Mid-session flag flip.** When a tester flips the streaming flag mid-session, in-flight Bun ffmpeg children must drain cleanly and the new Rust stream takes over on the next segment request. Decide implementation: fail-fast the Bun stream (client retries on Rust) vs. let the current segment finish then switch on the next request.

## Pointers to layer references

- [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md) — primary. Stream endpoint + chunker + ffmpegPool — pull contract → axum, semaphore cap → `Arc<Semaphore>` + dying-set, content-addressed cache key, per-consumer pull isolation, full span surface.
- [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md) — ffmpeg manifest pinning per platform, content-addressed cache index, two-DB split for the cache layer.
- [`../07-Bun-To-Rust-Migration.md`](../07-Bun-To-Rust-Migration.md) — runtime model + concurrency primitives map: `Bun.spawn` → `tokio::process`, `ReadableStream` pull → `mpsc` channels, `setTimeout` → `tokio::time::sleep`.
- [`../../../architecture/Streaming/`](../../../architecture/Streaming/) — full streaming protocol reference, demand-driven streaming, single-SourceBuffer ADR, chunk-pipeline invariants. Authoritative on the client-facing contract.

## Sharing forward-constraints to honour

Pointer-only:

- **Per-connection pull isolation** — every `GET /stream/:jobId` has its own watcher / channel / mpsc receiver. No cross-connection state. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md).
- **Content-addressed cache key decoupled from job ID** — `(videoId, resolution, startS, endS)` indexes the cache, not the job ID. A peer streaming the same content produces a cache hit. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md) and [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md).
- **Per-consumer mpsc backpressure** — the chunker drops nothing for a slow consumer; backpressure pushes back to ffmpeg, not to other consumers. Detail in [`../01-Streaming-Layer.md`](../01-Streaming-Layer.md).
- **Cache eviction keeps the index consistent** — segment file deletion and index entry removal are atomic. Detail in [`../06-File-Handling-Layer.md`](../06-File-Handling-Layer.md).

## Lessons from Step 1 that apply here

These are established patterns as of PR #39. An implementing agent must follow them — they are no longer open questions.

### Error / panic discipline (§14 of `docs/code-style/Invariants/00-Never-Violate.md`)

No `expect`/`unwrap`/silent-discard in production Rust code. The chunker and ffmpeg pool are the highest exposure surface in Step 2 — every `Mutex::lock()`, every `mpsc::send()`, every `Child::wait()` must return a typed `Result`. Mutex poisoning is a `DbError::MutexPoisoned` variant, not a panic. If a subprocess exits unexpectedly, that is a typed error in `AppError`, not an unwrap site. `main()` already returns `AppResult<()>`; all Step 2 code paths must chain through it.

### Mapper Option-shape + warn-then-degrade convention

Any new enum conversion from a DB or wire value uses `Option<Self>` (not a silent default). Call sites log `tracing::warn!` with the row id and raw value before degrading. The pattern is established in `graphql/types/{library,video,transcode_job}.rs`. Step 2 adds `KillReason` and `StreamError` variants — follow the same shape.

### traceparent threading — no additional wiring needed

The `extract_request_context` middleware already propagates `traceparent` into every handler's `OtelContext`. New Step 2 spans (`transcode.job`, `chunk.stream`, `stream.request`) are created as children of the per-request span automatically — no additional W3C extraction code is needed. What the implementing agent must do is confirm the **span names and key attributes** match the Bun side (see "Span surface validation" in Decisions to lock). The Bun span surface is documented in `docs/architecture/Observability/server/00-Spans.md`.

### ErrorLogger extension covers new resolvers

`server-rust/src/graphql/error_logger.rs` fires `tracing::error!` per `errors[]` entry inside the per-request `http.request` span. Any new GraphQL resolver added in Step 2 (e.g., `startTranscode` write path) gets error logging for free — no per-resolver logging boilerplate needed.

### DB write functions slot into existing query files

The `db/queries/` split is already in place (libraries, videos, jobs, video_metadata, watchlist, user_settings, playback_history). Step 2 needs write functions: `insert_job`, `update_job_status`, `insert_segment`, `delete_segment`, and segment-index maintenance. These slot in next to the existing read functions in `db/queries/jobs.rs` and a new `db/queries/segments.rs`. Follow the `#[cfg(test)] mod tests` pattern — every new query file gets a test block.

### localStorage-first flag system

`useRustStreaming` is covered by the general flag mechanism landed in Step 1. Add it to `client/src/config/flagRegistry.ts` with a default of `false` — the localStorage-first system handles everything else (local override wins, server hydration fills the rest, reset-to-default via FlagsTab).

### Test checklist — tests are the spec, they travel with the port

Every Bun test that covers streaming behaviour must be ported before Step 2 ships. The following Bun test files are the porting checklist. Mark each as ported in the PR description:

| Bun test | Rust target location | Notes |
|---|---|---|
| `server/src/services/__tests__/chunker.inflight.test.ts` | `server-rust/src/services/chunker/tests/inflight.rs` | In-flight deduplication — same semaphore semantics |
| `server/src/services/__tests__/chunker.encode.test.ts` | `server-rust/src/services/chunker/tests/encode.rs` | Round-trip encode + segment write |
| `server/src/services/__tests__/chunker.cache-stability.test.ts` | `server-rust/src/services/chunker/tests/cache_stability.rs` | Cache key stability across restarts |
| `server/src/services/__tests__/chunker.span-events.test.ts` | `server-rust/src/services/chunker/tests/span_events.rs` | `transcode_silent_failure` event fires |
| `server/src/services/__tests__/chunker.telemetry.test.ts` | `server-rust/src/services/chunker/tests/telemetry.rs` | OTel span attributes on the job span |
| `server/src/services/__tests__/ffmpegPool.test.ts` | `server-rust/src/services/ffmpeg_pool/tests/` | Cap enforcement, dying-set exclusion, SIGKILL escalation |
| `server/src/routes/__tests__/segments.test.ts` | `server-rust/src/routes/tests/segments.rs` | Segment byte-range serve correctness |
| `server/src/routes/__tests__/stream.pull.test.ts` | `server-rust/src/routes/tests/stream_pull.rs` | Pull contract — chunks emitted only on demand |
| `server/src/routes/__tests__/stream.kill-paths.test.ts` | `server-rust/src/routes/tests/stream_kill.rs` | All `KillReason` variants reachable |
| `server/src/routes/__tests__/stream.telemetry.test.ts` | `server-rust/src/routes/tests/stream_telemetry.rs` | `stream.request` span attributes |
| `server/src/services/__tests__/chunker.subscription-error-atomicity.test.ts` | `server-rust/src/services/chunker/tests/subscription_error_atomicity.rs` | This was skipped in Step 1; Step 2 is the first port that exercises the chunker — port it here |

> Target file paths above are proposed, not pre-created. The implementing agent picks the actual layout; what matters is that every Bun test in the left column has a counterpart before the PR ships.

## Decisions to lock before starting

1. **Origin discovery for `/stream`.** Reuse the Step 1 mechanism — do not invent a second one. The streaming service reads the same flag-driven origin selection as the Relay environment. Confirmed: hard-coded `localhost:3002` in `rustOrigin.ts` serves both `/graphql` and `/stream/*`.
2. **Cache directory during cutover.** Bun and Rust must use **separate** `SEGMENT_DIR` directories. Different content-addressed indexes; mixing them risks index corruption when one process evicts a file the other still indexes. Pick a Rust-specific subdirectory under `tmp/` and document it.
3. **Mid-session flag-flip behaviour.** Fail-fast vs. graceful next-segment switch (see Cutover above). Pick one and document the user-visible behaviour.
4. **Rust ffmpeg subprocess wrapper.** Pick the wrapper crate (or hand-rolled `tokio::process` per [`../07-Bun-To-Rust-Migration.md`](../07-Bun-To-Rust-Migration.md)) and confirm SIGTERM grace + SIGKILL escalation work cross-platform. Linux gets primary attention; mac/win HW-accel paths can stay stubs in this step (they were stubs on Bun too — see [`../../../server/Hardware-Acceleration/00-Overview.md`](../../../server/Hardware-Acceleration/00-Overview.md)).
5. **Span surface validation.** Decide how to verify span parity with Bun — diff Seq output for the same playback session against both origins, asserting span name + key attributes match. The Bun span surface is the authoritative reference: `docs/architecture/Observability/server/00-Spans.md`. The CI SDL-parity job pattern from Step 1 (boot Rust binary, run check script, kill) is a template for a streaming smoke test.
