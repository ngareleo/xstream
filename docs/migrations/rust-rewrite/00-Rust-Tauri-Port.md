# Rust + Tauri Port Plan

The Bun/JS server is a **prototype** used to validate the architecture. Once stable, the server is rewritten in Rust; the React/Relay client is untouched. Packaging target: Rust server + React client ship as a **Tauri desktop app** (Windows/macOS/Linux). Every runtime dependency must be bundleable — no `apt install`, `brew install`, or system-package requirements.

## Stable contracts across the port

- GraphQL SDL must be identical — same types, field names, enum values, nullability.
- Global IDs: `base64("TypeName:localId")`.
- `/stream/:jobId` framing: 4-byte big-endian uint32 length + raw fMP4 bytes, init segment first.
- Subscriptions: `graphql-ws` subprotocol.
- ffmpeg remains a bundled subprocess — `vendor/ffmpeg/<platform>/ffmpeg` via jellyfin-ffmpeg portable builds; Tauri resource bundling in the Rust port.

Don't couple the client to anything server-implementation-specific. All client↔server traffic goes through `/graphql` or `/stream/:jobId`.

## Forward pointer — peer sharing

A second forward requirement: peer-to-peer media sharing across xstream instances. Each Tauri app is a node; users hand each other signed invite tokens out-of-band, and a remote node's React client streams from another node's Rust server using the same protocol. Sharing ships AFTER the Rust + Tauri port — but the Rust architecture chosen NOW must not foreclose it.

Forward constraints baked into the per-layer migration docs:

- **Streaming** (`01-Streaming-Layer.md`): per-connection pull isolation, content-addressed cache key, per-consumer mpsc backpressure.
- **Web server** (`04-Web-Server-Layer.md`): `RequestContext` middleware threaded from day one even when auth is no-op; configurable CORS allowlist + bind address.
- **Database** (`05-Database-Layer.md`): two-DB split — cache DB in `tmp/`-class storage, identity DB in `app_data_dir()`.
- **File handling** (`06-File-Handling-Layer.md`): explicit `(videoId, resolution, startS, endS)` → `JobId` cache index; eviction keeps the index consistent.

Single authoritative spec: [`Sharing/00-Peer-Streaming.md`](../../architecture/Sharing/00-Peer-Streaming.md).
