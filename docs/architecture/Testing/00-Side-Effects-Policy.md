# Tests must leave the host as they found it

The invariant: tests can write freely to their per-test temp dir during execution, but **nothing they write may persist past test exit, and they may never write into `tmp/xstream-rust.db` or `tmp/segments-rust/`** (the dev runtime paths).

This file documents how the wiring enforces the invariant + the rules for new tests.

## Why this exists

Before the per-test isolation existed, integration tests could write fixtures directly into the dev DB and the dev would later see ghost libraries and orphan video rows in the player UI. Per-test temp paths eliminate the cross-contamination class of bug.

## How it's enforced

The Rust server's tests use `:memory:` SQLite and per-test temp dirs:

1. **`Db::open(Path::new(":memory:"))`** is the standard fixture for query-layer unit tests. Each `#[test]` constructs its own in-memory DB — no shared state between tests.
2. **Integration tests that need a filesystem** (segment dir, scan-walker fixtures) build their `AppContext` via the `for_tests(...)` constructor, which receives a `tempfile::TempDir` for the segment root. The `TempDir` is dropped at end-of-test and cleans up automatically.
3. **`AppContext::for_tests`** also stubs ffprobe at `/bin/true` so per-file probes don't actually invoke ffmpeg — the scanner tests focus on walk + insert correctness, not ffmpeg behaviour.
4. **No env-var hand-off.** The Rust tests don't override `DB_PATH` / `SEGMENT_DIR` env vars on a worker process; the test harness is in-process and passes paths explicitly through `AppContext`.

This sidesteps the historical problem of "test worker exits without running cleanup hooks" — there is no global filesystem state to clean up, because every test built its own.

## Encode-pipeline tests

A second class of tests under `server-rust/tests/` runs the actual ffmpeg pipeline against real fixture media files. These tests are gated by `XSTREAM_TEST_MEDIA_DIR`:

- **Without** `XSTREAM_TEST_MEDIA_DIR`: encode tests are skipped (they early-return with `eprintln!` indicating the skip reason).
- **With** the env var pointing at a directory of fixture clips: each test transcodes a known segment and asserts on the resulting span tree (e.g. `hwaccel != "software"` for the 4K-no-fallback assertion).

Encode-pipeline tests still write transcoded segments — they go to a `tempfile::TempDir` per test, never `tmp/segments-rust/`. See [`01-Encode-Pipeline-Tests.md`](01-Encode-Pipeline-Tests.md).

## Rules for new tests

- **Use `Db::open(Path::new(":memory:"))`** for query-layer unit tests.
- **Use `AppContext::for_tests(tempdir)`** for tests that need a filesystem + the full app context.
- **Never hardcode `tmp/xstream-rust.db` or `tmp/segments-rust/`.** Let the `TempDir` be the path source.
- **Don't rely on absolute counts** (`SELECT COUNT(*) FROM videos`) when sharing a DB across multiple `#[test]` items in the same module — use unique IDs and assert on what your test created. (Per-`#[test]` `:memory:` DBs sidestep this entirely; only relevant when a test deliberately reuses a DB across cases.)

## Trace context capture

When tests need to assert on span shape (e.g. encode-pipeline tests inspecting `hwaccel`, `transcode_complete`, fallback events), the Rust port uses `tracing-test` + an in-process `TestSubscriber` that captures spans/events into a `Vec<SpanData>` per test. The subscriber is set on a per-test scope — it does not affect the global `tracing` registry beyond the test's lifetime. See `server-rust/src/telemetry.rs::for_tests` for the constructor.
