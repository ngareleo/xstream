# Hardware Acceleration Overview

HW-accel is a tagged union: `HwAccelConfig` in `server-rust/src/services/hw_accel.rs` with variants `software` / `vaapi` / `videotoolbox` / `qsv` / `nvenc` / `amf`. Only `vaapi` is implemented today; stubs exist for macOS/Windows.

`detect_hw_accel` runs a probe at startup; the chosen variant drives the argv construction in `build_encode_argv` in `ffmpeg_file.rs`. Software is the **benchmarking / retry** path, never the auto-fallback on probe failure — probe failure is fatal and the user must fix it or run the platform-specific ffmpeg setup script.

## Adding a backend

Two edits and a startup-log verification:

1. Probe implementation in `detect_hw_accel`.
2. ffmpeg argv in `build_encode_argv` (pre_input, post_input, or both).
3. Verify the chosen variant appears in the `hwaccel_detected` startup log.
