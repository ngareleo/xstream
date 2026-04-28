# Boot and Shutdown

## Startup Sequence

1. `src/index.ts` reads `config.ts` based on `NODE_ENV`
2. `tmp/segments/` directory created if missing
3. `getDb()` opens SQLite connection, enables WAL + foreign keys, runs `migrate.ts`
4. `restoreInterruptedJobs()` inspects any `transcode_jobs` rows with `status = 'running'`: jobs with segments on disk are restored into memory and marked `complete`; jobs with no segments are marked `error`
5. Continuous scan loop starts (background async loop): `while(true) { scanLibraries(); sleep(scanIntervalMs) }` — runs immediately then repeats every `config.scanIntervalMs` (default 30s)
6. `Bun.serve()` starts on configured port

## Graceful Shutdown

SIGTERM and SIGINT handlers call `shutdown()`:

1. `killAllJobs(5000)` from `server/src/services/ffmpegPool.ts` — sends SIGTERM to every live ffmpeg process, waits up to 5 s, then SIGKILL any that are still alive. Per-job SIGKILL escalation (2 s) fires first, so laggards are usually gone before the 5 s sweep expires.
2. `closeDb()` — closes the SQLite connection (flushes WAL)
3. `process.exit(0)`

In-progress transcode jobs are left in `status='running'` in the DB so `restoreInterruptedJobs()` handles them correctly on the next startup.
