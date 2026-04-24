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

## Streaming pipeline in one paragraph

The client drives transcoding in **300-second chunks**. For each chunk, it fires the `startTranscode(videoId, resolution, start, end)` GraphQL mutation → returns `StartTranscodeResult` (either a `TranscodeJob` on success or a typed `PlaybackError` on known failure) → server spawns a dedicated ffmpeg process producing fMP4 segments into `tmp/segments/<jobId>/`. Client then opens `GET /stream/<jobId>` — server sends `init.mp4` first (4-byte BE length + bytes), then each `segment_NNNN.m4s` as it appears via `fs.watch`. Client's `BufferManager` queues-and-appends segments into the MSE `SourceBuffer`. A RAF prefetch fires the *next* chunk's mutation and **opens its stream immediately** (lookahead slot of `ChunkPipeline`), so chunks stitch seamlessly. Backpressure (`forwardTargetS: 60s` / resume `20s`) pauses the network without killing the TCP connection; the server's 30 s orphan timer is an intentional safety — never weaken it. Four scenarios (initial / backpressure / seek / resolution switch) have dedicated sequence diagrams in [`architecture/Streaming/01-Playback-Scenarios.md`](architecture/Streaming/01-Playback-Scenarios.md). Three load-bearing chunk-pipeline invariants — PTS contract (`-output_ts_offset` + `mode = "segments"`), per-chunk init re-append, lookahead segment buffering — live in [`architecture/Streaming/02-Chunk-Pipeline-Invariants.md`](architecture/Streaming/02-Chunk-Pipeline-Invariants.md); violating any one silently breaks the buffered-range timeline.

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
| UI design spec | [`design/`](design/README.md) |
| Product spec, customers, roadmap | [`product/`](product/README.md) |

**For anything deeper than this page, ask the `architect` subagent — it owns the knowledge base and maintains this file.** When you modify code or docs, notify architect with a short change summary before closing the task so the tree stays coherent.

---

_Last regenerated: 2026-04-24. Owned by the `architect` subagent; regenerated mechanically by the `groom-knowledge-base` skill._
