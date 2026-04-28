# Streaming Layer — Bun → Rust Migration

**Scope.** The end-to-end streaming pipeline from `startTranscode` mutation through ffmpeg encode to the length-prefixed binary stream consumed by the React client. This doc captures the current Bun reality, the contracts the Rust port must preserve, the recommended Rust shape, and the forward constraints needed so the port doesn't foreclose multi-peer sharing.

**Read first.** The protocol-level docs in [`Streaming/`](../../architecture/Streaming/README.md) cover the wire format, playback scenarios, and chunk-pipeline invariants. This doc is the **server-side migration view** and assumes the reader has skimmed:

- [`Streaming/00-Protocol.md`](../../architecture/Streaming/00-Protocol.md) — wire framing, init segment, backpressure, seeking
- [`Streaming/02-Chunk-Pipeline-Invariants.md`](../../architecture/Streaming/02-Chunk-Pipeline-Invariants.md) — PTS contract, per-chunk init re-append, lookahead
- [`Streaming/04-Demand-Driven-Streaming.md`](../../architecture/Streaming/04-Demand-Driven-Streaming.md) — pull contract, MSE detach recovery
- [`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md) — stable contracts that survive the rewrite

---

## 1. Current Bun implementation

### 1.1 Stream endpoint — `server/src/routes/stream.ts`

Single function, 368 lines. Pull-based `ReadableStream` bound to a Bun `Response`.

**Length-prefixed framing** (`stream.ts:21-27`):

```ts
function writeLengthPrefixed(controller: ReadableStreamDefaultController, data: Uint8Array): void {
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint32(0, data.byteLength, false); // big-endian
  controller.enqueue(header);
  controller.enqueue(data);
}
```

**Boundary constants and config-derived tunables.** Two values still live as module-local consts in `stream.ts` (`ENCODER_POLL_MS = 100` at line 16 and `INIT_WAIT_ATTEMPTS = 600` at line 19 — pure implementation detail of the polling loop). The idle-kill threshold has moved to `AppConfig`:

| Tunable | Source | Value | Purpose |
|---|---|---|---|
| `config.stream.connectionIdleTimeoutMs` | `server/src/config.ts` (`StreamConfig`) | 180 000 ms (default) | Idle kill-switch — must exceed widest client backpressure halt (~60 s with `forwardTargetS=60`). Do **not** weaken (feedback memory). Read at `stream.ts:134, 268, 338`. Was a module-local `CONNECTION_TIMEOUT_MS` const before commit `d3f98fa`. |
| `ENCODER_POLL_MS` | `stream.ts:16` | 100 ms | Sleep between disk re-checks when ffmpeg hasn't yet produced the next segment. |
| `INIT_WAIT_ATTEMPTS` | `stream.ts:19` | 600 | 60 s budget for `init.mp4` to appear (slow ffprobe on large HEVC). |

The Rust port should mirror this split: idle timeout reaches via `AppState`, polling cadence stays a private const inside the stream module.

**Pull-shape** (`stream.ts:183-347`):

The `ReadableStream` `pull(controller)` body runs at most one segment worth of work per call — driven by the consumer's `reader.read()` cadence. No internal queue, no internal loop over segments. This is invariant #12 in [`code-style/Invariants/00-Never-Violate.md`](../../code-style/Invariants/00-Never-Violate.md) and translates 1:1 to `axum::body::Body::from_stream` driven by an `mpsc::Receiver`.

Two distinct phases inside `pull`:

1. **Init phase** (`stream.ts:202-265`) — first pull blocks until `job.initSegmentPath` is set or 60 s elapses, then writes init bytes once.
2. **Media phase** (`stream.ts:267-346`) — every subsequent pull resolves the path for `segment_NNNN.m4s`, reads it from disk, writes it length-prefixed, increments `index`. If the file isn't yet on disk, the pull sleeps `ENCODER_POLL_MS` and re-checks; the loop bails out into the `idle_timeout` close path after `config.stream.connectionIdleTimeoutMs` of inactivity (`stream.ts:338`).

**`?from=K` mid-chunk skip — REMOVED on main (commit `cbfdd56`).**

The earlier query parameter and the matching `fromIndex` were removed in the seek refactor: ffmpeg's `-ss seekTime` produces the user's first segment directly, so the client no longer instructs the server to skip leading segments. **The Rust port must NOT reintroduce a server-side skip mechanism.** Lines `stream.ts:58–59` (where the parameter used to be parsed) now hold the `traceparent` carrier setup. See [`../../architecture/Streaming/00-Protocol.md`](../../architecture/Streaming/00-Protocol.md) for the live seek protocol.

**traceparent extraction** (`stream.ts:56-67`):

```ts
const carrier: Record<string, string> = {};
req.headers.forEach((value, key) => { carrier[key] = value; });
const incomingCtx = propagation.extract(context.active(), carrier);
const span = streamTracer.startSpan("stream.request", { … }, incomingCtx);
```

W3C trace-context flows in via the `traceparent` request header; the `stream.request` span is opened as a child of whatever the client sent. This is already cross-instance compatible — preserves trivially across peer-streaming.

**Connection lifecycle** (`stream.ts:96-143`):

`finalise(reason)` is the single cleanup path; reasons are `"complete" | "client_disconnected" | "idle_timeout"`. It calls `removeConnection(jobId)` and, when the active-connection count reaches zero with the job still `running`, calls `killJob(jobId, kill_reason)` with the matching `kill_reason` enum value (see [`../../architecture/Observability/01-Logging-Policy.md`](../../architecture/Observability/01-Logging-Policy.md)). `killJob` is now imported from `services/ffmpegPool.ts` (see §1.2 below).

**Cold-start path (post `8927c92`/`4d6f2ba`/`987ff10`/`a8ac700`).** The first-chunk path is no longer a simple "request 30 s, wait for ffmpeg, send segments" loop — it's a cooperative dance between client and server with several behaviors the Rust port must preserve as part of the protocol contract:

- **Parallel mutation+init** (commit `8927c92`) — the client issues the `appendBuffer` for the previous chunk's init segment while the next chunk's `startTranscode` mutation is still in flight; the stream endpoint must serve the init segment as the very first frame on the wire (already true; see invariant #2).
- **Small first chunk on mid-file seek** — when the client requests `startS > 0`, it requests a short window (`firstChunkDurationS` from `clientConfig.playback`, in `client/src/config/appConfig.ts`) so the prefetch RAF trips and eager-warms ffmpeg for the next chunk. The server side is unchanged — chunkDuration is just a request parameter — but the Rust port should not assume a uniform 30 s cadence on every chunk.
- **DO NOT shorten the first chunk at `startS = 0`** (commit `987ff10`). VAAPI HDR 4K silently produces zero segments on `-ss 0 -t 30` (see [`../../server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`](../../server/Hardware-Acceleration/01-HDR-Pad-Artifact.md)). The first-chunk shortening is an `startS > 0` optimization only; a Rust port that mistakenly applies it uniformly will resurrect this VAAPI pathology.
- **4K startup buffer cut to 5 s** (commit `4d6f2ba`) — the client's playback gate now opens at 5 s of buffered media (was 10 s); the server must therefore deliver the first ~5 s of media within the user's perceived wait budget. This pressures the cold-start ffmpeg path (probe + first segment) more than the older 10 s gate did, making the silent-failure event below load-bearing.
- **Decoder-warmup spinner suppression** (commit `a8ac700`) — purely client-side, not a server contract, but documented here so the Rust port's acceptance criteria include it.

### 1.2 Chunker — `server/src/services/chunker.ts` + `services/ffmpegPool.ts`

866 lines (`chunker.ts`) plus a 232-line `ffmpegPool.ts` extracted in commit `c8cb229`. The chunker owns job registration, the three-tier VAAPI fallback, segment-watch, and DB persistence; the pool owns the live-process map, the cap, kill dispatch, and SIGTERM→SIGKILL escalation.

**Concurrency cap — now in `ffmpegPool.ts`.** The cap limit is read from config (`config.transcode.maxConcurrentJobs`, default 3) and enforced via reservations rather than a count over a single map:

```ts
// ffmpegPool.ts:67-84
export function getCapLimit(): number { return config.transcode.maxConcurrentJobs; }

export function tryReserveSlot(jobId: string): Reservation | null {
  if (liveActiveCount() + reservations.size >= config.transcode.maxConcurrentJobs) return null;
  reservations.add(jobId);
  return { jobId, release(): void { /* idempotent */ reservations.delete(jobId); } };
}
```

Three sets (`reservations`, `liveCommands`, `dyingJobIds` at `ffmpegPool.ts:56-58`) replace the old two-map count. A reservation is held during the `ffprobe + mkdir` window, then consumed by `spawnProcess` which moves the id into `liveCommands`. Dying jobs (SIGTERM dispatched, exit pending) are tracked in `dyingJobIds` and **do not** count toward the cap — slots free immediately on SIGTERM, eliminating the cap-starvation bug fixed in PR #33. The chunker calls `tryReserveSlot` at `chunker.ts:153` and rejects with a typed `CAPACITY_EXHAUSTED` error at `chunker.ts:185` carrying `retryAfterMs: config.transcode.capacityRetryHintMs` (default 1000). The Rust port collapses these three sets into one `Arc<Semaphore>` plus a `dyingJobIds` set carried on `AppState` (see §3); the dying-set bookkeeping is what makes the semaphore release race-free across SIGTERM kills.

**Job ID derivation** (`chunker.ts:81`):

```ts
function jobId(contentKey: string, resolution: Resolution, start?: number, end?: number): string {
  return createHash("sha1")
    .update(`${contentKey}|${resolution}|${start ?? ""}|${end ?? ""}`)
    .digest("hex");
}
```

`contentKey` is the video's `content_fingerprint`, which is itself `SHA-1(first 64 KB) prefixed with byte size` ([`server/DB-Schema/00-Tables.md`](../../server/DB-Schema/00-Tables.md)). The job ID is therefore deterministic across restarts and across nodes — two callers asking for byte-identical `(contentKey, resolution, start, end)` get the same job ID. **This is the foundation of the content-addressed cache constraint in §4 below.**

**Inflight dedup** (`chunker.ts:130-148`):

When a concurrent call finds `hasInflightOrLive(id)` true (helper at `ffmpegPool.ts:87`), it polls `getJob(id)` every `INFLIGHT_DEDUP_POLL_MS` (100 ms) up to `config.transcode.inflightDedupTimeoutMs` (default 5 s) instead of spawning a second ffmpeg.

**Job restoration from disk.** If the SQLite `transcode_jobs` row says `status = "complete"` AND `init.mp4` exists on disk, `startTranscodeJob` reconstructs the `ActiveJob` from DB rows and skips ffmpeg entirely. Missing `init.mp4` for a "complete" job → wipe the segment dir and re-encode (the reservation is released along the non-spawn path; see `chunker.ts:229-232, 285-303`).

**Boot-time job restoration** — separate file `server/src/services/jobRestore.ts` (25 lines): on startup, every `transcode_jobs` row with `status = "running"` is forcibly marked `error` — the server died mid-encode, the partial segment dir cannot safely be served. `startTranscodeJob` then wipes and re-encodes on the next request.

**ffmpeg supervision** (`chunker.ts:316-755` — function `runFfmpeg`):

- Probe via `FFmpegFile.probe()` ([`ffmpegFile.ts`](../../../server/src/services/ffmpegFile.ts)) — derives codec, pix_fmt, bit depth, HDR transfer.
- `applyOutputOptions` builds the encode argv (per-resolution profile, hwaccel chain).
- Spawn via `ffmpegPool.spawnProcess(id, command, hooks)` (`ffmpegPool.ts:107`); the pool registers the process in `liveCommands` and wires per-job `ProcessHooks` (`onStart`/`onStderr`/`onProgress`/`onComplete`/`onKilled`/`onError`).
- `command.inputOptions(["-loglevel", "error"])` at `chunker.ts:418` keeps real errors but suppresses frame/info chatter, so the chunker can stream stderr lines as warnings without log spam.
- Watch `segment_dir` via `fs.watch` (NOT `fs/promises.watch` — Bun-specific bug, comment at `chunker.ts:780`).
- Three-tier VAAPI cascade in `runFfmpeg`: fast-VAAPI → sw-pad VAAPI → software libx264. Per-source state cached in `vaapiVideoState: Map<videoId, "needs_sw_pad" | "hw_unsafe">` (`chunker.ts:43`) so subsequent chunks skip already-known-failing tiers. The `transcode.job` span is opened at `chunker.ts:346`; the tonemap attribute (`hwaccel.hdr_tonemap`) is set at `chunker.ts:386`. See §1.5 below for the full span surface.

**Kill paths — now in `ffmpegPool.ts`:**

- `killJob(id, reason)` (`ffmpegPool.ts:160`) — single-job kill; `reason` is the `kill_reason` enum value (defined in `ffmpegPool.ts:8-15`). Adds the id to `dyingJobIds` so the cap frees immediately, dispatches SIGTERM, schedules a SIGKILL escalation after `config.transcode.forceKillTimeoutMs` (default 2 s).
- `killAllJobs(timeoutMs?)` (`ffmpegPool.ts:206`) — graceful SIGTERM with `config.transcode.shutdownTimeoutMs` deadline (default 5 s), then SIGKILL stragglers. Called from the `index.ts` shutdown handler.

The old `killedJobs` set on `chunker.ts:33` is gone. The pool now keeps the equivalent state as `dyingJobIds: Set<string>` (`ffmpegPool.ts:58`) and `killReasons: Map<string, KillReason>` (`ffmpegPool.ts:59`), so the `.on("end")` handler can distinguish a deliberate kill from a clean self-exit and emit the right `kill_reason` attribute on the span.

**Silent-failure event** (`chunker.ts:586`). When ffmpeg exits 0 with `segmentCount === 0` — the VAAPI HDR 4K silent-success class — the chunker emits a `transcode_silent_failure` span event on the live `transcode.job` span, sets the span status to `ERROR`, and propagates the failure into the cascade as if ffmpeg had errored. The event payload carries the 4 KB stderr tail, `chunk_start_s`, `chunk_duration_s`, and `encode_duration_ms` for triage (Seq query: `@MessageTemplate = 'transcode_silent_failure'`). The Rust port must reproduce this contract — a clean-exit-but-zero-output cannot be allowed to mark the job complete. See [`02-Observability-Layer.md`](02-Observability-Layer.md) for the observability framing and [`../../server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`](../../server/Hardware-Acceleration/01-HDR-Pad-Artifact.md) for the failure class.

**Wall-clock budgets — now config-driven:**

- `config.transcode.orphanTimeoutMs` (default 30 s, read at `chunker.ts:460`) — ffmpeg killed if `connections === 0` after this long (prefetched chunk that the client never connected to).
- `config.transcode.maxEncodeRateMultiplier` (default 3, read at `chunker.ts:478`) — actual budget is `chunkWindowSeconds × multiplier × 1000 ms` (or a 1 h fallback for full-video transcodes). Wall-clock cap on a single encode that's making slow progress with a connected client; expiry emits the `max_encode_timeout` kill_reason.

### 1.3 Job store — `server/src/services/jobStore.ts`

88 lines. A plain `Map<string, ActiveJob>` plus `subscribeToJob` async iterable for GraphQL subscriptions. **No persistence** — jobStore is the source of truth for live ffmpeg jobs; SQLite mirrors it for audit + restart recovery.

`addConnection` / `removeConnection` are increment/decrement on `job.connections`. The **count is the gating signal** for orphan kills and idle-timeout kills.

### 1.4 ffmpeg path resolution — `server/src/services/ffmpegPath.ts`

`resolveFfmpegPaths()` is memoized; called once from `index.ts` at boot. Returns `{ ffmpeg, ffprobe, versionString }`. `applyToFluentFfmpeg(paths)` (`ffmpegPath.ts:149`) then writes the paths into fluent-ffmpeg's module-global cache via `setFfmpegPath` / `setFfprobePath`. **Every other module is forbidden from calling `setFfmpegPath`** — the comment at `chunker.ts:18-21` and `ffmpegFile.ts:15-18` flags this explicitly. The Rust port replaces module-global state with explicit `AppState` (see §3 below).

The resolver verifies the installed ffmpeg's version line against `scripts/ffmpeg-manifest.json`'s `versionString` field; mismatch is fatal with a pointer to `bun run setup-ffmpeg --force`.

### 1.5 Span surface — what the Rust tracing layer must reproduce

<!-- Span surface synced from docs/architecture/Observability/server/00-Spans.md — verify against main before porting. -->

Two server-side spans are part of the stable contract; the Rust tracing layer must emit identical names, attributes, and events so existing Seq queries and Grafana panels keep working. Cross-reference [`02-Observability-Layer.md`](02-Observability-Layer.md) for the SDK shape and [`../../architecture/Observability/server/00-Spans.md`](../../architecture/Observability/server/00-Spans.md) for the canonical reference.

**`stream.request`** — opened in `stream.ts:63-67` (child of the client's `chunk.stream` span via `traceparent`). Attributes: `job.id`. Events: `stream_started`, `init_wait_complete` (`init_wait_ms`, `attempts`, `has_init`), `init_sent` (`bytes`), `init_timeout`, `stream_complete` (`segments_sent`, `total_bytes_sent`, `duration_ms`, `transfer_rate_kbps`), `client_disconnected` (`segments_sent`), `idle_timeout` (`segments_sent`), `job_not_found`, `job_errored`.

**`transcode.job`** — opened at `chunker.ts:346` (child of `job.resolve`). Attributes: `job.id`, `job.video_id`, `job.resolution`, `job.chunk_start_s`, `job.chunk_duration_s`, `hwaccel` (`software` | `vaapi` | `videotoolbox` | `qsv` | `nvenc` | `amf`), `hwaccel.forced_software` (true on a HW→software fallback retry), `hwaccel.vaapi_sw_pad` (true on the tier-2 retry), `hwaccel.hdr_tonemap` (true when `tonemap_vaapi` was in the filter chain; if false on a known HDR source, `FFmpegFile.isHdr` source-detection regressed). Events: `probe_complete`, `probe_error`, `transcode_started`, `transcode_progress` (periodic, ~10 s; `frames`, `fps`, `kbps`, `timemark`, `percent`), `transcode_fallback_to_vaapi_sw_pad` (carries `ffmpeg_exit_code` + 4 KB `ffmpeg_stderr` tail), `transcode_fallback_to_software` (same diagnostic payload), `transcode_silent_failure` (ffmpeg exited cleanly but `segmentCount === 0`; carries `ffmpeg_stderr` 4 KB tail, `chunk_start_s`, `chunk_duration_s`, `encode_duration_ms`; span status set to ERROR — Seq query `@MessageTemplate = 'transcode_silent_failure'`), `vaapi_marked_needs_sw_pad` / `vaapi_marked_unsafe`, `transcode_error`, `transcode_killed` (carries `kill_reason` ∈ `client_request` | `client_disconnected` | `stream_idle_timeout` | `orphan_no_connection` | `max_encode_timeout` | `cascade_retry` | `server_shutdown`), `transcode_complete`. The original span ends at the failure event; a fresh `transcode.job` span covers the retry. Span duration is the full ffmpeg lifetime (probe + encode).

---

## 2. Stable contracts (must not change)

These are the surfaces the React client and the OTel pipeline see. Breaking any one of them means rewriting client code or invalidating dashboards — which the migration is committed not to do.

| Contract | Where it lives today | Rust port must |
|---|---|---|
| 4-byte BE uint32 length prefix + raw fMP4 bytes | `stream.ts:21-27` | Emit byte-identical framing |
| Init segment is the first frame on every new stream | `stream.ts:202-265` | Same — preserve invariant #2 |
| `?from=K` query parameter | **REMOVED in commit `cbfdd56`** — `-ss seekTime` anchors the user's first segment directly | Must NOT reintroduce a server-side skip mechanism |
| 180 s idle kill | `config.stream.connectionIdleTimeoutMs` (in `server/src/config.ts`) | Not shorter; not removed |
| `maxConcurrentJobs = 3` (config-driven), returns `CAPACITY_EXHAUSTED` typed error | `config.transcode.maxConcurrentJobs`; cap enforced at `ffmpegPool.ts:73` (`tryReserveSlot`); rejection at `chunker.ts:185` | Return the same union-error shape with `retryAfterMs = config.transcode.capacityRetryHintMs` |
| Job ID = `sha1(contentKey \| resolution \| start \| end)` | `chunker.ts:81` | Compute byte-identically (Rust `sha1` crate) |
| `kill_reason` enum: `client_request`, `client_disconnected`, `stream_idle_timeout`, `orphan_no_connection`, `max_encode_timeout`, `cascade_retry`, `server_shutdown` | Defined in `ffmpegPool.ts:8-15`; emitted on `transcode_killed` event | Emit the same string values in OTel attributes |
| `transcode.job` + `stream.request` span names + attributes | `chunker.ts:346`, `stream.ts:63-67` (see §1.5 for the verbatim surface) | Emit the same span surface so existing Seq queries keep working |
| `transcode_silent_failure` event on clean-exit-zero-output | `chunker.ts:586` | Reproduce — silent success cannot mark the job complete |
| Stale `transcode_jobs` with `status = running` are forced to `error` on boot | `jobRestore.ts` | Same (cf. §5 — cache vs identity DB split) |

---

## 3. Rust target shape

### 3.1 Crates (locked)

| Concern | Crate | Why |
|---|---|---|
| HTTP body | `axum` 0.7+ via `tokio::sync::mpsc` → `axum::body::Body::from_stream` | 1:1 translation of pull-based `ReadableStream` |
| Process | `tokio::process::Command` with `Child::kill_on_drop(true)` | Built-in, integrates with the runtime |
| File watch | `notify` | Cross-platform inotify / FSEvents / ReadDirectoryChangesW |
| Hash | `sha1` | Byte-identical SHA-1 for job ID + content fingerprint |
| Cancellation | `tokio_util::sync::CancellationToken` | Replaces `AbortController` / `req.signal` |
| Concurrency | `Arc<Semaphore>` | Replaces the count-based cap (multi-peer + multi-window race-safe) |
| Shared maps | `Arc<DashMap>` (or `Arc<RwLock<HashMap>>`) | Replaces module-global `Map<…>` in jobStore |

### 3.2 Stream endpoint sketch

```rust
async fn stream_handler(
    Path(job_id): Path<String>,
    Query(q): Query<StreamQuery>,                // from: Option<u32>
    Extension(state): Extension<AppState>,
    Extension(req_ctx): Extension<RequestContext>, // see Web-Server-Layer.md
    headers: HeaderMap,
) -> impl IntoResponse {
    let span = state.tracer.start_with_context("stream.request", &req_ctx.otel_ctx);
    let from_index = q.from.unwrap_or(0);

    // Validate job (memory + DB) before committing to the stream.
    let memory_job = state.job_store.get(&job_id);
    if memory_job.is_none() && db::jobs::get(&state.db, &job_id)?.is_none() {
        return (StatusCode::NOT_FOUND, "Job not found").into_response();
    }

    let (tx, rx) = mpsc::channel::<Result<Bytes, std::io::Error>>(16);
    let cancel = CancellationToken::new();

    tokio::spawn(stream_pump(state.clone(), job_id.clone(), from_index, tx, cancel.clone(), span));

    let body = Body::from_stream(ReceiverStream::new(rx));
    Response::builder()
        .header(CONTENT_TYPE, "application/octet-stream")
        .header(CACHE_CONTROL, "no-store")
        .body(body)
        .unwrap()
}
```

The `stream_pump` task owns the per-connection state (`index`, `init_sent`, `last_sent_at`) and loops with `tokio::select!` over (a) the next-segment-ready signal from `notify`, (b) `cancel.cancelled()`, (c) `tokio::time::sleep(IDLE_TIMEOUT)`. The `mpsc` channel is the backpressure conduit — when the consumer stops reading, the channel fills and `tx.send(...).await` parks naturally, no manual sleep loop required.

### 3.3 Differences vs. Bun that affect the translation

- **`req.signal.aborted` defensive blocks disappear.** Bun can mark `req.signal` aborted before the first `await`; in axum the consumer dropping causes `tx.send` to fail with a closed-channel error which terminates the pump. The `try { await Bun.sleep() } catch { ... }` patterns at `stream.ts:192-196, 205-216, 295-299, 332-336` have no Rust equivalent — they're dead code in the port.
- **`fs.watch` Bun-specificity goes away.** `chunker.ts:780` notes that `fs/promises.watch` doesn't work in Bun; in Rust, `notify::RecommendedWatcher` is the cross-platform default and works correctly on all three OSes.
- **`fluent-ffmpeg` module-global state becomes `AppState`.** No more `setFfmpegPath` discipline — `AppState.ffmpeg_paths: FfmpegPaths` is threaded into every spawn site. The "stale per-module write clobbers startup" footgun (cf. comments at `chunker.ts:18-21`) is structurally impossible in the Rust port. Note: `c8cb229` already extracted the cap + lifecycle bookkeeping into `ffmpegPool.ts` — that's half of this refactor done on the Bun side. The remaining global is fluent-ffmpeg's path cache, which the Rust port retires by construction.
- **Counter cap → `Arc<Semaphore>`.** The reservation pattern at `ffmpegPool.ts:72-84` becomes `Arc<Semaphore::new(config.transcode.max_concurrent_jobs)>`; `startTranscodeJob` does `let permit = state.job_semaphore.try_acquire().map_err(|_| Capacity)?;` and the `OwnedSemaphorePermit` lives on the `ActiveJob` so the slot frees on drop. The `dyingJobIds` set is preserved as a sibling on `AppState`: jobs we've SIGTERMed don't count toward the cap, so a slow-to-exit ffmpeg can't starve the next request.
- **Two-phase init segment.** ffmpeg writes `init.mp4` and `segment_NNNN.m4s` files into the segment directory; the Rust port preserves this layout (see [`06-File-Handling-Layer.md`](06-File-Handling-Layer.md) for the directory lifecycle). The init-segment poll at `stream.ts:202-265` becomes a `tokio::time::timeout(60s, init_ready.notified()).await?` against a `tokio::sync::Notify` set by the watcher when `init.mp4` reaches non-zero size.

### 3.4 Three-tier VAAPI cascade

The cascade structure inside `runFfmpeg` (`chunker.ts:316-755`) is recursive — on `ffmpeg error`, `runFfmpeg` is re-invoked with mutated tier flags. In Rust, the cleanest translation is a loop with explicit tier state:

```rust
enum Tier { FastVaapi, SwPadVaapi, Software }
let mut tier = initial_tier_for(&video, &state.vaapi_state);
loop {
    match run_ffmpeg_at(tier, &job, &paths, ...).await {
        Ok(()) => break,
        Err(EncodeError { exit_code, stderr }) => {
            tier = match tier {
                Tier::FastVaapi if !file.is_hdr => { state.vaapi_state.insert(video_id, "needs_sw_pad"); Tier::SwPadVaapi }
                Tier::FastVaapi => Tier::Software,    // HDR: skip sw-pad (same chain, would fail identically)
                Tier::SwPadVaapi => { state.vaapi_state.insert(video_id, "hw_unsafe"); Tier::Software }
                Tier::Software => return Err(EncodeError { ... }),
            };
        }
    }
}
```

Eliminates the recursive call + duplicated event emission inside `runFfmpeg`'s cascade.

---

## 4. Forward constraints for peer-sharing

These are the things that look fine for single-user but bite when sharing arrives. Bake into the Rust port from day one.

### 4.1 Job ID and segment cache key are decoupled

The on-disk layout is `tmp/segments/<jobId>/`, named by the ephemeral job ID. **In the Rust port, the cache lookup is keyed by the canonical content tuple `(videoId, resolution, startS, endS)`, not by `jobId`.**

```rust
struct JobStore {
    by_id: DashMap<String, Arc<ActiveJob>>,
    by_content: DashMap<(VideoId, Resolution, StartS, EndS), String>,
}
```

Today's `jobId` formula already maps one tuple to one ID, so the index is initially redundant — but the seam exists. When sharing ships and a content-addressed cache layer is introduced, no chunker code rewrite is needed. Without the seam, two peers asking for byte-identical segments could spawn a second ffmpeg if the lookup was implemented naively against `by_id` only. **Out of scope explicitly:** fuzzy-range matching (peer B asks `[300s, 600s]`, peer C asks `[330s, 600s]` — both produce separate runs, do not splice).

### 4.2 Per-connection pull isolation

Each `GET /stream/:jobId` connection holds its OWN `mpsc::Receiver` and its own subscription to the `notify` watcher's events. **Do NOT share a single `tokio::sync::Notify` across two stream handlers for the same job** — a slow remote peer's full channel must not back-pressure a local user's playback. A naive optimisation ("only one watcher per job") would silently couple consumers. State this explicitly in the Rust port's `stream_pump` doc-comment.

The watcher is per-job-directory (one `notify::RecommendedWatcher` per `tmp/segments/<jobId>/`); the per-consumer channels subscribe to a `broadcast::Sender<SegmentReady>` that the watcher fans out to. Each consumer pulls from its own `broadcast::Receiver`; lagged receivers receive `RecvError::Lagged` and re-scan the directory rather than stalling the others.

### 4.3 Backpressure is per-consumer

The `mpsc::channel(16)` size is per-consumer, not shared. For 4K segments at ~6 MB each, 16 segments = ~96 MB worst case per consumer. With the §5.2 design budget of 10+ concurrent consumers per job, this caps memory at ~1 GB worst case and amortises far below that in normal flow. Document the 16-segment buffer choice in the `stream_handler` so a future tuning pass knows what it's tuning.

### 4.4 traceparent already works cross-peer

`stream.ts:56-67` extracts `traceparent` from the inbound request's headers regardless of origin. When peer B's client opens `GET /stream/:jobId` against peer A, peer A's `stream.request` span correctly nests under peer B's `chunk.stream` span — same trace ID, no protocol change. The Rust port preserves this with `opentelemetry::propagation::TextMapPropagator::extract` over `axum::http::HeaderMap`. **Constraint:** the inbound `traceparent` header must pass through any future auth middleware unchanged. Cross-reference [`02-Observability-Layer.md`](02-Observability-Layer.md) and [`../../architecture/Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md).

---

## 5. Open questions

1. **`broadcast` vs. per-consumer `notify`.** The §4.2 design uses `broadcast::Sender<SegmentReady>` so the watcher fans to all consumers. Alternative: each consumer holds its own `Arc<Notify>` and the watcher loops `for n in subscribers { n.notify_one() }`. `broadcast` is simpler but loses events on `RecvError::Lagged`; `Notify` is wakeup-only and forces a directory re-scan on each wake regardless. Decide during implementation; both satisfy the per-consumer-isolation invariant.

2. **`config.transcode.orphanTimeoutMs` and sharing.** Today, 30 s is the budget for the local user to connect after `startTranscodeJob` returns (`chunker.ts:460`). Under sharing, peer B might call `startTranscode` from across the network and incur RTT before opening the stream — 30 s should still be sufficient (transit + handshake << 30 s on any reasonable link), but worth re-validating with a real cross-peer test.

3. **fluent-ffmpeg's `-loglevel error` discipline.** `chunker.ts:418` suppresses ffmpeg's frame-progress chatter. The Rust port uses `tokio::process::Command` directly and reads `stderr` line by line into the `tracing::debug!` stream. The doc on `02-Observability-Layer.md` should specify whether the per-line debug events are kept under a feature flag or always-on. (Current Bun behaviour: stderr captured to a ring buffer in the chunker and surfaced only on encode failure.)

4. **`segment_pattern` portability.** ffmpeg's `-f hls -hls_segment_filename "segment_%04d.m4s"` works on all three OSes; the absolute path passed in is the OS-native form (forward slashes on Linux/macOS, backslashes on Windows). `PathBuf` + `to_string_lossy()` handles this; verify `%04d` survives quoting on Windows.

5. **Init segment generation.** The init.mp4 is produced by ffmpeg's HLS muxer alongside the media segments — not by a separate ffmpeg pass (the architect's earlier characterisation of "two-phase" referred to the file system reading sequence on the consumer side: init first, then segments). Verify on a fresh trace before the Rust port commits to this assumption.

---

## 6. Critical files reference

| File | Lines | Role in the port |
|---|---|---|
| `server/src/routes/stream.ts` | 368 | Stream endpoint — full rewrite to `axum::Body::from_stream` |
| `server/src/services/chunker.ts` | 866 | Chunker — full rewrite; preserve cascade + dedup semantics |
| `server/src/services/ffmpegPool.ts` | 232 | Cap + lifecycle (extracted in `c8cb229`) — collapses into `Arc<Semaphore>` + dying-set on `AppState` |
| `server/src/services/ffmpegFile.ts` | 426 | ffprobe wrapper — port struct-for-struct |
| `server/src/services/ffmpegPath.ts` | 152 | Manifest-pinned path resolution — replace module-global with `AppState` |
| `server/src/services/jobStore.ts` | 88 | In-memory map — replace with `Arc<DashMap>` + content-key index |
| `server/src/services/jobRestore.ts` | 25 | Boot-time stale-job sweep — port verbatim |
| `server/src/types.ts` | 140 | Type shapes (`ActiveJob`, `PlaybackErrorCode`, …) — Rust struct equivalents |
| `server/src/config.ts` | 159 | `AppConfig` (`transcode`/`stream` namespaces) — Rust port mirrors the structure on `AppState` |
| `scripts/ffmpeg-manifest.json` | — | Per-platform pin — bundled into Tauri resource dir (cf. [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md)) |
