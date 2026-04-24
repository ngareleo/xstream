# Streaming

The length-prefixed binary streaming protocol on `/stream/:jobId` plus the client/server dance for initial playback, backpressure, seek, and resolution switch.

| File | Hook |
|---|---|
| [`00-Protocol.md`](00-Protocol.md) | Binary framing: 4-byte big-endian length + fMP4 bytes. Init segment first. Hysteresis numbers for backpressure. |
| [`01-Playback-Scenarios.md`](01-Playback-Scenarios.md) | Four scenarios with sequence diagrams: initial, backpressure, seek, resolution switch. |
| [`02-Chunk-Pipeline-Invariants.md`](02-Chunk-Pipeline-Invariants.md) | The three rules that keep foreground+lookahead concurrency from skipping or stalling: PTS contract, per-chunk re-init, lookahead segment buffering. |
| [`03-Playback-Subsystems.md`](03-Playback-Subsystems.md) | `PlaybackTicker` (single RAF), `StallTracker` (spinner debounce), `PlaybackTimeline` (drift predictions) — the modules `PlaybackController` composes. |
| [`04-Demand-Driven-Streaming.md`](04-Demand-Driven-Streaming.md) | Pull-based `ReadableStream` contract (`pull` not `start`), `drainAndDispatch` pause cooperation, MSE detach recovery path, Rust/Tauri translation notes. |

Diagrams are in [`../../diagrams/`](../../diagrams/). The `.mmd` is authoritative; the `.png` is regenerated via the `update-docs` skill.
