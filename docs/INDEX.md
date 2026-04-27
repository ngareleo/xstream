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
| Rust + Tauri port plan, stable contracts | `docs/architecture/Deployment/00-Rust-Tauri-Port.md` |
| Resolution ladder + enum mirror chain | `docs/server/Config/01-Resolution-Ladder.md` |
| AppConfig, `mediaFiles.json` | `docs/server/Config/00-AppConfig.md` |
| GraphQL schema surface | `docs/server/GraphQL-Schema/00-Surface.md` |
| DB schema | `docs/server/DB-Schema/00-Tables.md` |
| HW-accel overview, tagged union, adding a backend | `docs/server/Hardware-Acceleration/00-Overview.md` |
| HDR pad artifact + workarounds | `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md` |
| fluent-ffmpeg quirks (argv, `setFfmpegPath`) | `docs/server/Hardware-Acceleration/02-Fluent-FFmpeg-Quirks.md` |
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
