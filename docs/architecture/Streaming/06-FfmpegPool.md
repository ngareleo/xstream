# ffmpeg Pool

`server-rust/src/services/ffmpeg_pool.rs` owns the bounded concurrency layer for all ffmpeg processes. The chunker owns the VAAPI tier cascade, segment watching, and orphan/max-encode timers; they all call through the pool API.

## Why a separate module

Before the pool existed the cap state (`activeCommands`, `killedJobs`, `inflightJobIds`) lived inside chunker.ts. Rapid back-to-back seeks deterministically exhausted the 3-slot cap because SIGTERM'd 4K-software encodes held their slot for up to 20 s while flushing (trace `1ac6637ead86d6b65df08637cbabfacd`, 2026-04-27). Extracting the pool allowed the cap formula to exclude dying jobs immediately and enforce a 2 s SIGKILL escalation.

## Cap formula

```
usedSlots = liveCommands.size − dyingJobIds.size + reservations.size
cap hit   = usedSlots >= config.transcode.maxConcurrentJobs (default 3)
```

- `liveCommands` — spawned ffmpeg processes, live or dying.
- `dyingJobIds` — subset of `liveCommands` that have been SIGTERM'd but not yet exited. Their slot is freed immediately on kill.
- `reservations` — claimed but not yet spawned (covers the `startTranscodeJob` registration window).

## Configuration

The pool's tunable knobs live on `AppConfig` (`server-rust/src/config.rs`) so service-level policy is consolidated in one place rather than scattered as module-private constants:

| Field | Default | Purpose |
|---|---|---|
| `transcode.max_concurrent_jobs` | 3 | Cap limit. |
| `transcode.force_kill_timeout_ms` | 2 000 | SIGTERM → SIGKILL grace per job. |
| `transcode.shutdown_timeout_ms` | 5 000 | Total wait in `kill_all_jobs` before the terminal SIGKILL pass. |
| `transcode.orphan_timeout_ms` | 30 000 | Kill ffmpeg if a job has zero connections after this long (chunker timer). |
| `transcode.max_encode_rate_multiplier` | 3 | Wall-clock encode budget = `chunk_duration_s × this × 1000` (chunker timer). |
| `transcode.capacity_retry_hint_ms` | 1 000 | `retry_after_ms` returned to clients on `CAPACITY_EXHAUSTED`. |
| `transcode.inflight_dedup_timeout_ms` | 5 000 | Max wait for a concurrent caller to register a peer's job. |
| `stream.connection_idle_timeout_ms` | 180 000 | Idle window before `/stream/:jobId` declares the connection dead. |

## Lifecycle

```
tryReserveSlot(jobId)    → Reservation | null   # fails fast if cap exhausted
    ↓
spawnProcess(reservation, command, hooks)        # reservation consumed; command.run() called
    ↓
onProcessExit(id, "end" | "error")              # cleans all state; dispatches exactly one hook
```

`onProcessExit` dispatches `onKilled` xor `onComplete` xor `onError` — never two. The chunker's VAAPI cascade lives in `onError`, so a deliberate kill cannot trigger a cascade re-encode for a disconnected user.

## Kill path

`killJob(id, reason)`:

1. Moves `id` from active to `dyingJobIds` — slot freed immediately for the cap formula.
2. Sets `killReasons[id]` so `onProcessExit` knows this was intentional.
3. Sends `SIGTERM`.
4. Schedules a `SIGKILL` after `config.transcode.forceKillTimeoutMs` (default 2 000 ms).
5. When the process exits (either signal), `onProcessExit` calls `onKilled(reason)`.

Idempotent: calling `killJob` twice on the same id is a no-op after the first call. Calling it on an unknown id is a no-op. Calling it on a not-yet-spawned reservation releases the reservation instead.

## KillReason union

```rust
pub enum KillReason {
    ClientRequest,
    ClientDisconnected,
    StreamIdleTimeout,
    OrphanNoConnection,
    MaxEncodeTimeout,
    CascadeRetry,
    ServerShutdown,
}
```

All kill-reason strings are now type-checked at the call site. The `cascade_retry` reason is used when the chunker kills a VAAPI job to retry at a lower tier.

## Shutdown sweep

`kill_all_jobs(timeout_ms?)` — when omitted, defaults to `config.transcode.shutdown_timeout_ms` (5 000 ms):

1. Calls `killJob(id, "server_shutdown")` on every live command (per-job SIGKILL escalation starts).
2. `Promise.race([all exits, timeout])`.
3. After the timeout, SIGKILL any remaining stragglers.

Called from the shutdown path in `server-rust/src/lib.rs`. The default sweep timeout (5 s) > the per-job force-kill timeout (2 s), so most jobs are already gone by the time the sweep timeout fires.

## Telemetry

The `concurrency_cap_reached` span event (on `job.resolve`) now includes:

| Field | Meaning |
|---|---|
| `cap.dying_count` | Jobs SIGTERM'd, not yet exited. If non-zero and cap is full, the 2 s SIGKILL window is the bottleneck — check `ffmpegPool` logs for escalation warnings. |
| `cap.dying_ids_json` | IDs of dying jobs — cross-reference with `transcode.job` spans to see what they were encoding. |

The older fields (`cap.active_jobs_json`, `cap.inflight_ids_json`, `cap.requested_*`) are unchanged.

## Public API

```typescript
tryReserveSlot(jobId): Reservation | null
hasInflightOrLive(id): boolean
snapshotCap(): CapSnapshot
getCapLimit(): number                 // returns config.transcode.maxConcurrentJobs
spawnProcess(reservation, command, hooks): void
killJob(id, reason): void
killAllJobs(timeoutMs?): Promise<void>
```

The pool exports no module-private timing constants; all tunables come from `AppConfig` so callers and tests can read them through one source of truth.

## Exported types

```typescript
// Opaque handle returned by tryReserveSlot; consumed by spawnProcess.
type Reservation = { jobId: string };

// Callbacks handed to spawnProcess; exactly one of onComplete/onError/onKilled fires.
type ProcessHooks = {
  onProgress?: (data: ProgressData) => void;
  onComplete: () => void;
  onError: (err: Error) => void;
  onKilled: (reason: KillReason) => void;
};

// Progress data extracted from ffmpeg's output.
type ProgressData = {
  percent?: number;
  timemark?: string;
  currentFps?: number;
};

// Snapshot of cap state at a point in time; returned by snapshotCap().
type CapSnapshot = {
  live: number;          // liveCommands.size
  dying: number;         // dyingJobIds.size
  reservations: number;  // reservations.size
  used: number;          // live − dying + reservations (the cap formula numerator)
  limit: number;         // config.transcode.maxConcurrentJobs
};
```

`KillReason` is documented in the § above.
