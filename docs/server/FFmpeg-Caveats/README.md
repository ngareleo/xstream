# FFmpeg Caveats

Append-only catalogue of ffmpeg / fragmented-MP4 / MSE incompatibilities we hit in production. Each entry is a *specific symptom + the flag(s) we added to fix it*. Different from `Hardware-Acceleration/` (which is GPU pipeline) and `Streaming/` (which is wire protocol) — this folder is the log of "the toolchain default lied to us and here's the override".

| File | Hook |
|---|---|
| [`00-Overview.md`](00-Overview.md) | Rolling index — one row per caveat, links to the detailed entry. |
| [`01-Negative-DTS.md`](01-Negative-DTS.md) | First packet has `dts < 0` from B-frame reorder; MSE ignores `elst`; HLS-fmp4 muxer silently eats every timestamp flag; fix is to drop the HLS muxer for direct `-f mp4` + a userland tail-reader that splits the output. |
| [`02-Tfdt-Sample-Mismatch.md`](02-Tfdt-Sample-Mismatch.md) | Empty `elst` edit causes `tfdt` to disagree with first-sample DTS by 504 ticks; MSE accumulates the offset and fails 2–5 s in. Same fix as 01. |
