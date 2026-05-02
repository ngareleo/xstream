# Boot and Shutdown

## Startup Sequence

1. `src/main.rs` reads `config.rs` based on `RUST_ENV`
2. `tmp/segments/` directory created if missing
3. `get_db()` opens SQLite connection, enables WAL + foreign keys, runs `db/migrate.rs`
4. `restore_interrupted_jobs()` inspects any `transcode_jobs` rows with `status = 'running'`: jobs with segments on disk are restored into memory and marked `complete`; jobs with no segments are marked `error`
5. Continuous scan loop starts (background async task): runs `scan_libraries()` immediately then repeats every `config.scan_interval_ms` (default 30s)
6. Axum server starts on configured port

## Graceful Shutdown

SIGTERM and SIGINT handlers call `shutdown()`:

1. `kill_all_jobs(5000)` from `server-rust/src/services/ffmpeg_pool.rs` — sends SIGTERM to every live ffmpeg process, waits up to 5 s, then SIGKILL any that are still alive. Per-job SIGKILL escalation (2 s) fires first, so laggards are usually gone before the 5 s sweep expires.
2. `close_db()` — closes the SQLite connection (flushes WAL)
3. `std::process::exit(0)`

In-progress transcode jobs are left in `status='running'` in the DB so `restoreInterruptedJobs()` handles them correctly on the next startup.
