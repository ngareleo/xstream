# ffmpeg Pool

`server-rust/src/services/ffmpeg_pool.rs` owns the bounded concurrency layer for all ffmpeg processes. The chunker owns the VAAPI tier cascade, segment watching, and orphan/max-encode timers; they all call through the pool API.

## Why a separate module

Before the pool existed the cap state (`live`, `dying`, `inflight`) lived inside the chunker. Rapid back-to-back seeks deterministically exhausted the 3-slot cap because SIGTERM'd 4K-software encodes held their slot for up to 20 s while flushing (trace `1ac6637ead86d6b65df08637cbabfacd`, 2026-04-27). Extracting the pool allowed the cap formula to exclude dying jobs immediately and enforce a 2 s SIGKILL escalation. Today `PoolInner` (in `server-rust/src/services/ffmpeg_pool.rs`) owns five fields: `live: DashMap<String, LivePid>`, `inflight: DashSet<String>`, `dying: DashSet<String>`, `kill_reasons: DashMap<String, KillReason>`, and `escalation_cancel: DashMap<String, Arc<Notify>>` (the per-job notifier the SIGKILL escalation task awaits).

## Cap formula

```
used_slots = live.len() − dying.len() + inflight.len()
cap hit    = used_slots >= TranscodeConfig::max_concurrent_jobs (default 3)
```

- `live` — spawned ffmpeg processes, live or dying.
- `dying` — subset of `live` that have been SIGTERM'd but not yet exited. Their slot is freed immediately on kill.
- `inflight` — claimed but not yet spawned (covers the `start_transcode_job` registration window — the slot is held by a `Reservation` returned from `try_reserve_slot`).

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
try_reserve_slot(job_id) → Option<Reservation>   # fails fast if cap exhausted
    ↓
run_to_completion(reservation, …)                # reservation consumed; ffmpeg spawned
    ↓
ExitOutcome { Killed | Complete | Error }        # exactly one variant returned
```

`run_to_completion` returns exactly one `ExitOutcome` variant. The chunker's VAAPI cascade lives in the `ExitOutcome::Error` branch, so a deliberate kill cannot trigger a cascade re-encode for a disconnected user.

## Kill path

`kill_job(id, reason: KillReason)`:

1. Moves `id` from `live` into `dying` — slot freed immediately for the cap formula.
2. Records the reason in `kill_reasons` so `run_to_completion` knows this was intentional.
3. Sends `SIGTERM` via `tokio::process::Child::start_kill`.
4. Spawns an escalation task that awaits an `Arc<Notify>` stored in `escalation_cancel`; if the process hasn't exited within `transcode.force_kill_timeout_ms` (default 2 000 ms) the task issues `SIGKILL`. Process exit notifies the same `Notify` to cancel the escalation.
5. When the process exits (either signal), the run-loop emits `ExitOutcome::Killed { reason }`.

Idempotent: calling `kill_job` twice on the same id is a no-op after the first call (the entry is already in `dying`). Calling it on an unknown id is a no-op. Reservations that haven't yet been consumed by `run_to_completion` are released by dropping the `Reservation` rather than via `kill_job`.

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

`kill_all_jobs()` — uses `transcode.shutdown_timeout_ms` (default 5 000 ms) as the upper bound:

1. Calls `kill_job(id, KillReason::ServerShutdown)` on every live command (per-job SIGKILL escalation starts).
2. Waits with `tokio::time::timeout` for all per-job exit notifications.
3. After the timeout, sends SIGKILL to any remaining stragglers and short-circuits.

Called from the shutdown path in `server-rust/src/lib.rs`. The default sweep timeout (5 s) > the per-job force-kill timeout (2 s), so most jobs are already gone by the time the sweep timeout fires.

## Telemetry

The `concurrency_cap_reached` span event (on `job.resolve`) now includes:

| Field | Meaning |
|---|---|
| `cap.dying_count` | Jobs SIGTERM'd, not yet exited. If non-zero and cap is full, the 2 s SIGKILL window is the bottleneck — check `ffmpeg_pool` logs for escalation warnings. |
| `cap.dying_ids_json` | IDs of dying jobs — cross-reference with `transcode.job` spans to see what they were encoding. |

The older fields (`cap.active_jobs_json`, `cap.inflight_ids_json`, `cap.requested_*`) are unchanged.

## Public API

```rust
impl FfmpegPool {
    pub fn try_reserve_slot(&self, job_id: String) -> Option<Reservation>;
    pub fn has_inflight_or_live(&self, id: &str) -> bool;
    pub fn snapshot_cap(&self) -> CapSnapshot;
    pub fn cap_limit(&self) -> usize;            // TranscodeConfig::max_concurrent_jobs
    pub fn capacity_retry_hint_ms(&self) -> u64; // TranscodeConfig::capacity_retry_hint_ms
    pub async fn run_to_completion(&self, reservation: Reservation, …) -> ExitOutcome;
    pub fn kill_job(&self, id: &str, reason: KillReason);
    pub async fn kill_all_jobs(&self);
}
```

The pool exports no module-private timing constants; all tunables come from `TranscodeConfig` on `AppContext` so callers and tests can read them through one source of truth.

## Exported types

```rust
/// Opaque handle returned by `try_reserve_slot`. Holds the semaphore
/// permit so the slot stays claimed until the reservation is consumed
/// (handed to `run_to_completion`) or dropped (releases the permit).
pub struct Reservation {
    job_id: String,
    permit: Option<OwnedSemaphorePermit>,
}

/// Variant returned by `run_to_completion` — exactly one fires per spawn.
/// `stderr_tail` carries the last 4 KB of ffmpeg stderr so cascade
/// fallbacks and the failure-diagnostic events have the same surface.
pub enum ExitOutcome {
    Complete { stderr_tail: String },
    Killed { reason: KillReason, stderr_tail: String },
    Error { code: Option<i32>, stderr_tail: String },
}

/// Snapshot of cap state at a point in time; returned by `snapshot_cap()`.
pub struct CapSnapshot {
    pub live: usize,      // live.len()
    pub dying: usize,     // dying.len()
    pub inflight: usize,  // inflight.len()
    pub used: usize,      // live − dying + inflight (the cap formula numerator)
    pub limit: usize,     // TranscodeConfig::max_concurrent_jobs
}
```

`KillReason` is documented in the § above.
