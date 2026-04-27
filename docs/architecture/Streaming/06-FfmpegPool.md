# ffmpeg Pool

`server/src/services/ffmpegPool.ts` owns the bounded concurrency layer for all ffmpeg processes. The chunker owns the VAAPI tier cascade, segment watching, and orphan/max-encode timers; they all call through the pool API.

## Why a separate module

Before the pool existed the cap state (`activeCommands`, `killedJobs`, `inflightJobIds`) lived inside chunker.ts. Rapid back-to-back seeks deterministically exhausted the 3-slot cap because SIGTERM'd 4K-software encodes held their slot for up to 20 s while flushing (trace `1ac6637ead86d6b65df08637cbabfacd`, 2026-04-27). Extracting the pool allowed the cap formula to exclude dying jobs immediately and enforce a 2 s SIGKILL escalation.

## Cap formula

```
usedSlots = liveCommands.size − dyingJobIds.size + reservations.size
cap hit   = usedSlots >= MAX_CONCURRENT_JOBS (3)
```

- `liveCommands` — spawned ffmpeg processes, live or dying.
- `dyingJobIds` — subset of `liveCommands` that have been SIGTERM'd but not yet exited. Their slot is freed immediately on kill.
- `reservations` — claimed but not yet spawned (covers the `startTranscodeJob` registration window).

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
4. Schedules a `SIGKILL` after `FORCE_KILL_TIMEOUT_MS = 2000 ms`.
5. When the process exits (either signal), `onProcessExit` calls `onKilled(reason)`.

Idempotent: calling `killJob` twice on the same id is a no-op after the first call. Calling it on an unknown id is a no-op. Calling it on a not-yet-spawned reservation releases the reservation instead.

## KillReason union

```typescript
type KillReason =
  | "client_request"
  | "client_disconnected"
  | "stream_idle_timeout"
  | "orphan_no_connection"
  | "max_encode_timeout"
  | "cascade_retry"
  | "server_shutdown";
```

All kill-reason strings are now type-checked at the call site. The `cascade_retry` reason is used when the chunker kills a VAAPI job to retry at a lower tier.

## Shutdown sweep

`killAllJobs(timeoutMs = 5000)`:

1. Calls `killJob(id, "server_shutdown")` on every live command (per-job 2 s SIGKILL escalation starts).
2. `Promise.race([all exits, timeout])`.
3. After the timeout, SIGKILL any remaining stragglers.

Called from `server/src/index.ts` shutdown handler. The 5 s sweep > 2 s per-job escalation, so most jobs are already gone by the time the sweep timeout fires.

## Telemetry

The `concurrency_cap_reached` span event (on `job.resolve`) now includes:

| Field | Meaning |
|---|---|
| `cap.dying_count` | Jobs SIGTERM'd, not yet exited. If non-zero and cap is full, the 2 s SIGKILL window is the bottleneck — check `ffmpegPool` logs for escalation warnings. |
| `cap.dying_ids_json` | IDs of dying jobs — cross-reference with `transcode.job` spans to see what they were encoding. |

The older fields (`cap.active_jobs_json`, `cap.inflight_ids_json`, `cap.requested_*`) are unchanged.

## Public API

```typescript
MAX_CONCURRENT_JOBS: number           // = 3
tryReserveSlot(jobId): Reservation | null
hasInflightOrLive(id): boolean
snapshotCap(): CapSnapshot
getCapLimit(): number
spawnProcess(reservation, command, hooks): void
killJob(id, reason): void
killAllJobs(timeoutMs?): Promise<void>
```
