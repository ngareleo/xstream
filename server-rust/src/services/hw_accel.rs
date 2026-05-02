//! Hardware-acceleration probe + selection.
//!
//! Policy: the server probes at startup for a platform-appropriate HW path.
//! If `auto` (the default) and the probe fails, the resolver returns a typed
//! error — `main()` surfaces it as `AppError::HwAccelProbe` and the process
//! exits with a clear diagnostic. Silent fallback to software is deliberately
//! NOT the default: 4K libx264 stalls continuously on consumer CPUs and would
//! mask real driver / permission regressions in production.
//!
//! Today only the VAAPI branch is fully implemented. macOS (VideoToolbox)
//! and Windows (QSV / NVENC / AMF) variants are tracked as
//! `Plan/Open-Questions.md §1` follow-ups; this module returns
//! `HwAccelError::PlatformNotImplemented` for those hosts so the failure
//! surface is explicit rather than silent.

use std::path::Path;
use std::time::Duration;

use thiserror::Error;
use tokio::process::Command;
use tokio::time::timeout;

use crate::services::ffmpeg_file::HwAccelConfig;

/// Mode selector — usually read from the `HW_ACCEL` env var
/// (`auto` is the implicit default; only `off` is meaningful as an opt-out).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HwAccelMode {
    Auto,
    Off,
}

impl HwAccelMode {
    /// `HW_ACCEL=off` → `Off`; anything else (including unset, `auto`,
    /// or any other value) → `Auto`. The default is opt-in HW accel; only
    /// the explicit `off` opt-out is honored.
    pub fn from_env() -> Self {
        match std::env::var("HW_ACCEL").as_deref() {
            Ok("off") => Self::Off,
            _ => Self::Auto,
        }
    }
}

pub const DEFAULT_VAAPI_DEVICE: &str = "/dev/dri/renderD128";

#[derive(Debug, Error)]
pub enum HwAccelError {
    #[error("spawning ffmpeg at {ffmpeg} for VAAPI probe: {source}")]
    ProbeSpawn {
        ffmpeg: std::path::PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("ffmpeg VAAPI probe timed out after {timeout_ms} ms — driver / permissions issue?")]
    ProbeTimeout { timeout_ms: u64 },

    #[error(
        "VAAPI probe failed on linux\n  device: {device}\n  exit:   {exit:?}\n  stderr: {stderr}\n\n\
         Common causes:\n\
           • GPU driver too old for your hardware (Lunar Lake needs intel-media-driver 24.2.0+)\n\
           • User not in 'render' group or ACL missing on {device}\n\
           • Running inside a container/VM without GPU passthrough\n\n\
         Set HW_ACCEL=off to force software mode (note: software 4K encode stalls continuously)."
    )]
    VaapiProbeFailed {
        device: String,
        exit: Option<i32>,
        stderr: String,
    },

    #[error(
        "HW accel on {os} not yet implemented.\n\
         Set HW_ACCEL=off to run software encode, or contribute the {hint} \
         implementation in server-rust/src/services/hw_accel.rs and the matching \
         branch in services/ffmpeg_file.rs::build_encode_argv."
    )]
    PlatformNotImplemented {
        os: &'static str,
        hint: &'static str,
    },
}

pub type HwAccelResult<T> = Result<T, HwAccelError>;

/// Resolve the HW accel config for this host. Called once at startup.
///
/// `mode = Off` always returns `Software` immediately (no probe, no I/O).
/// `mode = Auto` runs a 0.1 s synthetic encode through `h264_vaapi` on
/// Linux; success → `Vaapi { device }`, failure → typed error so `main()`
/// can decide policy (today: fatal exit; future Tauri build per
/// `Plan/Open-Questions.md §4` may degrade to `Software` with a toast).
pub async fn resolve_hw_accel(ffmpeg: &Path, mode: HwAccelMode) -> HwAccelResult<HwAccelConfig> {
    if mode == HwAccelMode::Off {
        return Ok(HwAccelConfig::Software);
    }

    if cfg!(target_os = "linux") {
        probe_vaapi(ffmpeg, DEFAULT_VAAPI_DEVICE).await?;
        return Ok(HwAccelConfig::Vaapi {
            device: DEFAULT_VAAPI_DEVICE.to_string(),
        });
    }

    if cfg!(target_os = "macos") {
        return Err(HwAccelError::PlatformNotImplemented {
            os: "darwin",
            hint: "videotoolbox",
        });
    }

    if cfg!(target_os = "windows") {
        return Err(HwAccelError::PlatformNotImplemented {
            os: "win32",
            hint: "qsv/nvenc/amf",
        });
    }

    Err(HwAccelError::PlatformNotImplemented {
        os: "unknown",
        hint: "none",
    })
}

const PROBE_TIMEOUT_MS: u64 = 10_000;

/// Synthetic VAAPI encode — `lavfi:testsrc` → `h264_vaapi` for 0.1 s. Exit 0
/// means the device initialised, the encoder produced frames, and ffmpeg
/// closed cleanly. Anything else surfaces as `VaapiProbeFailed` with the
/// stderr tail for diagnosis.
async fn probe_vaapi(ffmpeg: &Path, device: &str) -> HwAccelResult<()> {
    let args = ["-hide_banner", "-v", "error", "-init_hw_device"];
    let device_arg = format!("vaapi=va:{device}");
    let probe_args: Vec<&str> = args
        .iter()
        .copied()
        .chain([
            device_arg.as_str(),
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=0.1:size=320x240:rate=24",
            "-vf",
            "format=nv12,hwupload",
            "-c:v",
            "h264_vaapi",
            "-qp",
            "23",
            "-f",
            "null",
            "-",
        ])
        .collect();

    let fut = Command::new(ffmpeg).args(&probe_args).output();
    let output = timeout(Duration::from_millis(PROBE_TIMEOUT_MS), fut)
        .await
        .map_err(|_| HwAccelError::ProbeTimeout {
            timeout_ms: PROBE_TIMEOUT_MS,
        })?
        .map_err(|source| HwAccelError::ProbeSpawn {
            ffmpeg: ffmpeg.to_path_buf(),
            source,
        })?;

    if output.status.success() {
        return Ok(());
    }

    Err(HwAccelError::VaapiProbeFailed {
        device: device.to_string(),
        exit: output.status.code(),
        stderr: String::from_utf8_lossy(&output.stderr)
            .chars()
            .take(800)
            .collect(),
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// The full VAAPI probe needs a real ffmpeg binary AND a real `/dev/dri`
// device, so it can't run in CI. We cover the deterministic surface:
// mode parsing, the early-Software path, and the not-implemented branches
// for non-Linux hosts. Real-binary VAAPI parity is asserted in the
// integration tests for chunker/encode (gated on XSTREAM_TEST_MEDIA_DIR).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_off_short_circuits_to_software() {
        // Use a non-existent ffmpeg path — Off should not spawn anything,
        // so the path isn't dereferenced.
        let dummy = Path::new("/does/not/exist/ffmpeg");
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let cfg = rt
            .block_on(resolve_hw_accel(dummy, HwAccelMode::Off))
            .expect("Off must short-circuit");
        assert_eq!(cfg, HwAccelConfig::Software);
    }

    #[test]
    fn auto_on_linux_with_missing_ffmpeg_returns_probe_spawn_error() {
        if !cfg!(target_os = "linux") {
            return;
        }
        let dummy = Path::new("/definitely/not/a/real/binary/ffmpeg");
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let err = rt
            .block_on(resolve_hw_accel(dummy, HwAccelMode::Auto))
            .expect_err("auto with bogus ffmpeg must fail");
        assert!(
            matches!(err, HwAccelError::ProbeSpawn { .. }),
            "expected ProbeSpawn, got {err:?}"
        );
    }

    #[test]
    fn from_env_treats_off_literally() {
        // Exercise the literal-value branches without depending on the
        // ambient HW_ACCEL — clear it for the duration of the assertions.
        let prior = std::env::var("HW_ACCEL").ok();
        // SAFETY: tests in this module run sequentially via the test harness,
        // and HwAccelMode::from_env reads the env var fresh on each call.
        // We restore the original value after the assertions.
        unsafe { std::env::remove_var("HW_ACCEL") };
        assert_eq!(HwAccelMode::from_env(), HwAccelMode::Auto);
        unsafe { std::env::set_var("HW_ACCEL", "off") };
        assert_eq!(HwAccelMode::from_env(), HwAccelMode::Off);
        unsafe { std::env::set_var("HW_ACCEL", "auto") };
        assert_eq!(HwAccelMode::from_env(), HwAccelMode::Auto);
        unsafe { std::env::set_var("HW_ACCEL", "garbage") };
        // Anything that isn't literally "off" falls back to Auto — only
        // the explicit opt-out is honored.
        assert_eq!(HwAccelMode::from_env(), HwAccelMode::Auto);
        match prior {
            Some(v) => unsafe { std::env::set_var("HW_ACCEL", v) },
            None => unsafe { std::env::remove_var("HW_ACCEL") },
        }
    }
}
