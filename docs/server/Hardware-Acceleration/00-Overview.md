# Hardware Acceleration Overview

HW-accel is a tagged union: `HwAccelConfig` in `server-rust/src/services/hw_accel.rs` with variants `software` / `vaapi` / `videotoolbox` / `qsv` / `nvenc` / `amf`. Only `vaapi` is implemented today; stubs exist for macOS/Windows.

`resolve_hw_accel()` runs a probe at startup; the chosen variant drives the argv construction in `build_encode_argv` in `ffmpeg_file.rs`.

## Fallback behavior by platform

**Linux (VAAPI):** A 0.1 s synthetic encode probe runs through `h264_vaapi`. If the probe fails (missing driver, permissions issue, old GPU), the error is fatal — misconfiguration must be fixed by the user or handled via `HW_ACCEL=off`. Software is the **benchmarking / retry** path, never the auto-fallback on VAAPI probe failure.

**macOS (VideoToolbox) and Windows (QSV/NVENC/AMF):** Hardware paths are stubbed. In `mode = Auto`, the stubs emit a `tracing::warn!()` with fields `os` (darwin/win32) and `hint` (videotoolbox/qsv/nvenc/amf) and return `Ok(HwAccelConfig::Software)`. The app starts normally and falls back to software encoding — no fatal crash. This is a **graceful degradation**, not a probe failure: the platform is simply not yet implemented, and the stub's message is a nudge for contributors. The Tauri shell's `HW_ACCEL=off` preemption on Linux bundles (forcing portable ffmpeg + software) remains unchanged.

**Unknown/unsupported OS:** Fatal `PlatformNotImplemented`.

## Adding a backend

Two edits and a startup-log verification:

1. Probe implementation in `resolve_hw_accel()`.
2. ffmpeg argv in `build_encode_argv` (pre_input, post_input, or both).
3. Verify the chosen variant appears in the `hwaccel_detected` startup log.
