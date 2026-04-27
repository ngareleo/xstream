# ADR: Single SourceBuffer per Session

**Decision: xstream uses one `SourceBuffer` per `MediaSource` session. Multi-SourceBuffer rotation is not used for seek, chunk-handover, or any scenario other than a mime-type change.**

## Context

During a review of seek latency and the MSE_DETACHED failure mode, the question arose: could rotating to a fresh `SourceBuffer` per chunk reduce Chrome's cumulative-byte watchdog pressure, or provide a cleaner state machine for seek resumption?

## Why not multi-SourceBuffer rotation

### MSE_DETACHED is a cumulative-byte watchdog, not a per-SB one

Chrome's memory-pressure eviction (`MSE_DETACHED`: `InvalidStateError` + `source_buffer_in_ms_list: false`) tracks the total bytes appended across the lifetime of a `MediaSource` session, not the instantaneous size of any one `SourceBuffer`. Adding more `SourceBuffer` objects does not reduce that cumulative footprint — each SB carries its own metadata overhead and its own `init.mp4` re-append, so multi-SB rotation would _grow_ the watchdog counter relative to single-SB with `remove()` eviction.

The right counter-pressure is the `remove()` calls `BufferManager` already issues during backpressure cycles. MSE_DETACHED is handled by tearing down and rebuilding the entire `MediaSource` (budget: 3 per session) — not by trying to keep one SB clean.

### The single-SB design is load-bearing for all three chunk-pipeline invariants

All three invariants in [`02-Chunk-Pipeline-Invariants.md`](02-Chunk-Pipeline-Invariants.md) assume a single `SourceBuffer`:

1. **PTS contract**: `sourceBuffer.mode = "segments"` + `-output_ts_offset` places each chunk's segments at their correct source-timeline position. With multiple SBs, each new SB would start at its own internal timeline; getting cross-SB PTS alignment right requires reproducing the `timestampOffset` arithmetic that `segments` mode handles automatically.

2. **Per-chunk init re-append**: Each chunk's `init.mp4` is appended to the same SB, replacing the previous chunk's `elst` box at the chunk-boundary moment. Rotating to a fresh SB would require full MSE re-init handshake at every chunk boundary — same overhead as the resolution-switch path, without the mime-type reason that forces it there.

3. **Lookahead queuing + drain**: The lookahead slot queues segments in JS memory and drains into the same SB on promotion, so chunk N's init only lands in the SB at the moment chunk N-1's foreground stream ends. A per-SB model would require each lookahead to own its SB from open time, which immediately violates invariant #3 — the lookahead's init would clobber the foreground's in-flight decode context.

### The `endOfStream` state machine becomes harder, not easier

`MediaSource.endOfStream()` must be called exactly once, on the single `MediaSource`, when the last chunk's last segment is appended. With multiple SBs active simultaneously (foreground + lookahead), determining which SB "owns" `endOfStream` and ensuring no SB is still `updating` at that moment requires a coordination layer that doesn't exist today and has no analogue in the MSE spec's reference flows.

### The promote-lookahead path already gives "fresh slot per chunk" semantics

`ChunkPipeline.openSlot` / `promoteLookahead` / `drainAndDispatch` already provide the isolation that multi-SB rotation is trying to buy:

- Lookahead network bytes land in a JS `queuedSegments` array, not in the SB, until promotion.
- Promotion is atomic from the SB's perspective: the SB sees chunk N-1's tail, then chunk N's init, then chunk N's segments — in strict order with no interleaving.
- `pauseLookahead()` / `resumeLookahead()` (added in the user-pause fix) extend this to network-layer pacing without touching the SB at all.

### Resolution switch is the one legitimate multi-MediaSource scenario

A resolution switch does require a new `MediaSource` (the mime type changes, so `addSourceBuffer` must be called with a new codec string — the old SB cannot be reused). This is a full teardown-and-rebuild handled by `PlaybackController.handleResolutionSwitch`. It is the exception that proves the rule: _mime change forces a new MS; seek and chunk-handover do not_.

## Decision record

| Scenario | SB strategy |
|---|---|
| Initial load | Single SB, `mode = "segments"` |
| Backpressure / resume | Same SB; `remove()` + hysteresis drive eviction |
| Seek | Same SB; `remove()` clears stale range; lookahead for new chunk |
| Chunk-handover (N → N+1) | Same SB; lookahead drain appends chunk N+1 init + segments |
| Resolution switch | New `MediaSource` + new SB (forced by mime-type change) |
| MSE_DETACHED recovery | New `MediaSource` + new SB; built at current chunk boundary |

## Files

- `client/src/services/bufferManager.ts` lines 113–164 — `init()` + `sourceBuffer.mode = "segments"` assignment, `remove()` eviction
- `client/src/services/chunkPipeline.ts` — `openSlot`, `promoteLookahead`, `drainAndDispatch`, `pauseLookahead`, `resumeLookahead`
- [`02-Chunk-Pipeline-Invariants.md`](02-Chunk-Pipeline-Invariants.md) — the three invariants this decision preserves
