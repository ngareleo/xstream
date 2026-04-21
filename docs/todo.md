# xstream — Future Optimizations

## Streaming / Playback

- [ ] **SEEK-001** Seek reuse: when seeking into a time region that is already fully buffered (or partially buffered by an in-progress chunk stream), reuse the existing segments instead of flushing and restarting the stream at the chunk boundary. Currently seek always flushes the SourceBuffer and starts a new chunk job. Optimization: detect whether `video.buffered` already covers the seek target and skip the flush + re-fetch if so.

- [ ] **CHUNK-001** Adaptive chunk duration: calibrate `CHUNK_DURATION_S` per resolution so encoding latency stays roughly constant. At 4K a 300s chunk can take 30–60s of encode time before the first segment arrives; 90s chunks would be ready in ~10–20s. At 240p, 300s chunks finish in < 5s. Consider `CHUNK_DURATION_BY_RES` table rather than a single constant.

- [ ] **INIT-001** Init segment deduplication: for the same video + resolution, the init segment (`init.mp4`) is always identical across chunk jobs. Cache it once at `tmp/segments/<fingerprint>-<resolution>/init.mp4` and symlink from each chunk job directory. Saves the ffprobe + init-write overhead for chunks 2+.

- [ ] **HEARTBEAT-001** Server-side heartbeat: `req.signal.aborted` only fires on clean TCP disconnect. Frozen/sleeping browser tabs hold sockets open indefinitely. Add a client-side `setInterval` pinging `GET /stream/:jobId/ping` every 5s; server resets `lastPingAt` per job. A background timer kills any job whose `lastPingAt` is older than 15s and `connections > 0`. Most reliable runaway-process defense.

- [ ] **STREAM-001** Stream from partial segments: currently `stream.ts` polls 100ms waiting for the fs watcher to flag a segment ready. With `ReadableStream` + `fs.createReadStream` we could start sending a partially-written `.m4s` as soon as its header is available — reducing per-segment latency. Significant complexity; defer until chunk model is stable.

## Cache / Storage

- [ ] **CACHE-001** Disk LRU eviction: `diskCache.ts` has `pruneLruJobs()` and `server/src/db/queries/jobs.ts` has `getLruJobs()` / `markJobEvicted()` fully implemented. What remains: wire `pruneLruJobs()` into `server/src/index.ts` (on startup, after `jobRestore`) and into the `runFfmpeg` `.on("end")` callback in `chunker.ts` (after each job completes).

- [ ] **CACHE-002** Expose cache stats in Settings: show total disk usage and quota with a "Clear cache" button. Uses `getCacheSizeBytes()` from `diskCache.ts`.

## Observability (Release)

These items require the OTel metrics SDK (`MeterProvider`) which is not yet wired up. Complete after the dev log/trace baseline is stable.

- [ ] **OBS-001** Client buffer rate metrics: stall duration and buffer-underrun count per playback session. Instrument `useChunkedPlayback` buffering events with `Histogram` and `Counter` instruments from `@opentelemetry/api`.

- [ ] **OBS-002** Error rate breakdown and classification: track error counts by component (`mse`, `network`, `graphql`, `transcode`) using OTel `Counter` with a `component` attribute. Distinguish transient (retried) vs. terminal errors.

- [ ] **OBS-003** Usage metrics: concurrent stream count, resolution distribution (which resolutions are most used), and session duration. Export as OTel `UpDownCounter` and `Histogram`.

- [ ] **OBS-004** OTel metrics SDK wiring: add `MeterProvider` with a `BatchMetricExporter` + `PeriodicExportingMetricReader` to both `server/src/telemetry.ts` and `client/src/telemetry.ts`. The `@opentelemetry/sdk-metrics` package is not yet installed.

## Settings / UI

- [ ] **SETTINGS-001** User-configurable forward buffer: `BufferManager` now accepts `forwardTargetSeconds` but the Settings UI for it (key: `"forwardBufferTargetSeconds"`) is not yet wired up. Add a numeric input to the Settings page (new "Playback" tab), read via Relay, persist via `setSetting` mutation.

- [ ] **PLAYBACK-001** Concurrent stream limit UI: currently throws `"Too many concurrent streams"` as an error overlay. Consider a friendlier modal that explains the limit (3 tabs) and links to the Settings page.

- [ ] **FLAGS-001** Centralised release-time feature-flag controls: today flags persist per-user in `user_settings` only, so an operator cannot soft-launch a flag to everyone with a single toggle. Add a server-side `feature_flags` table with a precedence model (global override > user setting > `FLAG_REGISTRY.defaultValue`) and an admin UI to flip the global override. `getFlag` / `getEffectiveBufferConfig` should read the resolved value without caller changes. See `docs/feature-flags.md` for the current architecture.
