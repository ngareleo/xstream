# File Handling Layer — Bun → Rust Migration

How xstream handles the filesystem: library walk + ffprobe pipeline, segment-directory lifecycle, ffmpeg path resolution, and disk-quota eviction. The Rust port preserves every observable behaviour and tightens two things: a content-addressed segment cache index (forward constraint for peer sharing) and an explicit `FfmpegPaths` value threaded through `AppState` instead of `fluent-ffmpeg`'s module-global `setFfmpegPath` cache.

## 1. Current Bun implementation

### Library walk + ffprobe

`server/src/services/libraryScanner.ts` (352 lines) owns the scan pipeline. The structure is:

1. `walkDirectory(dir, extensions)` — async generator, depth-first, yields paths whose lowercase extension is in the configured set (`server/src/services/libraryScanner.ts:80-97`).
2. `processFile(filePath, libraryId)` — `stat()` → `Promise.all([probeVideo, computeContentFingerprint])` → upsert `VideoRow` + replace stream rows (`server/src/services/libraryScanner.ts:104-155`).
3. `runConcurrently(tasks, limit=4)` — caps concurrent ffprobe processes via a worker-pool pattern; the limit is the constant `SCAN_CONCURRENCY = 4` (`server/src/services/libraryScanner.ts:33-45`).
4. `scanLibraryEntry(entry)` — collects all paths first, then dispatches the bounded-concurrency batch (`server/src/services/libraryScanner.ts:157-196`).
5. `scanLibraries()` — top-level entry; `markScanStarted()` is called synchronously before any `await` so concurrent callers race-safely (`server/src/services/libraryScanner.ts:295-348`).

The **content fingerprint** is the load-bearing identity for a video — every job ID downstream is keyed off it (`server/src/services/chunker.ts:81`). Formula:

```ts
// server/src/services/libraryScanner.ts:69-77
async function computeContentFingerprint(filePath: string, sizeBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha1");
    const stream = createReadStream(filePath, { start: 0, end: 65535 });
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("end", () => resolve(`${sizeBytes}:${hash.digest("hex")}`));
    stream.on("error", reject);
  });
}
```

Output is `<sizeBytes>:<sha1hex>` — stable across renames and moves, changes only when content changes. Used as the contentKey for `jobId(...)` so two encodes of the same source file always collapse to the same on-disk segment cache.

### Segment directory lifecycle

`server/src/services/chunker.ts` owns segment-directory creation, watching, and teardown; `server/src/services/ffmpegPool.ts` (extracted in commit `c8cb229`, 232 lines) owns the live-process map, kill dispatch, and SIGTERM→SIGKILL escalation.

In `c8cb229`, cap-management and process-lifecycle were extracted from `ffmpegFile.ts` into `server/src/services/ffmpegPool.ts` — module-level singletons (`reservations`, `liveCommands`, `dyingJobIds`, `killReasons`, `escalationTimers`, `hooksByJobId` at `ffmpegPool.ts:56-61`) replace the previous implicit state. The Rust port's `FfmpegPool` struct completes this: it internalizes those maps into a single `Arc<Mutex<PoolState>>` on `AppState`, and process-lifecycle hooks (`onStart`/`onStderr`/`onProgress`/`onComplete`/`onKilled`/`onError` at `ffmpegPool.ts:25-35`) become a `ProcessHooks` trait. Path resolution still uses fluent-ffmpeg's module-global `setFfmpegPath` on the Bun side (see "ffmpeg path resolution" below); the Rust port threads the binary path through `AppState` instead, with no global setter and no module-initialization-order dependency.

- **Path layout** (`server/src/services/chunker.ts:262, 363-364`):
  ```
  tmp/segments/<jobId>/init.mp4
  tmp/segments/<jobId>/segment_0000.m4s
  tmp/segments/<jobId>/segment_0001.m4s
  …
  ```
- **Stale-dir wipe before encode** (`server/src/services/chunker.ts:250-254`): if the previous run errored or the prior "complete" job's `init.mp4` is missing, `rm(segmentDir, { recursive: true, force: true })` followed by `mkdir(segmentDir, { recursive: true })`. Truncated content must never reach the wire.
- **Two-phase init segment**: ffmpeg's HLS fMP4 muxer writes `init.mp4` *before* any `segment_NNNN.m4s` file. The watcher (see below) treats the first `init.mp4` event specially and only marks the segment directory "ready" once `init.mp4` has non-zero size.
- **Watcher** (`server/src/services/chunker.ts:777-855`): `fs.watch(segmentDir, { persistent: false })` (Node EventEmitter API — `fs/promises.watch()` async iterable is unreliable in Bun, see comment at `chunker.ts:780`). On every `change` event:
  - If filename is `init.mp4` and `job.initSegmentPath` is null: stat-poll up to 40 × 50 ms until the file has bytes, then set `job.initSegmentPath` and notify subscribers.
  - If filename matches `^segment_\d{4}\.m4s$` and not yet seen: stat the file, parse the index, store the path in `job.segments[index]`, insert a row in the `segments` table, notify subscribers.
- **Cleanup on kill** (`server/src/services/ffmpegPool.ts:160-204`, function `killJob(id, reason)`): SIGTERMs the ffmpeg child, marks the id in `dyingJobIds` so the cap frees immediately, schedules a SIGKILL escalation after `config.transcode.forceKillTimeoutMs`. Does NOT remove the segment directory — that is left to `pruneLruJobs` (see "Disk quota eviction" below). Killed jobs stay on disk so a new connection can reuse the partial encode.

### ffmpeg path resolution

`server/src/services/ffmpegPath.ts` (153 lines) is a pinned-version resolver, not a discovery routine. Three layers:

1. **Manifest** at `scripts/ffmpeg-manifest.json` pins one jellyfin-ffmpeg version per platform (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`) with SHA256 + install strategy (`deb-install` | `portable-tarball` | `portable-zip`) and (for deb) an `installedPrefix`.
2. **`installedPath(entry, base)`** computes where the binary should live (`server/src/services/ffmpegPath.ts:67-73`):
   - `deb-install`: `<installedPrefix>/<base>` (e.g. `/usr/lib/jellyfin-ffmpeg/ffmpeg`)
   - `portable-tarball` / `portable-zip`: `vendor/ffmpeg/<platform>/<binName>` (where `binName` adds `.exe` on win32)
3. **`resolveFfmpegPaths()`** (`server/src/services/ffmpegPath.ts:89-143`):
   - Memoised — first call does the version check, subsequent calls return the cached `FfmpegPaths`.
   - Priority: `FFMPEG_PATH`/`FFPROBE_PATH` env override (skips version check) → manifest-prescribed path + version match → fatal error pointing at `bun run setup-ffmpeg`.
   - On success, calls `applyToFluentFfmpeg(paths)` exactly once: `ffmpeg.setFfmpegPath(...)` + `ffmpeg.setFfprobePath(...)` (`server/src/services/ffmpegPath.ts:145-152`).
   - **Invariant** (covered in `docs/code-style/Server-Conventions/00-Patterns.md`): no other module calls `setFfmpegPath`. fluent-ffmpeg's path cache is module-global; a stale per-module write clobbers the startup setting and silently re-routes to a host `ffmpeg` of unknown version — a common source of VAAPI probe failures.

### Disk quota eviction

`server/src/services/diskCache.ts` (84 lines) implements a strict LRU eviction over completed jobs:

```ts
// server/src/services/diskCache.ts:30-68
export async function pruneLruJobs(): Promise<void> {
  const limit = cacheLimitBytes();             // SEGMENT_CACHE_GB env or 20 GB default
  const jobs = getLruJobs();                   // ORDER BY updated_at ASC, status='complete'
  let totalBytes = jobs.reduce((acc, j) => acc + (j.total_size_bytes ?? 0), 0);
  if (totalBytes <= limit) return;

  for (const job of jobs) {
    if (totalBytes <= limit) break;
    let rmOk = false;
    try { await rm(job.segment_dir, { recursive: true, force: true }); rmOk = true; }
    catch (err) { log.warn("Failed to remove segment dir", { dir: job.segment_dir, message: (err as Error).message }); }

    if (rmOk) {
      deleteSegmentsByJob(job.id);
      markJobEvicted(job.id);                  // sets status='error' so next request re-encodes
      totalBytes -= job.total_size_bytes ?? 0;
    }
  }
}
```

Order matters: only after the rm succeeds do we update the DB and decrement the running total. If the rm fails (Linux RDR-only mount, sandboxing, etc.), the disk is still consuming that space — undercounting `totalBytes` would leave the cache permanently over-quota.

`pruneLruJobs()` is called on startup (after `restoreJobs`) and after each job completes.

## 2. Stable contracts the Rust port must preserve

These survive verbatim across the rewrite — the React client and the on-disk cache layout depend on them:

| Contract | Where | Why it must not change |
|---|---|---|
| Tmp segment layout `tmp/segments/<jobId>/init.mp4` + `segment_NNNN.m4s` | `server/src/services/chunker.ts:262, 363-364` | The stream handler reads files at these exact paths; a layout change would force a coordinated client refresh. |
| Content fingerprint formula `<sizeBytes>:<sha1(first 64 KB)>` | `server/src/services/libraryScanner.ts:69-77` | Persists in the DB column `videos.content_fingerprint`; a re-scan with a different formula re-keys every job and invalidates the cache. |
| Job ID = `sha1(contentKey | resolution | startS | endS)` | `server/src/services/chunker.ts:81` | Two encodes of the same `(video, ladder rung, range)` MUST collapse to one segment directory. The deterministic ID is what makes the cache content-addressed today. |
| Ladder filename pattern `segment_%04d.m4s` | `server/src/services/chunker.ts:364` | Matches the watcher regex at `chunker.ts:823`; changing the pattern silently breaks segment indexing. |
| ffmpeg manifest-pinned version per platform | `scripts/ffmpeg-manifest.json` | Whole HW-accel pipeline is validated against jellyfin-ffmpeg 7.1.3-Jellyfin specifically (see `docs/server/Hardware-Acceleration/00-Overview.md`). The Tauri bundle ships these exact assets. |
| Default cache quota = 20 GB; override via `SEGMENT_CACHE_GB` | `server/src/services/diskCache.ts:12-18` | Documented for ops; downstream tests assume the same env name. |
| Library walk concurrency = 4 (configurable knob, but the default is part of the contract) | `server/src/services/libraryScanner.ts:33` | At higher concurrency, `ffprobe` saturates I/O on spinning disks; at lower, scans of large libraries take noticeably longer. |
| `markScanStarted()` is synchronous before the first await | `server/src/services/libraryScanner.ts:303-304` | Race-safety against concurrent `scanLibraries()` callers — the dedup gate must not contain an await. |

## 3. Rust target shape

### Crates (locked)

| Concern | Crate | Why |
|---|---|---|
| File walk | `walkdir` 2.x | Mature, cross-platform, depth-first iterator — direct match for the current async generator. |
| File watch | `notify` 6.x (with `notify-debouncer-full` if event coalescing turns out to be needed) | Cross-platform inotify/FSEvents/ReadDirectoryChangesW. Used by `cargo-watch`, `tauri`, and most others — battle-tested. |
| Hashing | `sha1` 0.10 (`Sha1::new()` + `.update(...)` + `.finalize()`) | Std-shaped API; we don't need ring's perf at 64 KB inputs. |
| Hex encoding | `hex` 0.4 (`hex::encode(bytes)`) | One-line direct match for `digest("hex")`. |
| Process spawn (ffmpeg, ffprobe) | `tokio::process` (built-in) | Async child process; pairs with `kill_on_drop(true)` — see `01-Streaming-Layer.md`. |
| Path manipulation | `std::path::PathBuf` + `Path` | No string concat; `PathBuf::join` matches `path.join`. |

### Library scanner — `walkdir` + `tokio::task::spawn_blocking`

Translation of `walkDirectory` (async generator) → `walkdir::WalkDir` iterator:

```rust
// services/library_scanner.rs
use walkdir::{WalkDir, DirEntry};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

fn walk_directory(root: &Path, extensions: &HashSet<String>) -> Vec<PathBuf> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|res| res.ok())                                    // skip permission errors with a warn log in caller
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| extensions.contains(&s.to_lowercase()))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_path_buf())
        .collect()
}
```

`walkdir` is synchronous; for libraries with tens of thousands of files we wrap the call in `tokio::task::spawn_blocking` so the runtime's worker threads are not blocked. The "warn-and-continue" semantics for unreadable directories (`server/src/services/libraryScanner.ts:84-86`) are preserved by the `filter_map(|res| res.ok())` — but the Rust port should also `inspect_err` the discarded errors and emit a `tracing::warn!` per skipped path, exactly matching the Bun log line.

**Concurrency**: `runConcurrently(tasks, 4)` becomes a `tokio::sync::Semaphore` with 4 permits, or — simpler — `futures::stream::iter(...).buffer_unordered(4)`. Either preserves the 1:1 mapping of "at most 4 ffprobe processes in flight at once" without serialising on a Mutex.

```rust
use futures::stream::{self, StreamExt};

let total = paths.len();
let scan_progress = ScanProgress::new(library_id, total);

stream::iter(paths)
    .map(|path| {
        let progress = scan_progress.clone();
        async move {
            process_file(&path, library_id).await;
            progress.tick();                                           // emits a scan-progress GraphQL subscription event
        }
    })
    .buffer_unordered(SCAN_CONCURRENCY)                                // const = 4
    .collect::<()>().await;
```

### Content fingerprint — `tokio::fs::File::take(65_536)`

```rust
// services/library_scanner.rs
async fn compute_content_fingerprint(path: &Path, size_bytes: u64) -> std::io::Result<String> {
    use tokio::io::AsyncReadExt;
    let mut file = tokio::fs::File::open(path).await?;
    let mut buf = Vec::with_capacity(65_536);
    file.take(65_536).read_to_end(&mut buf).await?;
    let mut hasher = Sha1::new();
    hasher.update(&buf);
    Ok(format!("{}:{}", size_bytes, hex::encode(hasher.finalize())))
}
```

Reads at most 64 KB regardless of file size, exactly like the Node `createReadStream({ start: 0, end: 65535 })` (Node's `end` is inclusive, `take` is exclusive — the Rust call still reads bytes `[0, 65_536)` which is the same 64 KB window).

### Segment directory lifecycle — `notify` watcher

`fs.watch(segmentDir, { persistent: false })` becomes a `notify::RecommendedWatcher` watching the segment directory non-recursively, with events drained on a `tokio::sync::mpsc` channel:

```rust
// services/chunker/watcher.rs
use notify::{Watcher, RecursiveMode, RecommendedWatcher, Event, EventKind};
use tokio::sync::mpsc;
use std::path::PathBuf;

pub fn spawn_segment_watcher(
    job: Arc<ActiveJob>,
    segment_dir: PathBuf,
    init_path: PathBuf,
) -> tokio::task::JoinHandle<()> {
    let (tx, mut rx) = mpsc::unbounded_channel::<Event>();
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res| {
        if let Ok(event) = res {
            let _ = tx.send(event);                                    // unbounded — events are tiny
        }
    }).expect("failed to create watcher");
    watcher.watch(&segment_dir, RecursiveMode::NonRecursive).expect("watch failed");

    tokio::spawn(async move {
        // Hold the watcher alive — drop = stop watching
        let _watcher_guard = watcher;
        let mut seen_files = HashSet::new();
        let segment_re = regex::Regex::new(r"^segment_(\d{4})\.m4s$").unwrap();

        while let Some(event) = rx.recv().await {
            if matches!(job.status(), JobStatus::Error | JobStatus::Complete) {
                break;                                                  // drops watcher_guard → stops watching
            }
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                continue;
            }
            for path in event.paths {
                let Some(filename) = path.file_name().and_then(|s| s.to_str()) else { continue };

                if filename == "init.mp4" && job.init_segment_path().is_none() {
                    handle_init_segment(&job, &init_path).await;
                    continue;
                }
                if let Some(caps) = segment_re.captures(filename) {
                    let key = filename.to_string();
                    if seen_files.insert(key) {
                        let index: u32 = caps[1].parse().unwrap();
                        handle_media_segment(&job, &path, index).await;
                    }
                }
            }
        }
    })
}
```

The 40 × 50 ms init-segment poll for non-zero size becomes:

```rust
async fn handle_init_segment(job: &Arc<ActiveJob>, init_path: &Path) {
    for _ in 0..40 {
        if let Ok(meta) = tokio::fs::metadata(init_path).await {
            if meta.len() > 0 {
                job.set_init_segment_path(init_path.to_path_buf());
                job.notify_subscribers();
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    tracing::warn!(job_id = %job.id, "Init segment still empty after polling — skipping");
}
```

`notify`'s event semantics on Linux deliver `EventKind::Create` and a follow-up `EventKind::Modify` as ffmpeg writes the file — the `seen_files` set + the size-poll mirror the Bun code's defenses. On macOS (FSEvents) and Windows (RDCW) coalescing differs but the same dedup logic suffices; if event flapping turns out to matter, swap `recommended_watcher` for `notify-debouncer-full` with a 50 ms debounce window.

### ffmpeg path resolution — explicit `FfmpegPaths` in `AppState`

The Bun resolver's "memoise + `setFfmpegPath` once" pattern becomes a constructor that runs at boot and stores the result in `AppState`:

```rust
// services/ffmpeg_path.rs
#[derive(Clone, Debug)]
pub struct FfmpegPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub version_string: String,
}

pub fn resolve_ffmpeg_paths() -> Result<FfmpegPaths, FfmpegPathError> {
    let manifest = load_manifest()?;
    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);
    let entry = manifest.ffmpeg.platforms.get(&platform)
        .ok_or_else(|| FfmpegPathError::UnsupportedPlatform(platform.clone()))?;

    // 1. Env var override
    if let (Ok(f), Ok(p)) = (std::env::var("FFMPEG_PATH"), std::env::var("FFPROBE_PATH")) {
        if Path::new(&f).exists() && Path::new(&p).exists() {
            let v = run_version(&f).unwrap_or_else(|| "(unknown)".into());
            return Ok(FfmpegPaths { ffmpeg: f.into(), ffprobe: p.into(), version_string: v });
        }
    }

    // 2. Manifest-prescribed path
    let ffmpeg = installed_path(entry, "ffmpeg");
    let ffprobe = installed_path(entry, "ffprobe");
    if !ffmpeg.exists() || !ffprobe.exists() {
        return Err(FfmpegPathError::NotInstalled { ffmpeg, ffprobe, distribution: manifest.ffmpeg.distribution, version: manifest.ffmpeg.version });
    }

    // 3. Version match
    let actual = run_version(&ffmpeg).ok_or(FfmpegPathError::VersionUnreadable)?;
    if actual != manifest.ffmpeg.version_string {
        return Err(FfmpegPathError::VersionMismatch { expected: manifest.ffmpeg.version_string, actual });
    }
    Ok(FfmpegPaths { ffmpeg, ffprobe, version_string: actual })
}
```

`fluent-ffmpeg.setFfmpegPath` has no Rust analog because every ffmpeg invocation goes through `tokio::process::Command::new(&app_state.ffmpeg_paths.ffmpeg)` — there is no global to clobber. The "no other module calls setFfmpegPath" invariant becomes structurally enforced: there is nothing to call.

### Tauri-aware path layout

Under Tauri the `vendor/ffmpeg/<platform>/` directory of the Bun dev tree is replaced by Tauri's resource directory:

```rust
// In Tauri context, swap the manifest's vendor root for the bundle's resource_dir.
fn vendor_root(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle.path().resource_dir()
        .expect("resource dir")
        .join("ffmpeg")                                                 // bundle.resources includes vendor/ffmpeg/<platform>
}
```

The `installedPath` function's `portable-tarball` / `portable-zip` branches pick from `vendor_root().join(platform).join(bin_name(base))`. For `deb-install` on Linux under Tauri we still prefer the bundled portable build over the system install — Tauri targets must not assume `apt install` is in scope. The `08-Tauri-Packaging.md` doc covers the bundle layout in detail.

### Disk quota eviction — `tokio::fs::remove_dir_all`

```rust
// services/disk_cache.rs
pub async fn prune_lru_jobs(state: &AppState) -> Result<(), Error> {
    let limit_bytes = cache_limit_bytes();
    let jobs = db::queries::jobs::get_lru_jobs(&state.db_pool).await?;
    let mut total: u64 = jobs.iter().map(|j| j.total_size_bytes.unwrap_or(0) as u64).sum();
    if total <= limit_bytes { return Ok(()); }

    for job in jobs {
        if total <= limit_bytes { break; }
        match tokio::fs::remove_dir_all(&job.segment_dir).await {
            Ok(()) => {
                db::queries::segments::delete_by_job(&state.db_pool, &job.id).await?;
                db::queries::jobs::mark_evicted(&state.db_pool, &job.id).await?;
                total = total.saturating_sub(job.total_size_bytes.unwrap_or(0) as u64);
                tracing::info!(job_id = %job.id, freed_mb = (job.total_size_bytes.unwrap_or(0) as f64) / 1e6, "Evicted job");
            }
            Err(err) => {
                tracing::warn!(dir = %job.segment_dir.display(), error = %err, "Failed to remove segment dir");
                // Do NOT decrement total or mark evicted — disk still holds those bytes.
            }
        }
    }
    Ok(())
}
```

`saturating_sub` is the Rust equivalent of "don't underflow if the DB row's size lies"; the Bun code uses unbounded subtraction, but underflow on a `u64` is panic territory in Rust, so we choose saturation explicitly.

## 4. Forward constraints for peer-sharing

These are load-bearing for the Rust port even though sharing ships later. Each must be visible in the type system or module API of the Rust code from day one — retrofitting any of them after the fact is invasive.

### Content-addressed segment cache index

Today the segment cache is **already content-addressed** — the job ID is a deterministic SHA-1 over `(content_fingerprint, resolution, startS, endS)` (`server/src/services/chunker.ts:81`). What's missing is an **explicit lookup index** from `(videoId, resolution, startS, endS)` → segment-directory path.

The Rust port must add this index in the chunker module:

```rust
// services/chunker/cache_index.rs
#[derive(Hash, PartialEq, Eq, Clone)]
pub struct SegmentCacheKey {
    pub video_id: String,
    pub resolution: Resolution,
    pub start_s: Option<u32>,
    pub end_s: Option<u32>,
}

pub struct SegmentCacheIndex {
    by_key: DashMap<SegmentCacheKey, JobId>,                          // for "do we already have this on disk?"
    by_job: DashMap<JobId, SegmentCacheKey>,                          // for eviction — must be atomic with deletion
}

impl SegmentCacheIndex {
    pub fn lookup(&self, key: &SegmentCacheKey) -> Option<JobId> { self.by_key.get(key).map(|r| r.clone()) }
    pub fn insert(&self, key: SegmentCacheKey, job_id: JobId) { self.by_key.insert(key.clone(), job_id.clone()); self.by_job.insert(job_id, key); }
    pub fn evict(&self, job_id: &JobId) {
        if let Some((_, key)) = self.by_job.remove(job_id) {
            self.by_key.remove(&key);
        }
    }
}
```

**Why the explicit index** when the deterministic job ID already collapses identical encodes: without the index, the only way a future peer-sharing handler can dedup an incoming `(videoId, resolution, range)` request to an existing on-disk encode is to recompute the content fingerprint of the local copy of the same video. That works only if both peers have the file under the same path with the same hash — neither is guaranteed. The index lets node A look up "do we have segments for `(videoId, 1080p, 300, 600)`?" without needing to know the requesting peer's `content_fingerprint`.

**Eviction must keep the index consistent**: `prune_lru_jobs` (above) must call `cache_index.evict(&job.id)` in the same atomic step as `delete_segments_by_job` + `mark_evicted`. Cross-link `01-Streaming-Layer.md` for the concurrent-pull-isolation rule that depends on the index being a fast in-memory lookup.

**Out of scope**: fuzzy-range matching. If peer B asks for `[300s, 600s]` and peer C asks for `[330s, 600s]`, we do NOT splice an existing run. Future work; today both produce separate runs.

### Per-job segment directory must NOT be reused across content

The current path scheme `tmp/segments/<jobId>/` is content-addressed by virtue of the job ID derivation. The Rust port preserves this. **Do not** rename or scope the directory by anything ephemeral (the Rust port's `process_id`, the requesting peer, the connection handle) — that would break dedup the moment two consumers race for the same content.

### Identity DB lives outside `tmp/`

Today `tmp/xstream.db` holds everything (videos table, jobs, segments, etc.). Sharing introduces persistent identity data — the local node's Ed25519 keypair, trusted-peer records, issued/received invite tokens — that **MUST survive a `rm -rf tmp/`** (the user's expected reset gesture for the cache).

The Rust port must split the database from day one:

| DB | Path (dev) | Path (Tauri prod) | Contents |
|---|---|---|---|
| Cache DB | `tmp/xstream.db` | `<app_cache_dir>/xstream.db` | `videos`, `video_streams`, `video_metadata`, `jobs`, `segments`, `playback_history`, `watchlist`, `libraries`, `user_settings` |
| Identity DB | `data/xstream-identity.db` | `<app_data_dir>/xstream-identity.db` | `node_keypair`, `trusted_peers`, `issued_invites`, `received_invites` (all sharing-related; ships later) |

Even though no identity tables exist at the time the Rust port lands, the **two-DB seam** is wired into `AppState` from day one (`AppState { cache_db: SqlitePool, identity_db: SqlitePool, ... }`) so that introducing identity-side handlers later is a pure-additive change. See `05-Database-Layer.md` for full DB-layer detail.

### File-path safety: never trust paths from the wire

When sharing ships, an inbound GraphQL request from peer B may carry a `videoId` that maps to a file path under `node A`'s media library. The Rust port must guarantee that no handler ever resolves a wire-supplied string into a filesystem path that escapes the configured library roots — `..`-traversal protection lives in the upsert flow already (paths are stored absolute), but the **lookup flow** must also reject any video row whose `path` does not canonicalize to a child of one of the configured library roots. Today this is implicit (paths are inserted by the local scanner, never user-supplied). Document this as an invariant the moment sharing handlers exist; the Rust port doesn't need to enforce it now beyond preserving the "library-driven inserts only" invariant.

## 5. Open questions

These are explicit non-decisions to revisit during implementation.

1. **`notify` debouncing**: do we hit event-flap on macOS FSEvents during a 4K encode that writes ~200 segments at one-per-second? If yes, swap `RecommendedWatcher` for `notify-debouncer-full` with a 50 ms window. Verify on macOS hardware before committing.

2. **`spawn_blocking` vs. `tokio::fs` for the library walk**: `walkdir` is sync; wrapping it in `spawn_blocking` is correct but moves the whole walk to the blocking thread pool. For very large libraries (>100k files) this might exhaust the default 512 blocking threads on a misconfigured runtime. Alternative: `async-walkdir` crate. Decide based on observed walk durations once the port is up.

3. **Library walk symlink policy**: the Bun code calls `readdir` without symlink handling — symlinks to directories are followed implicitly via `entry.isDirectory()`. `walkdir` defaults to **not** following symlinks (we set `.follow_links(false)` above). Confirm with the user that this is the intended behaviour; otherwise flip to `.follow_links(true)` and document the risk of cycles.

4. **ffmpeg-manifest format**: the manifest currently mixes "where to download from" (`releaseUrl` + `asset` + `sha256`) with "where to install to" (`strategy` + `installedPrefix`). Under Tauri, the asset is bundled inside the app and there is no install step — the `strategy` field becomes meaningless at runtime, useful only at build-time. Consider splitting the manifest into a `build` section and a `runtime` section before Tauri ships, or document that `strategy` is build-only.

5. **`SEGMENT_CACHE_GB` knob under Tauri**: env vars are awkward in Tauri-bundled apps. Should the cache quota become a setting in the in-app config (persisted to the identity DB), with `SEGMENT_CACHE_GB` retained as a dev-only override? Likely yes — defer to settings UI design.

6. **Concurrency of `pruneLruJobs`**: today this runs inline after each job completes; under heavy churn (10+ concurrent jobs completing within seconds of each other) the loop runs N times in series. Move to a debounced background task (`tokio::sync::Notify` or a periodic 30 s tick) once concurrency is real.

7. **Eviction race against active reads**: `prune_lru_jobs` removes a directory while a future peer-sharing connection might still be reading from it. Today this is impossible because the cache always grows to 20 GB before evicting and connections are short-lived; under sharing it's plausible. Likely needs a per-job read-count guard before `remove_dir_all`. Defer to sharing implementation.

## Cross-references

- [`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md) — anchor doc, stable contracts list.
- [`01-Streaming-Layer.md`](01-Streaming-Layer.md) — segment serving from `tmp/segments/<jobId>/`; the file layout is shared with this doc.
- [`05-Database-Layer.md`](05-Database-Layer.md) — two-DB split (cache vs identity); `getLruJobs` query and segment row shape.
- [`docs/architecture/Library-Scan/00-Flow.md`](../../architecture/Library-Scan/00-Flow.md) — high-level scanner flow + scanStore subscription side.
- [`docs/server/Hardware-Acceleration/00-Overview.md`](../../server/Hardware-Acceleration/00-Overview.md) — why ffmpeg is version-pinned.
- [`docs/code-style/Server-Conventions/00-Patterns.md`](../../code-style/Server-Conventions/00-Patterns.md) — `setFfmpegPath` discipline (becomes structural in Rust).
- Forward: [`Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md) — the cache-index and identity-DB constraints above feed the sharing model.
