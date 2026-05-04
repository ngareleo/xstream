//! Resolve bundled ffmpeg paths from the Tauri resource directory.

use std::path::{Path, PathBuf};

use xstream_server::services::ffmpeg_path::FfmpegPaths;

#[derive(Debug, thiserror::Error)]
pub enum BundledFfmpegError {
    #[error(
        "bundled ffmpeg binaries are missing under {dir} (platform: {platform}). \n\
         Expected layout: <resource_dir>/resources/ffmpeg/<platform>/{{ffmpeg,ffprobe}}.\n\
         Did `bun run setup-ffmpeg --target=tauri-bundle` run during the Tauri build?"
    )]
    Missing { platform: String, dir: PathBuf },
}

pub fn resolve(resource_dir: &Path) -> Result<FfmpegPaths, BundledFfmpegError> {
    let platform = platform_key();
    let dir = resource_dir
        .join("resources")
        .join("ffmpeg")
        .join(&platform);
    let bin_suffix = if cfg!(windows) { ".exe" } else { "" };
    let ffmpeg = dir.join(format!("ffmpeg{bin_suffix}"));
    let ffprobe = dir.join(format!("ffprobe{bin_suffix}"));

    if !ffmpeg.exists() || !ffprobe.exists() {
        return Err(BundledFfmpegError::Missing { platform, dir });
    }

    // The bundle is the source of truth — version drift is impossible
    // after `tauri build` succeeds (the staged binaries were SHA256-checked
    // against `scripts/ffmpeg-manifest.json` by `setup-ffmpeg`).
    Ok(FfmpegPaths {
        ffmpeg,
        ffprobe,
        version_string: "(bundled)".to_string(),
    })
}

/// `<os>-<arch>` — Node-style. Matches the manifest's per-platform key
/// and the existing `vendor/ffmpeg/<platform>/` convention used by
/// `setup-ffmpeg.ts`.
fn platform_key() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    };
    format!("{os}-{arch}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_key_uses_node_style_aliases() {
        let key = platform_key();
        assert!(
            key.starts_with("linux-") || key.starts_with("darwin-") || key.starts_with("win32-"),
            "unexpected platform key: {key}"
        );
    }

    #[test]
    fn resolve_returns_missing_when_bundle_absent() {
        let dir = PathBuf::from("/var/empty/xstream-tauri-bundle-not-here-7e3b");
        let err = resolve(&dir).expect_err("must fail when ffmpeg/ tree is absent");
        assert!(matches!(err, BundledFfmpegError::Missing { .. }));
    }
}
