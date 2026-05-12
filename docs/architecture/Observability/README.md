# Observability

OpenTelemetry traces + structured logs. Client and server share a single traceId via `traceparent` propagation.

| File | Hook |
|---|---|
| [`00-Architecture.md`](00-Architecture.md) | OTel SDK wiring on both sides; dev proxy to local Seq; prod OTLP to Axiom (Grafana Cloud, Honeycomb, self-hosted Seq remain pluggable alternatives). |
| [`01-Logging-Policy.md`](01-Logging-Policy.md) | Message-body rules, span-vs-log, levels, attributes, client session context, server traceparent extraction, PII redaction policy for remote exports. |
| [`02-Searching-Seq.md`](02-Searching-Seq.md) | Seq filter syntax for local-dev trace lookup. Axiom uses APL — Axiom query primer pending (`02-Searching-Axiom.md`). |
| [`03-Config-And-Backends.md`](03-Config-And-Backends.md) | Env vars (client + server), production Axiom config, alternative OTLP backends, local-dev Seq API key setup. |
| [`04-Verification-Workflow.md`](04-Verification-Workflow.md) | Trace-first verification: decide signal up-front, add logs before verifying, query Seq not the spinner. Includes span.addEvent gotcha on long-lived spans. |

## Side-specific spans

| Folder | Hook |
|---|---|
| [`client/`](client/README.md) | Client-side spans (`playback.session`, `chunk.stream`, `buffer.backpressure`, `playback.stalled`, `transcode.request`). |
| [`server/`](server/README.md) | Server-side spans (`stream.request`, `job.resolve`, `transcode.job`, `library.scan`). |
