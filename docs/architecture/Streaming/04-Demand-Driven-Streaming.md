# Demand-Driven Streaming Primitive

## The invariant

The network stream is a sink the consumer pulls from, never a source the producer pushes into. `server/src/routes/stream.ts` uses `new ReadableStream({ pull(controller) })`. Every byte sent corresponds to a `read()` the consumer issued. There are no hidden queues between disk read and client receive.

This is a load-bearing invariant — see rule #12 in [`docs/code-style/Invariants/00-Never-Violate.md`](../../code-style/Invariants/00-Never-Violate.md).

---

## Pull shape in `stream.ts`

Each `pull` call does exactly one of:

| State | Action |
|---|---|
| First call (`segmentIndex === -1`) | Read `init.mp4` from disk, enqueue `[4-byte length][bytes]`, set `segmentIndex = 0`. |
| `segment_NNNN.m4s` exists | Read it, enqueue frame, increment `segmentIndex`. |
| Encoder still producing | `await Bun.sleep(100)` inside `pull`, then return without enqueuing — the controller re-calls `pull`. |
| Job `complete` or `error` AND no more segments | `controller.close()` — stream ends cleanly. |
| Idle ≥ 180 s (no new segment) | `controller.error(...)` — closes stream and triggers job kill. |
| Client disconnects mid-pull | `cancel(reason)` called by the UA — cleans up job connection count. |

A single `resolveNextSegmentPath()` helper collapses the in-memory vs DB-evicted path distinction so the `pull` implementation itself is uniform across live-encoded and DB-restored jobs.

### Why not `start` with an internal loop?

A `start` loop enqueues segments as fast as it can produce them into the controller's internal queue. The UA's backpressure signal (`desiredSize`) is ignored and the queue grows without bound before the TCP window closes. At 4K the difference is visible in traces: the prior `start` implementation dumped ~250 MB into MSE before backpressure engaged (trace `e699c0ae`). With `pull`, each enqueue corresponds to one consumer `read()`, so the queue depth stays at 1 and the TCP window provides the real backpressure signal.

---

## Client-side cooperation: `drainAndDispatch`

`client/src/services/chunkPipeline.ts::drainAndDispatch` awaits `buffer.waitIfPaused()` between iterations. This is the client half of the demand-driven contract:

- When `BufferManager` signals pause (forward buffer above `forwardTargetS`), `drainAndDispatch` suspends.
- `buffer.waitIfPaused()` resolves on the next `resume()` call, or immediately when not paused.
- Backing state (`resumeSignal`) is properly reset across pause / resume / seek / teardown to avoid stale signal leaks.

Without this, a lookahead chunk already downloaded at the segment level could still flood MSE in a tight loop at chunk-handover time — the buffer gate on MSE appends is not sufficient on its own.

---

## MSE detach recovery (`MSE_DETACHED`)

`PlaybackController.handleMseDetached` is the single convergence point for two Chromium failure modes that both make the current `MediaSource` session unrecoverable:

| Trigger | Symptom | Detection point |
|---|---|---|
| Memory-pressure SB eviction | `InvalidStateError` from `appendBuffer` with `source_buffer_in_ms_list: false` | `BufferManager.drainQueue` fires `onMseDetached` callback (trace `65ef5d6c`) |
| Chunk-demuxer `endOfStream(decode_error)` | MS sealed; `videoEl.error.code === 3` + `sourceended` fires while `streamDone === false` | `BufferManager.init` `sourceended` listener fires `onMseDetached` (trace `38e711a9`) |

The second path can occur even with the `-bsf:v dump_extra=keyframe` BSF in place — the BSF eliminates the most common trigger but does not foreclose all unknown Chromium-internal decoder-reset scenarios.

### Detection

- **Path 1 (appendBuffer error):** `BufferManager.drainQueue` logs `source_buffer_in_ms_list` on every `appendBuffer` error. When `err.name === "InvalidStateError"` and `source_buffer_in_ms_list === false`, the `onMseDetached` callback is fired.
- **Path 2 (sourceended):** `BufferManager.init` registers a `sourceended` listener on the `MediaSource`. When it fires while `streamDone === false`, the same `onMseDetached` callback is fired.

### Recovery

`PlaybackController.handleMseDetached(res)`:

1. Tears down `BufferManager` and the current chunk pipeline.
2. Rebuilds both anchored at `videoEl.currentTime` directly (seek-anchored — same rationale as the seek path; no snap math).
3. Re-initialises MSE and restarts the chunk series from that position.
4. Budget: **3 recreates per session**. Beyond that, surfaces a fatal `MSE_DETACHED` error to the user via the playback error contract.

`MSE_DETACHED` is a value in `PlaybackErrorCode` (client-only — it never crosses the wire). It is intentionally not renamed to reflect the two-path coverage: from the retry-policy and error-overlay perspective both paths mean "MSE session is unrecoverable, rebuild budget spent." See `02-Chunk-Pipeline-Invariants.md § 1a` for the full rationale.

### Observability

A `playback.mse_recovery` span event is emitted on `playback.session` for each recovery attempt with attributes `{ attempt, attempt_max, current_time_s, resume_chunk_start_s }`. Filter `playback.mse_recovery` in Seq to audit budget burn rate in production.

---

## Rust / Tauri translation notes

The `pull(controller)` shape maps 1:1 to:

```rust
axum::Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx))
```

where the segment producer task sends on `tx` only when `rx` has capacity (`try_send` / `send` back-pressure). Encoder-wait becomes `tokio::sync::Notify`. There is no impedance mismatch — the pattern was deliberately chosen to be idiomatic in both environments.
