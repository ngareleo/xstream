//! Manifest-pinned ffmpeg + ffprobe binary resolution, with version verification.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, thiserror::Error)]
pub enum FfmpegPathError {
    #[error("reading ffmpeg manifest at {path}")]
    ManifestRead {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("parsing ffmpeg manifest at {path}: {source}")]
    ManifestParse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },

    #[error(
        "platform '{platform}' is not supported by the ffmpeg manifest. Supported: {supported}"
    )]
    UnsupportedPlatform { platform: String, supported: String },

    #[error(
        "ffmpeg binaries are not installed at the expected location for {platform}.\n\
         Expected: {ffmpeg}\n\
                   {ffprobe}\n\n\
         Run 'bun run setup-ffmpeg' from the project root to install the pinned \
         version ({distribution} {version})."
    )]
    NotInstalled {
        platform: String,
        ffmpeg: PathBuf,
        ffprobe: PathBuf,
        distribution: String,
        version: String,
    },

    #[error(
        "ffmpeg version mismatch at {path}\n  expected: {expected}\n  actual:   {actual}\n\n\
         The installed binary has drifted from the manifest pin. Run \
         'bun run setup-ffmpeg --force' to re-install the pinned version, or \
         update scripts/ffmpeg-manifest.json if you intended to bump the version."
    )]
    VersionMismatch {
        path: PathBuf,
        expected: String,
        actual: String,
    },

    #[error("running '{path} -version' to check installed binary: {source}")]
    VersionCheckSpawn {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error(
        "'{path} -version' exited with status {status}; stderr={stderr:?}\n\
         The installed binary cannot run. Re-install with 'bun run setup-ffmpeg --force'."
    )]
    VersionCheckFailed {
        path: PathBuf,
        status: i32,
        stderr: String,
    },

    #[error("could not parse ffmpeg version from output: {output:?}")]
    VersionParseFailed { output: String },
}

pub type FfmpegPathResult<T> = Result<T, FfmpegPathError>;

/// Per-platform manifest entry. `installedPrefix` is only meaningful for the
/// `deb-install` strategy — the portable strategies put the binary under
/// `vendor/ffmpeg/<platform>/`.
#[derive(Debug, Deserialize)]
struct PlatformEntry {
    #[allow(dead_code)]
    asset: String,
    #[allow(dead_code)]
    sha256: String,
    strategy: InstallStrategy,
    #[serde(rename = "installedPrefix")]
    installed_prefix: Option<String>,
}

#[derive(Debug, Deserialize, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
enum InstallStrategy {
    DebInstall,
    PortableTarball,
    PortableZip,
}

#[derive(Debug, Deserialize)]
struct FfmpegManifestSection {
    distribution: String,
    version: String,
    #[serde(rename = "versionString")]
    version_string: String,
    platforms: BTreeMap<String, PlatformEntry>,
}

#[derive(Debug, Deserialize)]
struct FfmpegManifest {
    ffmpeg: FfmpegManifestSection,
}

/// Resolved binary paths, ready to feed into `tokio::process::Command::new(&ffmpeg)`.
#[derive(Clone, Debug)]
pub struct FfmpegPaths {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    /// The version string the resolver validated, surfaced in startup logs +
    /// telemetry so a `service.version` fan-out can split metrics by ffmpeg
    /// build.
    pub version_string: String,
}

/// Resolve manifest-pinned ffmpeg + ffprobe binaries with version verification.
pub fn resolve_ffmpeg_paths(
    project_root: &Path,
    manifest_path: &Path,
) -> FfmpegPathResult<FfmpegPaths> {
    let manifest = load_manifest(manifest_path)?;
    let platform = platform_key();
    let entry = manifest.ffmpeg.platforms.get(&platform).ok_or_else(|| {
        FfmpegPathError::UnsupportedPlatform {
            platform: platform.clone(),
            supported: manifest
                .ffmpeg
                .platforms
                .keys()
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
        }
    })?;

    let expected_version = manifest.ffmpeg.version_string.clone();

    // Priority 1 — env-var override. Skips the version check by design:
    // callers explicitly opt out by setting both env vars to known-good
    // paths, taking responsibility for the binary's compatibility.
    if let (Ok(env_ffmpeg), Ok(env_ffprobe)) = (env::var("FFMPEG_PATH"), env::var("FFPROBE_PATH")) {
        let ffmpeg = PathBuf::from(env_ffmpeg);
        let ffprobe = PathBuf::from(env_ffprobe);
        if ffmpeg.exists() && ffprobe.exists() {
            let version = read_version(&ffmpeg).unwrap_or_else(|_| "(unknown)".to_string());
            return Ok(FfmpegPaths {
                ffmpeg,
                ffprobe,
                version_string: version,
            });
        }
    }

    // Priority 2 — manifest-prescribed install location.
    let ffmpeg = installed_path(project_root, &platform, entry, "ffmpeg");
    let ffprobe = installed_path(project_root, &platform, entry, "ffprobe");

    if !ffmpeg.exists() || !ffprobe.exists() {
        return Err(FfmpegPathError::NotInstalled {
            platform: platform.clone(),
            ffmpeg,
            ffprobe,
            distribution: manifest.ffmpeg.distribution.clone(),
            version: manifest.ffmpeg.version.clone(),
        });
    }

    // Priority 3 — version verification.
    let actual = read_version(&ffmpeg)?;
    if actual != expected_version {
        return Err(FfmpegPathError::VersionMismatch {
            path: ffmpeg,
            expected: expected_version,
            actual,
        });
    }

    Ok(FfmpegPaths {
        ffmpeg,
        ffprobe,
        version_string: actual,
    })
}

fn load_manifest(path: &Path) -> FfmpegPathResult<FfmpegManifest> {
    let raw = std::fs::read_to_string(path).map_err(|source| FfmpegPathError::ManifestRead {
        path: path.to_path_buf(),
        source,
    })?;
    serde_json::from_str(&raw).map_err(|source| FfmpegPathError::ManifestParse {
        path: path.to_path_buf(),
        source,
    })
}

/// `<os>-<arch>` — the manifest's per-platform key. Uses Node-shaped
/// strings (`linux` / `darwin` / `win32`, `x64` / `arm64`) because the
/// manifest is shared with the install scripts; Rust's `consts::OS` and
/// `consts::ARCH` get translated below.
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

fn installed_path(
    project_root: &Path,
    platform: &str,
    entry: &PlatformEntry,
    base: &str,
) -> PathBuf {
    match entry.strategy {
        InstallStrategy::DebInstall => {
            let prefix = entry
                .installed_prefix
                .as_deref()
                .unwrap_or("/usr/lib/jellyfin-ffmpeg");
            PathBuf::from(prefix).join(base)
        }
        InstallStrategy::PortableTarball | InstallStrategy::PortableZip => {
            let bin = if cfg!(windows) {
                format!("{base}.exe")
            } else {
                base.to_string()
            };
            project_root
                .join("vendor")
                .join("ffmpeg")
                .join(platform)
                .join(bin)
        }
    }
}

fn read_version(bin: &Path) -> FfmpegPathResult<String> {
    let output = Command::new(bin)
        .arg("-version")
        .output()
        .map_err(|source| FfmpegPathError::VersionCheckSpawn {
            path: bin.to_path_buf(),
            source,
        })?;
    if !output.status.success() {
        return Err(FfmpegPathError::VersionCheckFailed {
            path: bin.to_path_buf(),
            status: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let first_line = stdout.lines().next().unwrap_or("");
    parse_version_line(first_line).ok_or_else(|| FfmpegPathError::VersionParseFailed {
        output: first_line.to_string(),
    })
}

/// Both `ffmpeg -version` and `ffprobe -version` start with
/// `"ffmpeg version <X> ..."` / `"ffprobe version <X> ..."`. Take the
/// first whitespace-delimited token after the prefix — that's the
/// version string the manifest pins.
fn parse_version_line(line: &str) -> Option<String> {
    for prefix in ["ffmpeg version ", "ffprobe version "] {
        if let Some(rest) = line.strip_prefix(prefix) {
            let token = rest.split_whitespace().next()?;
            return Some(token.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const SAMPLE_MANIFEST: &str = r#"{
      "ffmpeg": {
        "distribution": "jellyfin-ffmpeg",
        "version": "7.1.3-5",
        "versionString": "7.1.3-Jellyfin",
        "platforms": {
          "linux-x64": {
            "asset": "x.deb",
            "sha256": "00",
            "strategy": "deb-install",
            "installedPrefix": "/usr/lib/jellyfin-ffmpeg"
          },
          "darwin-arm64": {
            "asset": "y.tar.xz",
            "sha256": "11",
            "strategy": "portable-tarball"
          },
          "win32-x64": {
            "asset": "z.zip",
            "sha256": "22",
            "strategy": "portable-zip"
          }
        }
      }
    }"#;

    #[test]
    fn platform_key_maps_rust_os_to_node_style() {
        let key = platform_key();
        // Whatever the test host is, the key has the `<os>-<arch>` shape and
        // uses the Node-style aliases.
        assert!(
            key.starts_with("linux-") || key.starts_with("darwin-") || key.starts_with("win32-"),
            "unexpected platform key: {key}"
        );
    }

    #[test]
    fn parse_version_line_extracts_token_after_keyword() {
        assert_eq!(
            parse_version_line("ffmpeg version 7.1.3-Jellyfin Copyright (c) ..."),
            Some("7.1.3-Jellyfin".to_string())
        );
        assert_eq!(
            parse_version_line("ffprobe version 7.1.3-Jellyfin Copyright (c) ..."),
            Some("7.1.3-Jellyfin".to_string())
        );
    }

    #[test]
    fn parse_version_line_returns_none_for_garbage() {
        assert!(parse_version_line("").is_none());
        assert!(parse_version_line("hello world").is_none());
    }

    #[test]
    fn load_manifest_parses_a_full_manifest() {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("ffmpeg-manifest.json");
        std::fs::write(&path, SAMPLE_MANIFEST).expect("write manifest");
        let manifest = load_manifest(&path).expect("load");
        assert_eq!(manifest.ffmpeg.version_string, "7.1.3-Jellyfin");
        assert_eq!(manifest.ffmpeg.distribution, "jellyfin-ffmpeg");
        assert_eq!(manifest.ffmpeg.platforms.len(), 3);
        let linux = manifest
            .ffmpeg
            .platforms
            .get("linux-x64")
            .expect("linux entry");
        assert_eq!(linux.strategy, InstallStrategy::DebInstall);
        assert_eq!(
            linux.installed_prefix.as_deref(),
            Some("/usr/lib/jellyfin-ffmpeg")
        );
    }

    #[test]
    fn load_manifest_surfaces_io_error_when_file_missing() {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("does-not-exist.json");
        let err = load_manifest(&path).expect_err("missing manifest must fail");
        assert!(matches!(err, FfmpegPathError::ManifestRead { .. }));
    }

    #[test]
    fn load_manifest_surfaces_parse_error_on_garbage() {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("bad.json");
        std::fs::write(&path, "{ not json").expect("write");
        let err = load_manifest(&path).expect_err("garbage must fail");
        assert!(matches!(err, FfmpegPathError::ManifestParse { .. }));
    }

    #[test]
    fn installed_path_for_deb_install_uses_prefix() {
        let entry = PlatformEntry {
            asset: "x".into(),
            sha256: "y".into(),
            strategy: InstallStrategy::DebInstall,
            installed_prefix: Some("/usr/lib/jellyfin-ffmpeg".into()),
        };
        let project_root = Path::new("/proj");
        let p = installed_path(project_root, "linux-x64", &entry, "ffmpeg");
        assert_eq!(p, PathBuf::from("/usr/lib/jellyfin-ffmpeg/ffmpeg"));
    }

    #[test]
    fn installed_path_for_deb_install_falls_back_when_prefix_omitted() {
        let entry = PlatformEntry {
            asset: "x".into(),
            sha256: "y".into(),
            strategy: InstallStrategy::DebInstall,
            installed_prefix: None,
        };
        let project_root = Path::new("/proj");
        let p = installed_path(project_root, "linux-x64", &entry, "ffprobe");
        assert_eq!(p, PathBuf::from("/usr/lib/jellyfin-ffmpeg/ffprobe"));
    }

    #[test]
    fn installed_path_for_portable_tarball_lives_under_vendor() {
        let entry = PlatformEntry {
            asset: "x".into(),
            sha256: "y".into(),
            strategy: InstallStrategy::PortableTarball,
            installed_prefix: None,
        };
        let project_root = Path::new("/proj");
        let p = installed_path(project_root, "darwin-arm64", &entry, "ffmpeg");
        if cfg!(windows) {
            assert_eq!(
                p,
                PathBuf::from("/proj/vendor/ffmpeg/darwin-arm64/ffmpeg.exe")
            );
        } else {
            assert_eq!(p, PathBuf::from("/proj/vendor/ffmpeg/darwin-arm64/ffmpeg"));
        }
    }

    #[test]
    fn installed_path_for_portable_zip_lives_under_vendor_with_exe_on_windows() {
        let entry = PlatformEntry {
            asset: "x".into(),
            sha256: "y".into(),
            strategy: InstallStrategy::PortableZip,
            installed_prefix: None,
        };
        let project_root = Path::new("/proj");
        let p = installed_path(project_root, "win32-x64", &entry, "ffprobe");
        if cfg!(windows) {
            assert_eq!(
                p,
                PathBuf::from("/proj/vendor/ffmpeg/win32-x64/ffprobe.exe")
            );
        } else {
            assert_eq!(p, PathBuf::from("/proj/vendor/ffmpeg/win32-x64/ffprobe"));
        }
    }

    #[test]
    fn resolve_returns_unsupported_platform_when_key_not_in_manifest() {
        let dir = TempDir::new().expect("tempdir");
        let manifest_path = dir.path().join("ffmpeg-manifest.json");
        // Manifest with only one platform that does not match the test host.
        let bogus = r#"{
          "ffmpeg": {
            "distribution": "jellyfin-ffmpeg",
            "version": "7.1.3-5",
            "versionString": "7.1.3-Jellyfin",
            "platforms": {
              "freebsd-mips64": {
                "asset": "x", "sha256": "y", "strategy": "portable-tarball"
              }
            }
          }
        }"#;
        std::fs::write(&manifest_path, bogus).expect("write");
        let project_root = dir.path();
        let err = resolve_ffmpeg_paths(project_root, &manifest_path)
            .expect_err("test host platform is not in this manifest");
        assert!(matches!(err, FfmpegPathError::UnsupportedPlatform { .. }));
    }

    #[test]
    fn resolve_reports_not_installed_when_manifest_path_does_not_exist() {
        // Use a manifest matching the test host but pointing portable
        // strategies under a tempdir vendor/ tree that does not exist.
        let dir = TempDir::new().expect("tempdir");
        let manifest_path = dir.path().join("ffmpeg-manifest.json");
        let key = platform_key();
        let manifest = format!(
            r#"{{"ffmpeg":{{"distribution":"x","version":"1","versionString":"v","platforms":{{"{key}":{{"asset":"a","sha256":"b","strategy":"portable-tarball"}}}}}}}}"#,
        );
        std::fs::write(&manifest_path, manifest).expect("write");
        let project_root = dir.path(); // no vendor/ tree exists here
        let err = resolve_ffmpeg_paths(project_root, &manifest_path)
            .expect_err("must fail not-installed");
        assert!(matches!(err, FfmpegPathError::NotInstalled { .. }));
    }
}
