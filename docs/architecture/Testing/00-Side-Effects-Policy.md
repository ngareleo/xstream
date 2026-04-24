# Tests must leave the host as they found it

The invariant: tests can write freely to their per-PID temp dir during execution, but **nothing they write may persist past worker exit, and they may never write into `tmp/xstream.db` or `tmp/segments/`** (the dev runtime paths).

This file documents the wiring that enforces the invariant + the rules for new tests.

## Why this exists

Before the per-PID isolation, four test files (`graphql.integration.test.ts`, `db/queries/{jobs,videos,libraries}.test.ts`) wrote test fixtures directly into the dev DB at `tmp/xstream.db`. Across many runs, the dev DB accumulated 6 ghost libraries (`gql-lib1`, `libtest`, `lib1`..`lib4`) and 10 dependent video rows that surfaced in the player's library UI. Diagnosed during this branch's session — see commit `386ef95` for the wiring + cleanup.

## How it's enforced

**`server/src/test/setup.ts`** is the Bun test preload (configured via `bunfig.toml`'s `[test] preload`). It runs once per test worker, before any test file is evaluated, and:

1. Creates `/tmp/xstream-test-<pid>/`.
2. Sets `process.env.DB_PATH` and `process.env.SEGMENT_DIR` to point inside it. Both env vars are honored by `server/src/config.ts` in **both** dev and prod branches (the dev branch was extended in commit `45f7f8f` for this purpose).
3. **Before** creating the current PID's dir, scans `/tmp` for any `xstream-test-<pid>` whose PID is no longer alive (`process.kill(pid, 0)` throws ESRCH) and `rm -rf`s them.

Cleanup runs at the **next** preload, not at the current exit. bun:test workers exit through a path that bypasses both `process.on("exit")` and `"beforeExit"`, so we can't reliably hook end-of-run. The next-preload-reaps-prior-PIDs model achieves the same outcome and is also SIGKILL-safe (a hard-killed worker leaves a dir; the next worker reaps it).

`SEGMENT_DIR` isolation is also load-bearing for correctness, not just hygiene: `startTranscodeJob` derives the job cache key from `content_fingerprint + resolution + time range`. Without a fresh dir, stale segments from a prior run let it "restore" the cached job and silently skip re-encoding — assertions about fresh encoding silently pass against ghost output.

## Rules for new tests

- Read `process.env.DB_PATH` and `process.env.SEGMENT_DIR` if you need the path. Never hardcode `tmp/xstream.db` or `tmp/segments/`.
- If your test spawns a real subprocess (ffmpeg, etc.), make sure it writes under `SEGMENT_DIR`. The chunker already does this via `config.segmentDir`.
- If your test creates rows in tables outside `videos` / `libraries` / `transcode_jobs`, the same per-PID isolation still applies — those rows live in the test DB and die with it.
- Don't rely on absolute counts (`SELECT COUNT(*) FROM videos`) — the per-PID DB is shared by all test files in the same worker, so other tests may have seeded data. Use unique IDs and assert on what your test created.

## Trace context capture

Same module also installs an in-memory `TracerProvider` (via `traceCapture.ts`) so tests can drain `transcode.job` / `chunk.stream` spans without flooding the dev Seq. Required because `trace.setGlobalTracerProvider` is one-shot in `@opentelemetry/api` — the preload calls `trace.disable()` first, then registers the in-memory provider so chunker's module-load `getTracer("chunker")` binds to it. Spans are exposed via `drainCapturedSpans()` / `resetCapturedSpans()`.
