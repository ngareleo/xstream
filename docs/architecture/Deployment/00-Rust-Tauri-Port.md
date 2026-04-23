# Rust + Tauri Port Plan

The Bun/JS server is a **prototype** used to validate the architecture. Once stable, the server is rewritten in Rust; the React/Relay client is untouched. Packaging target: Rust server + React client ship as a **Tauri desktop app** (Windows/macOS/Linux). Every runtime dependency must be bundleable — no `apt install`, `brew install`, or system-package requirements.

## Stable contracts across the port

- GraphQL SDL must be identical — same types, field names, enum values, nullability.
- Global IDs: `base64("TypeName:localId")`.
- `/stream/:jobId` framing: 4-byte big-endian uint32 length + raw fMP4 bytes, init segment first.
- Subscriptions: `graphql-ws` subprotocol.
- ffmpeg remains a bundled subprocess — `vendor/ffmpeg/<platform>/ffmpeg` via jellyfin-ffmpeg portable builds; Tauri resource bundling in the Rust port.

Don't couple the client to anything server-implementation-specific. All client↔server traffic goes through `/graphql` or `/stream/:jobId`.
