# Encode-pipeline tests

Real-media integration tests for `chunker.startTranscodeJob` that exercise the full ffmpeg path against actual movie files. Catches regressions in HW-accel cascade, HDR encoding, the chunk PTS contract, and the no-software-fallback-at-4K invariant.

## Opt-in via env var

Tests are gated by `XSTREAM_TEST_MEDIA_DIR`. When unset (the default), the entire encode-test suite is skipped — `bun test` stays green for anyone without the fixtures locally. When set, the directory must contain media files matching the basenames in `server/src/test/fixtures/media.ts` (currently Mad Max: Fury Road and Furiosa: A Mad Max Saga). Symlink if your local filenames differ.

The `/setup-local` skill has a step that prompts for this directory and writes it to `.env`. `bun run check-env` reports per-fixture presence under "Test fixtures (dev)".

## What the tests assert

For each `(fixture, resolution)` combination:

- **Sequential consecutive encodes** — chunks 0..3 in order. Each completes, segments hit disk, init.mp4 + at least one `*.m4s` per job.
- **Concurrent foreground+lookahead pair** — chunks 0 and 1 fired via `Promise.all`. Both complete, neither starves the other, and the chunk-1 first packet's PTS is within ±1 s of `chunkStartSeconds` (the [chunk PTS contract](../Streaming/02-Chunk-Pipeline-Invariants.md#1-chunk-pts-contract--raw-tfdt--mode--segments--per-chunk-timestampoffset) — the client's `BufferManager.setTimestampOffset(chunkStartS)` maps raw `tfdt`-relative segments to source-time; without it, chunk-1 PTS would be ~0).

For 4K resolution on hosts with a working iGPU:

- **No software fallback** — every `transcode.job` span for a 4K job must NOT contain a `transcode_fallback_to_software` event AND its `hwaccel` attribute must NOT be `"software"`. Software 4K encode stalls continuously; treating any fallback as a UX regression is the [encoder edge-case test policy](02-Encoder-Edge-Case-Policy.md).

For 1080p / 240p the assertion is downgraded to "encoding succeeded" — software fallback at lower resolutions is acceptable.

## Test infrastructure

Three modules under `server/src/test/`:

| Module | Role |
|---|---|
| `fixtures/media.ts` | Per-fixture descriptors: filename, isHdr, testResolutions, chunkStartTimes, chunkDurationS. Add a new fixture by appending to `ALL_FIXTURES`. |
| `encodeHarness.ts` | `resolveFixturesOrSkip()` (returns null when env var unset), `setupChunkerForTest()` (calls production `detectHwAccel`), `runChunk()` (wraps `startTranscodeJob` and bumps `job.connections` to defeat the 30 s orphan timer), `waitForCompletion()`, `firstPacketPts()` (concatenates init+segment_0000 and ffprobes). |
| `traceCapture.ts` | In-memory `TracerProvider` swap so tests can drain `transcode.job` spans. See [`00-Side-Effects-Policy.md`](00-Side-Effects-Policy.md) § "Trace context capture" for why the global provider replacement uses `trace.disable()` first. |

The test file: `server/src/services/__tests__/chunker.encode.test.ts`. Skipped wholesale when fixtures resolve to null.

## GPU detection — reuses production logic

The 4K-no-fallback gate uses the production `detectHwAccel(ffmpegPath, mode)` from `server/src/services/hwAccel.ts`. Two caveats baked into the harness:

- **`detectHwAccel` is module-globally memoised** — first call wins, subsequent calls return the cache. Harness calls it once in setup.
- **`detectHwAccel(_, "auto")` is fatal on probe failure** — calls `process.exit(1)` (kills the test runner) if VAAPI probe fails on Linux, or always on non-Linux. The harness pre-flights with `process.platform === "linux" && existsSync("/dev/dri/renderD128")` before passing `"auto"`; otherwise passes `"off"` for a clean `{ kind: "software" }` instead of a process exit.

Pre-flight is a process-exit guard, not the HW discriminant. The discriminant for the 4K-no-fallback assertion is `hwConfig.kind !== "software"` — the same field production reads.

## Adding a new fixture

1. Trim a representative clip of the source (or use the full file) and either drop it in `XSTREAM_TEST_MEDIA_DIR` or symlink with the expected basename.
2. Add a `MediaFixture` entry to `server/src/test/fixtures/media.ts` documenting the source's distinguishing properties (HDR? unusual codec? uneven aspect ratio?) so the next person knows why this fixture exists.
3. If the fixture should run at a new resolution combo or chunk-start offset, set `testResolutions` and `chunkStartTimes` accordingly.

See the [encoder edge-case test policy](02-Encoder-Edge-Case-Policy.md) for when adding a fixture is required vs optional.

## Running locally

```sh
# All tests (encode tests skip when env var unset)
cd server && bun test

# Encode tests only, with fixtures
XSTREAM_TEST_MEDIA_DIR=/path/to/movies bun test src/services/__tests__/chunker.encode.test.ts

# Filter to one fixture × one resolution (handy when iterating on a fix)
XSTREAM_TEST_MEDIA_DIR=/path/to/movies bun test -t "Furiosa.*4k"
```
