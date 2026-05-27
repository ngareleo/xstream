# Boot and Shutdown

## Startup Sequence

1. `src/main.rs` reads `config.rs` based on `RUST_ENV`
2. `tmp/segments/` directory created if missing
3. `get_db()` opens SQLite connection, enables WAL + foreign keys, runs `db/migrate.rs`
4. `restore_interrupted_jobs()` inspects any `transcode_jobs` rows with `status = 'running'`: jobs with segments on disk are restored into memory and marked `complete`; jobs with no segments are marked `error`
5. Continuous scan loop starts (background async task): runs `scan_libraries()` immediately then repeats every `config.scan_interval_ms` (default 30s)
6. Axum server starts on configured port
7. An info log `"xstream-server listening"` is emitted with `startup_duration_ms` (time from `run()` entry to this point) and port info — this is the boot-complete marker and is queryable in Seq/Axiom for cold-start analysis. Added in PR #70.

## Graceful Shutdown

SIGTERM and SIGINT handlers trigger an axum shutdown (via `shutdown()` signal):

**Current scope (PR #70 — telemetry PR):**

1. Axum `select!` returns when the shutdown signal fires or the server terminates (e.g., serve error)
2. An info log `"xstream-server graceful shutdown complete"` is emitted with `shutdown_duration_ms` (time from signal to this point), `signal` (which signal: `"SIGTERM"`, `"SIGINT"`, or `"serve_exit"`), and is logged *before* `telemetry::shutdown()` flushes the exporter so the event reaches Seq/Axiom. This is queryable for shutdown latency analysis. Added in PR #70.
3. `close_db()` — closes the SQLite connection (flushes WAL)
4. `telemetry::shutdown()` flushes the OTel exporter
5. `std::process::exit(0)`

**Pending work (not yet wired):**

The documented `kill_all_jobs(5000)` call from `server-rust/src/services/ffmpeg_pool.rs` — sending SIGTERM to every live ffmpeg process, waiting up to 5 s, then SIGKILL any that are still alive — is **not yet integrated into the shutdown flow** and remains a follow-up task. Per-job SIGKILL escalation (2 s) and per-source VAAPI cache poisoning survive process shutdown via the DB; when the server restarts, orphaned ffmpeg processes (if any exist) are not automatically cleaned up by the server (operator responsibility). This is documented separately in [`../../architecture/Streaming/06-FfmpegPool.md`](../../architecture/Streaming/06-FfmpegPool.md).

In-progress transcode jobs are left in `status='running'` in the DB so `restore_interrupted_jobs()` handles them correctly on the next startup.
