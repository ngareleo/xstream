# xstream — 30-Second Orientation

**This is the shared orientation every agent should read before starting a task in xstream.** It is the shortest coherent picture of the project. Everything below links into the deeper knowledge base — if you need more, route through the `architect` subagent or read the concept folder's `README.md`.

## What is xstream

High-resolution media streaming. A Rust server transcodes local video files to fMP4 segments with ffmpeg and streams them over HTTP as length-prefixed binary chunks; a React client renders them via Media Source Extensions. The Rust server runs **in-process** inside a Tauri desktop bundle for Linux, Windows, and macOS — see [`architecture/Deployment/`](architecture/Deployment/README.md). Current phase: 4K / 1080p playback with a full 240p → 4K resolution ladder.

## Stack

| Layer | Technology |
|---|---|
| Server runtime | Rust + tokio |
| HTTP + WS | `axum` + `tower` + `async-graphql` (`graphql-ws` subprotocol) |
| DB | `rusqlite` (bundled, WAL mode, foreign keys ON) — raw SQL only, no ORM |
| Video | `tokio::process::Command` spawning the bundled jellyfin-ffmpeg (`scripts/ffmpeg-manifest.json`, per-platform SHA256). VAAPI on Linux; macOS (VideoToolbox) and Windows (D3D11VA / QSV) paths stubbed. |
| Desktop shell | Tauri v2 — system WebView (WebKit on macOS / Linux, WebView2 on Windows); the Rust server runs as a tokio task in the same process |
| Client bundler | Rsbuild (run via `bun run`) |
| UI | React 18 + React Router v6 |
| Styles | `@griffel/react` — atomic CSS-in-JS |
| Data fetching | `react-relay` + `relay-compiler` |
| Events | `@nova/react` + `@nova/types` |

## Load-bearing invariants (the "never violate" shortlist)

Full list: [`code-style/Invariants/00-Never-Violate.md`](code-style/Invariants/00-Never-Violate.md).

1. **All SQL goes through `server-rust/src/db/queries/`** — no ad-hoc `prepare()` elsewhere.
2. **Init segment is the first frame on every new stream.** Broken order = decoder can't initialise.
3. **`SourceBuffer.appendBuffer()` must never run while `updating === true`.** Always `await waitForUpdateEnd()` first.
4. **`MediaSource.endOfStream()` fires when streaming finishes.** Skipping it stalls `<video>`.
5. **`content_fingerprint` is `NOT NULL`.** Old DBs without it must be deleted and regenerated.
6. **Relay global IDs must be URL-encoded in route links.** They're base64 and contain `/`, `+`, `=`.
7. **One resolver owns each GraphQL field.** async-graphql merges via a single `Object` impl per type; duplicate field methods will not compile, but type-name collisions across the schema would silently overwrite.
8. **Playback-path resolvers return a typed union for known failure modes — never throw a plain error.** `start_transcode` returns `StartTranscodeResult = TranscodeJob | PlaybackError`. Mid-job failures must set `ActiveJob.error_code` before notifying subscribers. See invariant #11 in `code-style/Invariants/00-Never-Violate.md`.
9. **The network stream is a pull sink, not a push source.** `routes/stream.rs` uses `axum::Body::from_stream` over an `mpsc::Receiver` — one segment per consumer demand, no internal loop. See invariant #12 in `code-style/Invariants/00-Never-Violate.md`.
10. **Relay operation names must start with the containing filename.** The relay-compiler enforces this; violating it **silently halts project-wide artifact generation** while appearing to pass lint. See invariant #14 in `code-style/Invariants/00-Never-Violate.md`.
11. **Never swallow errors.** No `expect`/`unwrap`/silent-discard in production Rust code; every fallible path returns `Result`; mutex poisoning is a typed error; resolver errors land in Seq with the request TraceId via the `ErrorLogger` async-graphql extension. See invariant #15 in `code-style/Invariants/00-Never-Violate.md`. Mirrored at the migration level by *tests travel with the port* — the unhappy path is part of the spec at compile/test time AND at runtime.

## Streaming pipeline in one paragraph

The client drives transcoding via a **per-session chunk-duration ramp** (`clientConfig.playback.chunkRampS: [10, 15, 20, 30, 45, 60]` seconds) followed by steady-state chunks (`clientConfig.playback.chunkSteadyStateS: 60` seconds). The ramp resets at every anchor point where the user effectively starts a fresh playhead — session start, seek, MSE-detached recovery, resolution swap — so seeks enjoy the same fast first frame as initial play. The ramp model replaces the old fixed 300 s grid + special 30 s first-chunk logic. A new **page-mount prewarm** pattern cuts ffmpeg cold-start latency: when `VideoPlayer` mounts, it fires a side-effect `startTranscode(videoId, nativeMax, 0, 10)` mutation whose errors are swallowed. The user spends 1–5 seconds viewing the poster, during which ffmpeg encodes chunk 0 silently. When the user clicks Play, the click-path mutation cache-hits if resolution is unchanged; ffmpeg is already producing segments on disk. The server's `orphan_timeout_ms` (30 s) kills unclaimed warmup jobs automatically — no regression if the user navigates away or toggles resolution. All client tunables live in `clientConfig` — see [`client/Config/00-ClientConfig.md`](client/Config/00-ClientConfig.md). For each chunk, `BufferManager.init` and the `startTranscode(videoId, resolution, start, end)` mutation fire **in parallel** (via `Promise.all`) so ffmpeg overlaps MSE handshake. The mutation returns `StartTranscodeResult` (either a `TranscodeJob` on success or a typed `PlaybackError`) → Rust server spawns ffmpeg producing fMP4 segments into `tmp/segments-rust/<jobId>/` (dev) or `app_cache_dir/segments/<jobId>/` (Tauri). Client opens `GET /stream/<jobId>` — server sends `init.mp4` (4-byte BE length + bytes), then each `segment_NNNN.m4s` as it appears. Stream endpoint uses `axum::Body::from_stream` over `mpsc::Receiver` — demand-driven, no internal loop or hidden queue. Client's `BufferManager` appends into MSE `SourceBuffer` and fires a RAF prefetch for the next chunk immediately (since 10 s first chunk means `chunkEnd − 90 s` is negative), opening lookahead stream so chunks stitch seamlessly. `chunkPipeline.drainAndDispatch` awaits `buffer.waitIfPaused()` to cooperate with backpressure (`clientConfig.buffer.forwardTargetS: 60s` / resume `20s`); server's 180 s idle timeout is intentional safety. `startupBufferS` is **uniform 2 seconds** across all resolutions — the ramp's 10 s first chunk provides an 8 s safety margin against post-play decoder stalls. If Chrome detaches the `SourceBuffer` (memory pressure), `PlaybackController` tears down and rebuilds at `videoEl.currentTime` (seek-anchored; budget: 3 attempts/session). Four scenarios (initial / backpressure / seek / resolution switch) have dedicated sequence diagrams in [`architecture/Streaming/01-Playback-Scenarios.md`](architecture/Streaming/01-Playback-Scenarios.md). Three load-bearing chunk-pipeline invariants — PTS contract (chunk-relative `tfdt` + `mode = "segments"` + per-chunk `sb.timestampOffset = chunkStartS`), per-chunk init re-append, lookahead segment buffering — live in [`architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](architecture/Streaming/02-Chunk-Pipeline-Invariants.md); violating any one silently breaks the buffered-range timeline. The pull contract and MSE recovery are in [`architecture/Streaming/04-Demand-Driven-Streaming.md`](architecture/Streaming/04-Demand-Driven-Streaming.md).

## Library, metadata, and assets

Two **logical entities** sit above the file layer (`videos`): `films` (movies) and `shows` (TV series). Each has its own dedup contract — pre-OMDb `parsed_title_key` plus post-OMDb `imdb_id` (canonical) — so two libraries indexing the same content fold into one logical row, and an OMDb match arriving late merges duplicates rather than splitting them. TV adds a second dedup axis at the episode-file level: `videos` rows joined back through `(show_id, show_season, show_episode)` so the same episode in two libraries shows up as `Episode.copies`. The synthetic show-Video pattern from the prerelease design is gone — series identity lives in `shows`, not `videos`. See [`architecture/Library-Scan/02-Film-Entity.md`](architecture/Library-Scan/02-Film-Entity.md), [`03-Show-Entity.md`](architecture/Library-Scan/03-Show-Entity.md).

A **profile-availability probe** runs alongside the scanner — every `availability_interval_ms` it stats each library path and writes `libraries.status`/`last_seen_at`. The scanner skips offline libraries (rows stay catalogued for browse; only playback is blocked) and re-kicks a one-shot scan on offline→online. Same-origin UI surfaces this as a status pill on `ProfileRow`. See [`architecture/Library-Scan/04-Profile-Availability.md`](architecture/Library-Scan/04-Profile-Availability.md).

A **local poster cache** mirrors OMDb posters into `app_cache_dir/posters/` (Tauri) / `tmp/poster-cache/` (dev). A periodic worker downloads URLs into hash-addressed files; the GraphQL `posterUrl` field rewrites to a same-origin `/poster/<basename>` URL so the app works offline once metadata has been matched and stops re-hitting the OMDb CDN. See [`architecture/Library-Scan/05-Poster-Caching.md`](architecture/Library-Scan/05-Poster-Caching.md).

## Engineering principles (the meta-rules)

Full rationale: [`code-style/Principles/`](code-style/Principles/README.md). The four rules:

1. **Fix root causes, not symptoms.** When a bug's cause is unknown, the plan starts with *find the cause*. Reject symptom-masks (bump the constant, force the worse fallback, special-case branch). [`code-style/Principles/00-Fix-Root-Causes.md`](code-style/Principles/00-Fix-Root-Causes.md).
2. **Don't weaken safety timeouts as a bug fix.** Timers encode intent; if a legit case looks like an abandonment, the structure is wrong, not the timer. [`code-style/Principles/01-Safety-Timeouts.md`](code-style/Principles/01-Safety-Timeouts.md).
3. **Never swallow errors.** No `expect`/`unwrap`/silent-discard in production Rust; every fallible op returns `Result`; resolver errors hit Seq with the request TraceId. [`code-style/Invariants/00-Never-Violate.md`](code-style/Invariants/00-Never-Violate.md) §14.
4. **Tests travel with the port.** When porting a subsystem, the implementation can be a rewrite; the assertions are the contract. [`code-style/Testing/00-Tests-Travel-With-The-Port.md`](code-style/Testing/00-Tests-Travel-With-The-Port.md).

## Code style headlines

- [`code-style/README.md`](code-style/README.md) — full per-language conventions tree (Rust, TS/React, SQL).
- [`code-style/Naming/00-Conventions.md`](code-style/Naming/00-Conventions.md) — PascalCase for React components + satellites; camelCase for TS; snake_case for Rust.
- [`code-style/Server-Conventions/00-Patterns.md`](code-style/Server-Conventions/00-Patterns.md) — explicit resolver return types, presenter layer, ffmpeg path resolution is process-global.
- [`code-style/Client-Conventions/00-Patterns.md`](code-style/Client-Conventions/00-Patterns.md) — `useLazyLoadQuery` in pages only (see exception for section-tabs), fragment-per-component, Griffel only for styles, Nova eventing for user actions (no callback props); mutations express cache freshness declaratively via destination-page `fetchPolicy`, never via imperative `updater` callbacks.
- [`code-style/Anti-Patterns/00-What-Not-To-Do.md`](code-style/Anti-Patterns/00-What-Not-To-Do.md) — no ORM, no ad-hoc SQL, no non-null assertions, no literal `className` strings, no duplicate resolvers.
- [`code-style/Tooling/00-Linting-And-Formatting.md`](code-style/Tooling/00-Linting-And-Formatting.md) — `cargo clippy`/`cargo fmt` (Rust); ESLint v10 + Prettier v3 (TS/React); raw + reviewed-by-hand SQL; Husky + lint-staged on TS/TSX only.
- Observability rules live with the spans they govern: [`architecture/Observability/01-Logging-Policy.md`](architecture/Observability/01-Logging-Policy.md).

## Tree navigation

| If you need… | Go to |
|---|---|
| System overview + component tables | [`architecture/00-System-Overview.md`](architecture/00-System-Overview.md) |
| Streaming protocol + playback scenarios + chunk-pipeline invariants + playback subsystems | [`architecture/Streaming/`](architecture/Streaming/README.md) |
| Observability (spans, logging, Seq) | [`architecture/Observability/`](architecture/Observability/README.md) |
| Relay / GraphQL contract | [`architecture/Relay/`](architecture/Relay/README.md) |
| Test side-effects policy + encode-pipeline tests + encoder edge-case policy | [`architecture/Testing/`](architecture/Testing/README.md) |
| Tauri bundling, code-signing, auto-updates, ffmpeg distribution | [`architecture/Deployment/`](architecture/Deployment/README.md) |
| Server config, ladder, schema, DB, HW-accel, ffmpeg / MSE caveats | [`server/`](server/README.md) |
| Client feature flags, debugging playbooks | [`client/`](client/README.md) |
| Invariants, naming, conventions, anti-patterns, testing policy | [`code-style/`](code-style/README.md) |
| UI design spec (tokens, grid, typography) | [`design/`](design/README.md) |
| Per-component design specs (style, layout, behaviour) | [`client/Components/`](client/Components/README.md) |
| Outstanding redesign work (working document) | [`release/`](release/README.md) |
| Product spec, customers, roadmap | [`product/`](product/README.md) |

**For anything deeper than this page, ask the `architect` subagent — it owns the knowledge base and maintains this file.** When you modify code or docs, notify architect with a short change summary before closing the task so the tree stays coherent.

---

_Owned by the `architect` subagent; regenerated mechanically by the `groom-knowledge-base` skill._
