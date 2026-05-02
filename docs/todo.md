# xstream — Future Optimizations

## Streaming / Playback

- [ ] **SEEK-001** Seek reuse: when seeking into a time region that is already fully buffered (or partially buffered by an in-progress chunk stream), reuse the existing segments instead of flushing and restarting the stream at the chunk boundary. Currently seek always flushes the SourceBuffer and starts a new chunk job. Optimization: detect whether `video.buffered` already covers the seek target and skip the flush + re-fetch if so.

- [ ] **CHUNK-001** Adaptive chunk duration: calibrate `clientConfig.playback.chunkDurationS` per resolution so encoding latency stays roughly constant. At 4K a 300s chunk can take 30–60s of encode time before the first segment arrives; 90s chunks would be ready in ~10–20s. At 240p, 300s chunks finish in < 5s. Consider replacing the scalar with a `Record<Resolution, number>` table (e.g. `chunkDurationByResS`) under `clientConfig.playback`. **Also relevant to OBS-STDERR-001**: if per-resolution chunk durations are used, the VAAPI `-ss 0 -t SHORT` workaround can be lifted for 4K (it would always use a longer first chunk naturally) without losing the small-window win for lower resolutions.

- [ ] **INIT-001** Init segment deduplication: for the same video + resolution, the init segment (`init.mp4`) is always identical across chunk jobs. Cache it once at `tmp/segments-rust/<fingerprint>-<resolution>/init.mp4` and symlink from each chunk job directory. Saves the ffprobe + init-write overhead for chunks 2+.

- [ ] **HEARTBEAT-001** Server-side heartbeat: axum's request cancellation only fires on clean TCP disconnect. Frozen/sleeping browser tabs hold sockets open indefinitely. Add a client-side `setInterval` pinging `GET /stream/:jobId/ping` every 5s; server resets `last_ping_at` per job. A background timer kills any job whose `last_ping_at` is older than 15s and `connections > 0`. Most reliable runaway-process defense.

- [ ] **STREAM-001** Stream from partial segments: today the chunker waits for fsync before flagging a segment ready. With buffered file reads we could start sending a partially-written `.m4s` as soon as its header is available — reducing per-segment latency. Significant complexity; defer until chunk model is stable.

- [ ] **OBS-STDERR-001** Capture ffmpeg stderr in `transcode_complete` span event: today `stderr_tail` is only attached to cascade-failure events (`transcode_fallback_to_software` etc.), not to the final `transcode_complete` event. Add it to `transcode_complete` too so silent failures (`segment_count: 0`, exit code 0) are diagnosable without a separate stderr stream. Secondary benefit: detect `segment_count == 0` after a clean exit and force the cascade to fall through to the next tier (structural fix for the VAAPI HDR `-ss 0 -t SHORT` silent-zero-output bug). See `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md` § "VAAPI silent-success failures".

## Cache / Storage

- [ ] **CACHE-001** Disk LRU eviction: the Rust server has LRU eviction logic in `server-rust/src/services/`. What remains: wire the startup eviction and the per-job cleanup into the chunker's job-complete handler.

- [ ] **CACHE-002** Expose cache stats in Settings: show total disk usage and quota with a "Clear cache" button. Uses `getCacheSizeBytes()` from `diskCache.ts`.

## Observability (Release)

These items require the OTel metrics SDK (`MeterProvider`) which is not yet wired up. Complete after the dev log/trace baseline is stable.

- [ ] **OBS-001** Client buffer rate metrics: stall duration and buffer-underrun count per playback session. Instrument `useChunkedPlayback` buffering events with `Histogram` and `Counter` instruments from `@opentelemetry/api`.

- [ ] **OBS-002** Error rate breakdown and classification: track error counts by component (`mse`, `network`, `graphql`, `transcode`) using OTel `Counter` with a `component` attribute. Distinguish transient (retried) vs. terminal errors.

- [ ] **OBS-003** Usage metrics: concurrent stream count, resolution distribution (which resolutions are most used), and session duration. Export as OTel `UpDownCounter` and `Histogram`.

- [ ] **OBS-004** OTel metrics SDK wiring: add `MeterProvider` with a `BatchMetricExporter` + `PeriodicExportingMetricReader` to both `server-rust/src/telemetry.rs` and `client/src/telemetry.ts`. The `@opentelemetry/sdk-metrics` package is not yet installed in the client.

## Settings / UI

- [ ] **SETTINGS-001** User-configurable forward buffer: `BufferManager` now accepts `forwardTargetSeconds` but the Settings UI for it (key: `"forwardBufferTargetSeconds"`) is not yet wired up. Add a numeric input to the Settings page (new "Playback" tab), read via Relay, persist via `setSetting` mutation.

- [ ] **PLAYBACK-001** Concurrent stream limit UI: currently throws `"Too many concurrent streams"` as an error overlay. Consider a friendlier modal that explains the limit (3 tabs) and links to the Settings page.

- [ ] **FLAGS-001** Centralised release-time feature-flag controls: today flags persist per-user in `user_settings` only, so an operator cannot soft-launch a flag to everyone with a single toggle. Add a server-side `feature_flags` table with a precedence model (global override > user setting > `FLAG_REGISTRY.defaultValue`) and an admin UI to flip the global override. `getFlag` / `getEffectiveBufferConfig` should read the resolved value without caller changes. See `docs/client/Feature-Flags/README.md` for the current architecture.

## Server roadmap

- [ ] **OMDB-002** Round out the OMDb surface area: confirm the `match_video` mutation and the `search_omdb` query are wired through `services::omdb::OmdbClient` end-to-end (ID lookup + free-text search), with the same retry / no-API-key fallback behaviour as `auto_match_library`.
