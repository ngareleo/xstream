# Architect Retrieval Index

Topic → file lookup used by the `architect` subagent. Each row points to **one** file — read that file, not the others.

Keep rows short (≤ ~120 chars). When adding a new topic file to `docs/`, add its row here in the same PR so retrieval stays accurate.

| Topic | Where |
|---|---|
| System overview, component tables | `docs/architecture/00-System-Overview.md` |
| Binary streaming protocol (framing, init segment, hysteresis) | `docs/architecture/Streaming/00-Protocol.md` |
| Playback scenarios (initial, backpressure, seek, resolution switch) | `docs/architecture/Streaming/01-Playback-Scenarios.md` |
| Chunk pipeline invariants (PTS contract, per-chunk re-init, lookahead segment buffering) | `docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md` |
| Playback subsystems (PlaybackTicker single-RAF, StallTracker, PlaybackTimeline drift) | `docs/architecture/Streaming/03-Playback-Subsystems.md` |
| Demand-driven streaming (pull contract, MSE detach recovery, Rust translation) | `docs/architecture/Streaming/04-Demand-Driven-Streaming.md` |
| Single-SourceBuffer ADR (why not multi-SB rotation; MSE_DETACHED, invariants, resolution-switch exception) | `docs/architecture/Streaming/05-Single-SourceBuffer-ADR.md` |
| ffmpeg pool (cap formula, dying-job exclusion, SIGKILL escalation, KillReason union, shutdown sweep) | `docs/architecture/Streaming/06-FfmpegPool.md` |
| Tests must leave the host as they found it — per-PID temp dir + orphan reaper | `docs/architecture/Testing/00-Side-Effects-Policy.md` |
| Encode-pipeline real-media tests (XSTREAM_TEST_MEDIA_DIR, encodeHarness, 4K-no-fallback assertion) | `docs/architecture/Testing/01-Encode-Pipeline-Tests.md` |
| Encoder edge-case test policy (every fix needs a fixture/assertion in the same PR) | `docs/architecture/Testing/02-Encoder-Edge-Case-Policy.md` |
| Relay / GraphQL fragment contract | `docs/architecture/Relay/00-Fragment-Contract.md` |
| OTel architecture (both sides, dev/prod backends) | `docs/architecture/Observability/00-Architecture.md` |
| Logging policy, trace-context threading | `docs/architecture/Observability/01-Logging-Policy.md` |
| Server spans (`stream.request`, `job.resolve`, `transcode.job`) | `docs/architecture/Observability/server/00-Spans.md` |
| Client spans (`playback.session`, `chunk.stream`, `buffer.backpressure`) | `docs/architecture/Observability/client/00-Spans.md` |
| Seq search filters | `docs/architecture/Observability/02-Searching-Seq.md` |
| Trace-first verification workflow (decide signal, add logs, query Seq; span.addEvent gotcha) | `docs/architecture/Observability/04-Verification-Workflow.md` |
| OTel env vars, switching backends, Seq API-key setup | `docs/architecture/Observability/03-Config-And-Backends.md` |
| Server boot sequence + graceful shutdown | `docs/architecture/Startup/00-Boot-And-Shutdown.md` |
| Library scanner pipeline | `docs/architecture/Library-Scan/00-Flow.md` |
| Rust + Tauri port plan, stable contracts | `docs/migrations/rust-rewrite/00-Rust-Tauri-Port.md` |
| Streaming layer migration (pull → axum, semaphore cap, content-addressed cache, per-consumer isolation) | `docs/migrations/rust-rewrite/01-Streaming-Layer.md` |
| Observability layer migration (OTel → tracing + opentelemetry-otlp, traceparent middleware, cross-peer flow) | `docs/migrations/rust-rewrite/02-Observability-Layer.md` |
| GraphQL layer migration (yoga + graphql-tools → async-graphql; SDL parity; typed-error union; subscription transport) | `docs/migrations/rust-rewrite/03-GraphQL-Layer.md` |
| Web server layer migration (Bun.serve → axum + tower, RequestContext middleware, configurable CORS/bind) | `docs/migrations/rust-rewrite/04-Web-Server-Layer.md` |
| Database layer migration (bun:sqlite → rusqlite bundled; WAL pragma; identity DB split for sharing) | `docs/migrations/rust-rewrite/05-Database-Layer.md` |
| File-handling layer migration (walkdir + notify, ffmpeg manifest pinning, content-addressed cache index, two-DB split) | `docs/migrations/rust-rewrite/06-File-Handling-Layer.md` |
| Bun → Rust synthesis (runtime model, concurrency primitives, idiom translation, crate picks, migration order) | `docs/migrations/rust-rewrite/07-Bun-To-Rust-Migration.md` |
| Tauri packaging (bundle layout, embedded server, bundled ffmpeg, Ed25519 self-hosted updates, code-signing, CI matrix) | `docs/migrations/rust-rewrite/08-Tauri-Packaging.md` |
| Tauri packaging internals (build pipeline, installed-app layout per OS, tauri-plugin-updater mechanics, Electron mental-model corrections) | `docs/migrations/rust-rewrite/09-Tauri-Packaging-Internals.md` |
| Rust+Tauri release-journey playbook (4-step execution shape, parallel-track callout, out-of-scope list) | `docs/migrations/rust-rewrite/Plan/00-README.md` |
| Step 1 — Rust GraphQL + Observability cutover (`useRustBackend` flag, side-by-side servers, player page known-broken when on at Step-1 state) | `docs/migrations/rust-rewrite/Plan/01-GraphQL-And-Observability.md` |
| Step 2 — Rust streaming cutover (single `useRustBackend` flag also routes `/stream/*`, framing preserved, sharing constraints, segment-dir wipe) | `docs/migrations/rust-rewrite/Plan/02-Streaming.md` |
| Step 3 — Tauri packaging step (embedded server, bundled jellyfin-ffmpeg, flag removal sweep, HW-accel softening) — **in flight PR #43** | `docs/migrations/rust-rewrite/Plan/03-Tauri-Packaging.md` |
| src-tauri/ crate — ServerConfig, in-process loopback, port injection, resource layout, ffmpeg_path resolver | `docs/migrations/rust-rewrite/Plan/03-Tauri-Packaging.md` |
| Step 4 — Release plumbing + first beta (per-OS signing, Ed25519 updates, CI release matrix, soak group) | `docs/migrations/rust-rewrite/Plan/04-Release.md` |
| Peer-to-peer streaming model (passthrough, Ed25519 invite tokens, content-addressed cache reuse, cross-peer traceparent, invariants) | `docs/architecture/Sharing/00-Peer-Streaming.md` |
| Interim desktop-shell decision (Electron + Bun-as-sidecar; architectural surface, caveats, distribution, updates, CI, invariants) | `docs/architecture/Deployment/00-Interim-Desktop-Shell.md` |
| Interim deployment decisions (HW-accel options + recommendation, Bun packaging, library picker, signing, channels) | `docs/architecture/Deployment/01-Decisions.md` |
| Electron packaging internals (build pipeline, asar, extraResources, installed bundle layout, auto-update mechanics) | `docs/architecture/Deployment/02-Electron-Packaging-Internals.md` |
| Shipping ffmpeg (manifest, portable strategy for all OSes, runtime resolution under Electron, GPL compliance) | `docs/architecture/Deployment/03-Shipping-FFmpeg.md` |
| Resolution ladder + enum mirror chain | `docs/server/Config/01-Resolution-Ladder.md` |
| AppConfig, library configuration | `docs/server/Config/00-AppConfig.md` |
| GraphQL schema surface | `docs/server/GraphQL-Schema/00-Surface.md` |
| DB schema | `docs/server/DB-Schema/00-Tables.md` |
| HW-accel overview, tagged union, adding a backend | `docs/server/Hardware-Acceleration/00-Overview.md` |
| HDR pad artifact + workarounds | `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md` |
| fluent-ffmpeg quirks (argv, `setFfmpegPath`) | `docs/server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md` |
| Client compile-time tunables (`clientConfig`), two-layer config model | `docs/client/Config/00-ClientConfig.md` |
| Feature-flag registry | `docs/client/Feature-Flags/00-Registry.md` |
| Client debugging playbooks | `docs/client/Debugging-Playbooks/00-Common-Issues.md` |
| Rsbuild chunk-split groups, regex anchor, `bun run analyze` | `docs/client/Bundle-Chunks/00-Strategy.md` |
| Invariants (the full non-negotiables list) | `docs/code-style/Invariants/00-Never-Violate.md` |
| File naming conventions | `docs/code-style/Naming/00-Conventions.md` |
| Server conventions | `docs/code-style/Server-Conventions/00-Patterns.md` |
| Client conventions | `docs/code-style/Client-Conventions/00-Patterns.md` |
| Anti-patterns (full "don't" list) | `docs/code-style/Anti-Patterns/00-What-Not-To-Do.md` |
| Design spec (tokens, layout) | `docs/design/UI-Design-Spec/00-Tokens-And-Layout.md` |
| Product spec | `docs/product/Product-Spec/00-Scope.md` |
| Tech-choice question ("should we use X?") | No read required — use the template in `.claude/agents/architect.md` |
