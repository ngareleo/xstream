# Rust + Tauri Rewrite

The Bun/TypeScript server is a prototype used to validate the architecture. The long-term target is a Rust rewrite shipped together with the React/Relay client as a Tauri desktop app for Linux, Windows, and macOS, distributed by the user (no third-party app stores). A second forward requirement — peer-to-peer media sharing — is baked into the Rust port's design without shipping in v1.

This folder is the authoritative migration plan: a future agent should be able to read it end-to-end and execute the rewrite. The `00-Rust-Tauri-Port.md` anchor + the eight `01`-`08` deep-dives are self-contained; the synthesis docs (`07`, `08`) cross-link rather than duplicate.

## Reading order

1. **`00-Rust-Tauri-Port.md`** — anchor doc. Stable contracts the rewrite must preserve; forward pointer to peer sharing.
2. **`01`-`06`** — layer-by-layer deep-dives. Each follows the same shape: current Bun implementation (with `file:line` excerpts), stable contracts, Rust target shape with locked crate picks, open questions.
3. **`07`** — synthesis: runtime model shift, concurrency primitives map, idiom translations, phased migration order, post-cutover workspace layout.
4. **`08`** — Tauri packaging: bundle layout, embedded server, ffmpeg bundling, Ed25519 self-hosted updates, code-signing per OS, CI matrix.

Forward design that ships AFTER the rewrite (peer-to-peer sharing) lives at [`docs/architecture/Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md). Forward constraints from that design are inlined in the relevant layer docs here so the rewrite does not foreclose sharing.

## Topic files

| File | Hook |
|---|---|
| [`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md) | Anchor: stable contracts (SDL, global IDs, binary framing, subscription transport, bundleable ffmpeg) + forward pointer to Sharing. |
| [`01-Streaming-Layer.md`](01-Streaming-Layer.md) | Stream endpoint + chunker + ffmpegPool — pull contract → axum, `config.transcode.maxConcurrentJobs` cap → `Arc<Semaphore>` + dying-set, content-addressed cache key, per-consumer pull isolation, full span surface incl. `transcode_silent_failure`. |
| [`02-Observability-Layer.md`](02-Observability-Layer.md) | OTel SDK → tracing + opentelemetry-otlp; W3C extraction middleware; cross-peer traceparent flow. |
| [`03-GraphQL-Layer.md`](03-GraphQL-Layer.md) | graphql-yoga → async-graphql; SDL parity; typed-error union; subscription transport already on `graphql-ws` WebSocket on the Bun side. |
| [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) | Bun.serve → axum router + tower stack; RequestContext middleware threaded from day one; configurable CORS + bind addr. |
| [`05-Database-Layer.md`](05-Database-Layer.md) | bun:sqlite → rusqlite (bundled); identical schema + WAL pragma; two-DB split (cache vs identity) for forward sharing. |
| [`06-File-Handling-Layer.md`](06-File-Handling-Layer.md) | Library walk → walkdir + buffer_unordered; fs.watch → notify; ffmpeg manifest pinning; content-addressed cache index. |
| [`07-Bun-To-Rust-Migration.md`](07-Bun-To-Rust-Migration.md) | Synthesis: runtime model, concurrency primitives, idiom translations, locked crates, phased migration order (A→G), post-cutover workspace layout. |
| [`08-Tauri-Packaging.md`](08-Tauri-Packaging.md) | Tauri shell + bundle layout, embedded server (in-process loopback), bundled jellyfin-ffmpeg, Ed25519 self-hosted updates, code-signing per OS, CI matrix. |

## Status

Documentation set complete. Implementation has not started. The plan file at `~/.claude/plans/talk-to-the-architect-squishy-cray.md` captures the original scoping conversation; the docs above supersede it as the working spec.
