# Hardware Acceleration Overview

HW-accel is a tagged union: `HwAccelConfig` in `server/src/services/hwAccel.ts` with variants `software` / `vaapi` / `videotoolbox` / `qsv` / `nvenc` / `amf`. Only `vaapi` is implemented today; stubs exist for macOS/Windows.

`detectHwAccel` runs a probe at startup; the chosen variant drives `FFmpegFile.applyOutputOptions` in `ffmpegFile.ts`. Software is the **benchmarking / retry** path, never the auto-fallback on probe failure — probe failure is fatal and the user must fix it or run `bun run setup-ffmpeg`.

## Adding a backend

Two edits and a startup-log verification:

1. Probe implementation in `detectHwAccel`.
2. ffmpeg flags in `FFmpegFile.applyOutputOptions`.
3. Verify the chosen variant appears in the `hwaccel_detected` startup log.
