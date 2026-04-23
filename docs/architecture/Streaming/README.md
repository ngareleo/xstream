# Streaming

The length-prefixed binary streaming protocol on `/stream/:jobId` plus the client/server dance for initial playback, backpressure, seek, and resolution switch.

| File | Hook |
|---|---|
| [`00-Protocol.md`](00-Protocol.md) | Binary framing: 4-byte big-endian length + fMP4 bytes. Init segment first. Hysteresis numbers for backpressure. |
| [`01-Playback-Scenarios.md`](01-Playback-Scenarios.md) | Four scenarios with sequence diagrams: initial, backpressure, seek, resolution switch. |

Diagrams are in [`../../diagrams/`](../../diagrams/). The `.mmd` is authoritative; the `.png` is regenerated via the `update-docs` skill.
