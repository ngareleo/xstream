# Deployment

How xstream ships to users. Current: local dev only. Future: Tauri desktop bundle driven by a Rust server rewrite.

| File | Hook |
|---|---|
| [`00-Rust-Tauri-Port.md`](00-Rust-Tauri-Port.md) | Rewrite plan: stable contracts (SDL, global IDs, binary framing), bundleable-everything rule, ffmpeg as bundled subprocess. |
| [`01-Streaming-Layer.md`](01-Streaming-Layer.md) | Stream endpoint + chunker migration — pull contract → axum, MAX_CONCURRENT_JOBS → Semaphore, content-addressed cache key for future peer-sharing. |
| [`02-Observability-Layer.md`](02-Observability-Layer.md) | OTel SDK → tracing + opentelemetry-otlp; W3C extraction middleware; cross-peer traceparent flow. |
| [`03-GraphQL-Layer.md`](03-GraphQL-Layer.md) | graphql-yoga + graphql-tools → async-graphql; SDL parity; typed-error union; subscription transport via async-graphql-axum. |
| [`04-Web-Server-Layer.md`](04-Web-Server-Layer.md) | Bun.serve → axum router + tower stack; RequestContext middleware threaded from day one; configurable CORS + bind addr. |
| [`05-Database-Layer.md`](05-Database-Layer.md) | bun:sqlite → rusqlite (bundled); identical schema + WAL pragma; two-DB split (cache vs identity) for forward sharing. |
| [`06-File-Handling-Layer.md`](06-File-Handling-Layer.md) | Library walk → walkdir + buffer_unordered; fs.watch → notify; ffmpeg manifest pinning; content-addressed cache index + per-job dir layout. |
