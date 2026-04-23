# Hardware Acceleration

Everything the server does to keep GPU transcoding correct across real-world sources — VAAPI on Linux, stubs on macOS/Windows.

| File | Hook |
|---|---|
| [`00-Overview.md`](00-Overview.md) | `HwAccelConfig` tagged union; `detectHwAccel` probe; how to add a backend. |
| [`01-HDR-Pad-Artifact.md`](01-HDR-Pad-Artifact.md) | Green/pink overlay on HDR sources via `pad_vaapi`; three fixes, cheapest first. |
| [`02-Fluent-FFmpeg-Quirks.md`](02-Fluent-FFmpeg-Quirks.md) | `inputOptions` argv splitting; `setFfmpegPath` module-global clobber. |
