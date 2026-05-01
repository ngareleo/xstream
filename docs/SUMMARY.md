# xstream — 30-Second Orientation

**This is the shared orientation every agent should read before starting a task in xstream.** It is the shortest coherent picture of the project. Everything below links into the deeper knowledge base — if you need more, route through the `architect` subagent or read the concept folder's `README.md`.

## What is xstream

High-resolution web streaming. A Bun server transcodes local video files to fMP4 segments with ffmpeg and streams them over HTTP as length-prefixed binary chunks; a React client renders them via Media Source Extensions. Current phase: 4K / 1080p playback with a full 240p → 4K resolution ladder. The Bun server is a **prototype** — a Rust rewrite shipping in a **Tauri desktop bundle** is the long-term target.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| HTTP + WS | `Bun.serve()` + `graphql-yoga` + `graphql-ws` |
| DB | `bun:sqlite` — raw SQL only, no ORM |
| Video | `fluent-ffmpeg` + pinned jellyfin-ffmpeg (`scripts/ffmpeg-manifest.json`, per-platform SHA256). VAAPI on Linux; macOS/Windows HW paths stubbed. |
| Client bundler | Rsbuild |
| UI | React 18 + React Router v6 |
| Styles | `@griffel/react` — atomic CSS-in-JS |
| Data fetching | `react-relay` + `relay-compiler` |
| Events | `@nova/react` + `@nova/types` |

## Load-bearing invariants (the "never violate" shortlist)

Full list: [`code-style/Invariants/00-Never-Violate.md`](code-style/Invariants/00-Never-Violate.md).

1. **All SQL goes through `server/src/db/queries/`** — no ad-hoc `prepare()` elsewhere.
2. **Init segment is the first frame on every new stream.** Broken order = decoder can't initialise.
3. **`SourceBuffer.appendBuffer()` must never run while `updating === true`.** Always `await waitForUpdateEnd()` first.
4. **`MediaSource.endOfStream()` fires when streaming finishes.** Skipping it stalls `<video>`.
5. **`content_fingerprint` is `NOT NULL`.** Old DBs without it must be deleted and regenerated.
6. **Relay global IDs must be URL-encoded in route links.** They're base64 and contain `/`, `+`, `=`.
7. **One resolver owns each GraphQL field.** `@graphql-tools/schema` merges via `Object.assign`; duplicates silently overwrite.
8. **Playback-path resolvers return a typed union for known failure modes — never throw a plain `Error`.** `startTranscode` returns `StartTranscodeResult = TranscodeJob | PlaybackError`. Mid-job failures must set `ActiveJob.errorCode` before `notifySubscribers`. See invariant #11 in `code-style/Invariants/00-Never-Violate.md`.
9. **The network stream is a pull sink, not a push source.** `stream.ts` uses `new ReadableStream({ pull(controller) })` — one segment per pull call, no internal loop. This translates 1:1 to `axum::Body::from_stream` in the Rust rewrite. See invariant #12 in `code-style/Invariants/00-Never-Violate.md`.
10. **Never swallow errors.** In Rust: no `expect`/`unwrap`/silent-discard in production code; every fallible path returns `Result`; mutex poisoning is a typed error; resolver errors land in Seq with the request TraceId via the `ErrorLogger` async-graphql extension. See invariant #14 in `code-style/Invariants/00-Never-Violate.md`. Mirrored at the migration level by *tests travel with the port* — the unhappy path is part of the spec at compile/test time AND at runtime.

## Streaming pipeline in one paragraph

The client drives transcoding in **300-second chunks** (steady-state), with a shorter **30-second first chunk** (`clientConfig.playback.firstChunkDurationS`) after Play and after a Seek to cut time-to-first-frame. **Exception:** when `startS === 0` (cold start, MSE recovery at `currentTime < 300`, or seek-to-0) the controller forces `clientConfig.playback.chunkDurationS` (300 s) to avoid a VAAPI HDR silent-zero-output bug (`-ss 0 -t 30` exits cleanly with `segment_count: 0`); see `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md` § "VAAPI silent-success failures". All client tunables now live in a single `clientConfig` object — see [`client/Config/00-ClientConfig.md`](client/Config/00-ClientConfig.md). For each chunk, `BufferManager.init` and the `startTranscode(videoId, resolution, start, end)` mutation fire **in parallel** at boot (via `Promise.all`) so ffmpeg's cold-start overlaps the MSE `sourceopen` handshake. The mutation returns `StartTranscodeResult` (either a `TranscodeJob` on success or a typed `PlaybackError` on known failure) → server spawns a dedicated ffmpeg process producing fMP4 segments into `tmp/segments/<jobId>/`. Client then opens `GET /stream/<jobId>` — server sends `init.mp4` first (4-byte BE length + bytes), then each `segment_NNNN.m4s` as it appears. The stream endpoint uses `new ReadableStream({ pull(controller) })` — one segment per pull call, demand-driven with no internal loop or hidden queue. Client's `BufferManager` queues-and-appends segments into the MSE `SourceBuffer`. Because the first chunk is only 30 s, a RAF prefetch fires the *next* chunk's mutation almost immediately (threshold: `chunkEnd − 90 s`, which is negative on the first chunk) and **opens its stream immediately** (lookahead slot of `ChunkPipeline`), so chunks stitch seamlessly. `chunkPipeline.drainAndDispatch` awaits `buffer.waitIfPaused()` between iterations to cooperate with backpressure (`clientConfig.buffer.forwardTargetS: 60s` / resume `20s`); the server's 180 s idle timeout is an intentional safety — never weaken it. If Chrome silently detaches the `SourceBuffer` under memory pressure or fires `endOfStream(decode_error)` from the chunk demuxer, `PlaybackController` tears down and rebuilds the MSE + pipeline at `videoEl.currentTime` directly (seek-anchored — same rationale as the seek path; budget: 3 attempts/session). Four scenarios (initial / backpressure / seek / resolution switch) have dedicated sequence diagrams in [`architecture/Streaming/01-Playback-Scenarios.md`](architecture/Streaming/01-Playback-Scenarios.md). Three load-bearing chunk-pipeline invariants — PTS contract (chunk-relative `tfdt` + `mode = "segments"` + per-chunk `sb.timestampOffset = chunkStartS`), per-chunk init re-append, lookahead segment buffering — live in [`architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](architecture/Streaming/02-Chunk-Pipeline-Invariants.md); violating any one silently breaks the buffered-range timeline. The pull contract and MSE recovery are in [`architecture/Streaming/04-Demand-Driven-Streaming.md`](architecture/Streaming/04-Demand-Driven-Streaming.md).

## Code style headlines

- [`code-style/Naming/00-Conventions.md`](code-style/Naming/00-Conventions.md) — PascalCase for React components + satellites; camelCase for everything else.
- [`code-style/Server-Conventions/00-Patterns.md`](code-style/Server-Conventions/00-Patterns.md) — explicit resolver return types, presenter layer, `setFfmpegPath` is module-global.
- [`code-style/Client-Conventions/00-Patterns.md`](code-style/Client-Conventions/00-Patterns.md) — `useLazyLoadQuery` in pages only, fragment-per-component, Griffel only for styles, Nova eventing for user actions (no callback props).
- [`code-style/Anti-Patterns/00-What-Not-To-Do.md`](code-style/Anti-Patterns/00-What-Not-To-Do.md) — no ORM, no ad-hoc SQL, no non-null assertions, no literal `className` strings, no duplicate resolvers.
- Observability rules live with the spans they govern: [`architecture/Observability/01-Logging-Policy.md`](architecture/Observability/01-Logging-Policy.md).

## Tree navigation

| If you need… | Go to |
|---|---|
| System overview + component tables | [`architecture/00-System-Overview.md`](architecture/00-System-Overview.md) |
| Streaming protocol + playback scenarios + chunk-pipeline invariants + playback subsystems | [`architecture/Streaming/`](architecture/Streaming/README.md) |
| Observability (spans, logging, Seq) | [`architecture/Observability/`](architecture/Observability/README.md) |
| Relay / GraphQL contract | [`architecture/Relay/`](architecture/Relay/README.md) |
| Test side-effects policy + encode-pipeline tests + encoder edge-case policy | [`architecture/Testing/`](architecture/Testing/README.md) |
| Server config, ladder, schema, DB, HW-accel | [`server/`](server/README.md) |
| Client feature flags, debugging playbooks | [`client/`](client/README.md) |
| Invariants, naming, conventions, anti-patterns | [`code-style/`](code-style/README.md) |
| UI design spec | [`design/`](design/README.md) — split: Prerelease (Moran, frozen) and Release (Xstream, active) |
| Product spec, customers, roadmap | [`product/`](product/README.md) |
| Bun → Rust + Tauri rewrite playbook + cross-migration principles | [`migrations/`](migrations/README.md) |

**For anything deeper than this page, ask the `architect` subagent — it owns the knowledge base and maintains this file.** When you modify code or docs, notify architect with a short change summary before closing the task so the tree stays coherent.

---

## Rust migration status (live cursor)

- **Step 1 — GraphQL + Observability**: merged on `main` as PR #39. Originally shipped behind `useRustGraphQL`; renamed to `useRustBackend` in Step 2. Rust binds `localhost:3002`; Bun stays on `3001`.
- **Step 2 — Streaming**: merged on `main` as PR #41. Adds `server-rust/src/services/{chunker,ffmpeg_pool,ffmpeg_path,ffmpeg_file,hw_accel,active_job,job_store,kill_reason,cache_index,job_restore}.rs` and `routes/stream.rs`. The two backends are runtime-independent (no shared state), so the originally-planned two-flag design (`useRustGraphQL` + `useRustStreaming`) was collapsed into one `useRustBackend` that toggles GraphQL + `/stream/*` together — and the originally-planned shared DB (both opening `tmp/xstream.db`) was split into per-process DBs (Bun: `tmp/xstream.db`, Rust: `tmp/xstream-rust.db`) after testing showed deterministic content-addressed job-ids cross-contaminate when both backends write to the same `transcode_jobs` rows with different `segment_dir`s. Cache key shifted from job-id-only to structural tuple `(video_id, resolution, start_s, end_s)` for forward sharing. Segment dir also splits per-server: Bun keeps `tmp/segments/`, Rust uses `tmp/segments-rust/`. `AppContext` bundles all chunker dependencies. The chunker port skips `transcode_progress` periodic events and the `orphan_no_connection` / `max_encode_timeout` watchdog timers — surfaced in the PR for follow-up. Stale-segment-dir wipe added to `start_transcode` (Bug B fix — honors the contract from `job_restore.rs`).
- **Step 3 — Tauri Packaging**: in flight on `feat/rust-step3-tauri` (PR #43). New `src-tauri/` crate picks a free loopback port and spawns `xstream_server::run` in-process on the Tauri async runtime; webview receives the port via `webview.eval("window.__XSTREAM_SERVER_PORT__ = N")`. No Tauri IPC in the request path — `/graphql` and `/stream/*` stay HTTP. Bundled jellyfin-ffmpeg under `src-tauri/resources/ffmpeg/<platform>/`; new `linux-x64-portable` portable manifest entries added. Linux-only first (AppImage + deb). `bun run tauri:dev` / `tauri:build` commands live. **Still open before PR closes:** HW-accel probe softening (currently `HW_ACCEL=off` hard-coded), library picker UX, `useRustBackend` flag-removal sweep, macOS/Windows bundling, segment cache eviction, OTLP endpoint defaulting.
- **Step 4 — Release**: unstarted.

The full layer references and step playbook live at [`migrations/rust-rewrite/`](migrations/rust-rewrite/README.md). The architect should treat the Rust workspace as a peer of the Bun server, not a future state — both run concurrently during the cutover. The new `src-tauri/` crate is a third peer alongside `server-rust/` and `client/`.

---

_Last regenerated: 2026-05-01. Step 3 cursor added; Step 2 merged as PR #41 on main. Owned by the `architect` subagent; regenerated mechanically by the `groom-knowledge-base` skill._
