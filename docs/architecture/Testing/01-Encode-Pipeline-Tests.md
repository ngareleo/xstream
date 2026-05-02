# Encode-pipeline tests

Real-media integration tests for `chunker::start_transcode_job` that exercise the full ffmpeg path against actual movie files. Catches regressions in HW-accel cascade, HDR encoding, the chunk PTS contract, and the no-software-fallback-at-4K invariant.

## Opt-in via env var

Tests are gated by `XSTREAM_TEST_MEDIA_DIR`. When unset (the default), the entire encode-test suite is skipped. When set, the directory must contain media files matching the basenames in `server-rust/src/test/fixtures/media.rs` (currently Mad Max: Fury Road and Furiosa: A Mad Max Saga). Symlink if your local filenames differ.

The `/setup-local` skill has a step that prompts for this directory and writes it to a Tauri config file. Tests auto-discover the path at runtime.

## What the tests assert

For each `(fixture, resolution)` combination:

- **Sequential consecutive encodes** — chunks 0..3 in order. Each completes, segments hit disk, init.mp4 + at least one `*.m4s` per job.
- **Concurrent foreground+lookahead pair** — chunks 0 and 1 fired via `Promise.all`. Both complete, neither starves the other, and the chunk-1 first packet's PTS is within ±1 s of `chunkStartSeconds` (the [chunk PTS contract](../Streaming/02-Chunk-Pipeline-Invariants.md#1-chunk-pts-contract--raw-tfdt--mode--segments--per-chunk-timestampoffset) — the client's `BufferManager.setTimestampOffset(chunkStartS)` maps raw `tfdt`-relative segments to source-time; without it, chunk-1 PTS would be ~0).

For 4K resolution on hosts with a working iGPU:

- **No software fallback** — every `transcode.job` span for a 4K job must NOT contain a `transcode_fallback_to_software` event AND its `hwaccel` attribute must NOT be `"software"`. Software 4K encode stalls continuously; treating any fallback as a UX regression is the [encoder edge-case test policy](02-Encoder-Edge-Case-Policy.md).

For 1080p / 240p the assertion is downgraded to "encoding succeeded" — software fallback at lower resolutions is acceptable.

## Test infrastructure

Located under `server-rust/src/test/`:

| Module | Role |
|---|---|
| `fixtures/mod.rs` | Per-fixture descriptors: filename, is_hdr, test_resolutions, chunk_start_times, chunk_duration_s. Add a new fixture by appending to `ALL_FIXTURES`. |
| `encode_harness.rs` | Helper functions for test setup: `resolve_fixtures_or_skip()` (returns None when env var unset), `setup_chunker_for_test()` (initializes the chunker), `run_chunk()` (wraps `start_transcode_job` and manages connection count), `wait_for_completion()`, `first_packet_pts()` (extracts PTS from init+segment). |
| `trace_capture.rs` | In-memory span capture so tests can verify `transcode.job` span attributes. Captures spans without affecting production telemetry. |

The main test suite: `server-rust/src/services/tests/chunker_encode_integration.rs`. Skipped wholesale when fixtures resolve to None.

## GPU detection — reuses production logic

The 4K-no-fallback gate uses the production `detect_hw_accel(ffmpeg_path, mode)` from `server-rust/src/services/hw_accel.rs`. The harness detects available hardware (Linux VAAPI via `/dev/dri/renderD128`, native macOS/Windows) and calls the production detector with `"auto"` on capable systems, `"off"` otherwise.

The discriminant for the 4K-no-fallback assertion is whether the final span's `hwaccel` attribute is anything other than `"software"` — the same field production reads.

## Adding a new fixture

1. Trim a representative clip of the source (or use the full file) and either drop it in `XSTREAM_TEST_MEDIA_DIR` or symlink with the expected basename.
2. Add a `MediaFixture` entry in `server-rust/tests/encode_fixtures.rs` documenting the source's distinguishing properties (HDR? unusual codec? uneven aspect ratio?) so the next person knows why this fixture exists.
3. If the fixture should run at a new resolution combo or chunk-start offset, set `testResolutions` and `chunkStartTimes` accordingly.

See the [encoder edge-case test policy](02-Encoder-Edge-Case-Policy.md) for when adding a fixture is required vs optional.

## Running locally

```sh
# All tests (encode tests skip when env var unset)
cd server-rust && cargo test

# Encode tests only, with fixtures
XSTREAM_TEST_MEDIA_DIR=/path/to/movies cargo test --test chunker_encode_integration

# Filter to one fixture × one resolution (handy when iterating on a fix)
XSTREAM_TEST_MEDIA_DIR=/path/to/movies cargo test --test chunker_encode_integration furiosa_4k
```
