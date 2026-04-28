# Architecture

Cross-cutting concepts that span client and server, or that describe the system at a level above either side.

## Topic files

| File | Hook |
|---|---|
| [`00-System-Overview.md`](00-System-Overview.md) | ASCII diagram + server/client component tables. Start here. |

## Concepts

| Folder | Hook |
|---|---|
| [`Streaming/`](Streaming/README.md) | Binary protocol on `/stream/:jobId`; four playback scenarios (initial, backpressure, seek, resolution switch). |
| [`Relay/`](Relay/README.md) | GraphQL + Relay fragment contract; operation naming, global IDs, presenters. |
| [`Observability/`](Observability/README.md) | OTel span tree, logging policy, traceparent threading, Seq backend config. |
| [`Startup/`](Startup/README.md) | Server boot sequence + graceful shutdown. |
| [`Library-Scan/`](Library-Scan/README.md) | How the library scanner walks media directories and fingerprints files. |
| [`Sharing/`](Sharing/README.md) | Forward-looking peer-to-peer media sharing model — invite tokens, content-addressed cache reuse, cross-peer traceparent. |
| [`Deployment/`](Deployment/README.md) | Interim Electron + Bun-as-sidecar shell for the Bun prototype before the Rust+Tauri port — decision, HW-accel + packaging decisions, Electron internals deep-dive, ffmpeg shipping. |
| [`Testing/`](Testing/README.md) | Test side-effects policy, encode-pipeline real-media tests, encoder edge-case test policy. |
