# xstream — Future Optimizations

## Streaming / Playback

- [ ] **SEEK-001** Seek reuse: when seeking into a time region that is already fully buffered (or partially buffered by an in-progress chunk stream), reuse the existing segments instead of flushing and restarting the stream at the chunk boundary. Currently seek always flushes the SourceBuffer and starts a new chunk job. Optimization: detect whether `video.buffered` already covers the seek target and skip the flush + re-fetch if so.

- [ ] **CHUNK-001** Per-resolution steady-state chunk calibration: the current ramp + steady-state model (`[10, 15, 20, 30, 45, 60]` ramp, `chunkSteadyStateS = 60`) was designed to minimize time-to-first-frame without special per-resolution tuning. After the ramp lands in production, gather latency traces to calibrate `chunkSteadyStateS` per resolution so encoding latency stays roughly constant. At 4K a 60 s steady-state chunk can take 30–60 s of encode time before the first segment arrives; longer chunks might be optimal. At 240p, 60 s chunks finish in ~5 s; could be shorter. Once calibrated, replace the scalar with a `Record<Resolution, number>` table (e.g. `chunkDurationByResS`) under `clientConfig.playback`. The ramp tail can stay uniform; it benefits all resolutions equally for seek responsiveness.

- [ ] **INIT-001** Init segment deduplication: for the same video + resolution, the init segment (`init.mp4`) is always identical across chunk jobs. Cache it once at `tmp/segments-rust/<fingerprint>-<resolution>/init.mp4` and symlink from each chunk job directory. Saves the ffprobe + init-write overhead for chunks 2+.

- [ ] **HEARTBEAT-001** Server-side heartbeat: axum's request cancellation only fires on clean TCP disconnect. Frozen/sleeping browser tabs hold sockets open indefinitely. Add a client-side `setInterval` pinging `GET /stream/:jobId/ping` every 5s; server resets `last_ping_at` per job. A background timer kills any job whose `last_ping_at` is older than 15s and `connections > 0`. Most reliable runaway-process defense.

- [ ] **STREAM-001** Stream from partial segments: today the chunker waits for fsync before flagging a segment ready. With buffered file reads we could start sending a partially-written `.m4s` as soon as its header is available — reducing per-segment latency. Significant complexity; defer until chunk model is stable.


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

## Show Entity + Profile Availability follow-ups

Logged when the Show entity, profile-availability probe, and pre-prod tech-debt cleanup landed (see `docs/architecture/Library-Scan/03-Show-Entity.md` + `04-Profile-Availability.md`). Each item is a clean-up that surfaced during the planning pass but was deferred to keep the bundle reviewable.

- [ ] **SHOW-WL-001** `addShowToWatchlist` mutation. The `watchlist_items` table is keyed on `film_id` only; shows have no parallel mutation path. Either (a) add `addShowToWatchlist` + a sibling `show_id` column with a CHECK to keep one of the two FKs non-null, or (b) make the watchlist polymorphic via a `WatchlistEntity = Film | Show` union. Dev DB watchlist is empty so deferral has no migration risk.

- [ ] **PROGRESS-001** Continue-watching / watched / queued split. `watchlist_items.progress_seconds` is a single scalar; it doesn't model "in progress vs queued vs watched". Episode-level progress for shows lives here too — currently every progress write goes against the Film, not the Episode.

- [ ] **EXTRA-001** Episode extras (`videos.role = 'extra'` for episodes). The `role` column is shape-ready but unused for TV. Once we ingest "behind the scenes" / "specials" alongside an episode file, hook them in via `role='extra'` so the picker can group them like movie extras.

- [ ] **TITLE-UNIFICATION-001** Polymorphic Title/MediaItem. Film and Show diverged into two parallel surfaces (entity, metadata table, GraphQL type). For features that don't care about the distinction (search, watchlist, recently-added), a `Title` interface or `MediaItem` union may simplify call sites. Not worth doing now; declared so we don't drift further apart unintentionally.

- [ ] **MEDIATYPE-001** `Library.mediaType` redundancy. With Films and Shows as canonical entities, `library.media_type` is mostly bookkeeping the scanner uses to pick a discovery path. Cleanup: derive media type from observed content (Films present → "movies"; Shows present → "tvShows") and treat the column as a hint, not a source of truth.

- [ ] **SHOW-SUGGEST-001** Suggestions for Shows. `pickSuggestions` runs against Films only ("you might also like"). The TV detail overlay has no equivalent rail.

- [ ] **EP-RECONCILE-001** Cross-library episode reconciliation. Two libraries indexing different subsets of a season produce a complete merged season tree (the Show has both libraries in `profiles`), but there's no UX to "play S01 entirely from library A; fall back to B for S02". Today the picker selects bestCopy per episode independently.

- [ ] **AVAIL-PICKER-001** Online/offline-aware bestCopy + picker UI. `Film.bestCopy` and `Episode.bestCopy` should prefer copies whose owning `Library.status = ONLINE`, falling back to offline only if no online copy exists. `FilmVariants` should render offline copies dimmed with a badge and disable the play CTA when the selected copy is offline. The data is in place; the resolver bias and the picker treatment are not.

## Poster cache follow-ups

Logged when `services/poster_cache.rs` and `routes/poster.rs` landed (`docs/architecture/Library-Scan/05-Poster-Caching.md`). Each is a worker refinement that didn't need to ship in the initial bundle.

- [ ] **POSTER-EVICT-001** Disk LRU eviction. The cache directory grows unbounded — every distinct OMDb poster URL ever scanned stays. Add a max-size knob (default e.g. 500 MB) and an LRU sweep based on access mtime. Mirror `services::cache_index` if its eviction logic is reusable.

- [ ] **POSTER-RETRY-001** Backoff on 404 / dead poster URLs. Today a permanently-404 URL retries every 15 s forever. Track per-URL failure counts in memory (or a `poster_failures` table) and cap retries (e.g. 3 attempts, then mark "give up" with a TTL).

- [ ] **POSTER-INVAL-001** Stale-cache invalidation when `poster_url` changes. Re-matching a video to a different IMDb id replaces `video_metadata.poster_url` but the upsert preserves the old `poster_local_path`. Either (a) track the URL the cache was downloaded from in a `poster_url_at_download` column and clear `poster_local_path` when they diverge, or (b) have the worker compare URL-vs-cached-hash on every cycle.

- [ ] **POSTER-FORMAT-001** Image format conversion. OMDb serves a mix of JPEG / PNG / WEBP / GIF. Consider downscaling on cache (e.g. ffmpeg → 600px wide JPEG) so the cache footprint shrinks and the client never has to resize a 2000×3000 source.

- [ ] **POSTER-CONCURRENCY-001** Adaptive concurrency limit. `MAX_CONCURRENCY = 4` is a guess. On a fast pipe it's underprovisioned; on a slow tethered hotspot it's too aggressive. Consider tying it to library size or making it a config knob.
