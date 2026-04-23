# Observability

OpenTelemetry traces + structured logs. Client and server share a single traceId via `traceparent` propagation.

| File | Hook |
|---|---|
| [`00-Architecture.md`](00-Architecture.md) | OTel SDK wiring on both sides; dev proxy to Seq; prod OTLP to Axiom/Grafana. |
| [`01-Logging-Policy.md`](01-Logging-Policy.md) | Message-body rules, span-vs-log, levels, attributes, client session context, server traceparent extraction. |
| [`02-Searching-Seq.md`](02-Searching-Seq.md) | Seq filter syntax for trace-scoped lookup. |
| [`03-Config-And-Backends.md`](03-Config-And-Backends.md) | Env vars (client + server), switching to Axiom, Seq API key setup. |

## Side-specific spans

| Folder | Hook |
|---|---|
| [`client/`](client/README.md) | Client-side spans (`playback.session`, `chunk.stream`, `buffer.backpressure`, `playback.stalled`, `transcode.request`). |
| [`server/`](server/README.md) | Server-side spans (`stream.request`, `job.resolve`, `transcode.job`, `library.scan`). |
