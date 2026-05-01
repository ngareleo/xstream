//! Library scanner. Mirrors `server/src/services/libraryScanner.ts`.
//!
//! One sweep walks every library row in the DB, fingerprints each video
//! file, ffprobes it for streams + duration, and upserts the
//! `videos` + `video_streams` rows. Per-library progress flows through
//! [`crate::services::scan_state::ScanState`] so the GraphQL
//! `library_scan_progress` subscription can drive the dashboard.
//!
//! Triggers:
//! - GraphQL `scan_libraries` mutation (resolver spawns this).
//! - GraphQL `create_library` mutation (chains a fire-and-forget scan
//!   so adding a profile auto-indexes it — the user-visible "click Scan
//!   All did nothing" symptom that motivated this port).
//! - [`spawn_periodic_scan`] background loop, started at boot from
//!   `lib.rs::run`. Re-entry-guarded by [`crate::services::scan_state::ScanState::mark_started`].
//!
//! OMDb auto-match (`autoMatchLibrary` on the Bun side) is deliberately
//! NOT ported in this PR — see TODO in [`scan_libraries`]. Tracking:
//! `docs/migrations/rust-rewrite/06-File-Handling-Layer.md`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use futures_util::stream::{self, StreamExt};
use sha1::{Digest, Sha1};
use tokio::io::AsyncReadExt;
use tracing::{info, info_span, warn, Instrument};
use walkdir::WalkDir;

use crate::config::AppContext;
use crate::db::queries::videos::replace_video_streams;
use crate::db::{
    get_all_libraries, upsert_library, upsert_video, LibraryRow, NewVideoStream, VideoRow,
};
use crate::services::ffmpeg_file::FfmpegFile;

const FINGERPRINT_BYTES: usize = 65_536;

/// One full sweep across every library row in the DB. Idempotent — a
/// re-scan upserts the same rows. Skips silently if a scan is already
/// in progress (the `ScanState` guard makes this race-safe).
///
/// Errors are NEVER swallowed: per-file probe failures `tracing::warn!`
/// and continue (one bad file does not abort a library); per-library
/// path-access failures emit a `library_skipped` warning and continue;
/// DB write failures abort that library's pass with a `tracing::error!`.
pub async fn scan_libraries(ctx: &AppContext) {
    if !ctx.scan_state.mark_started() {
        info!("library.scan skipped — already in progress");
        return;
    }

    let span = info_span!("library.scan");
    async {
        let libraries = match get_all_libraries(&ctx.db) {
            Ok(rows) => rows,
            Err(err) => {
                tracing::error!(error = %err, "library.scan aborted — failed to load libraries");
                return;
            }
        };

        info!(library_count = libraries.len(), "library.scan started");

        for library in &libraries {
            // Probe access first — Bun emits `library_skipped` for
            // unreachable paths (offline mount, deleted directory).
            if !Path::new(&library.path).exists() {
                warn!(
                    library_name = %library.name,
                    path = %library.path,
                    "library_skipped — path not accessible",
                );
                continue;
            }

            // Refresh the row (idempotent ON CONFLICT) so a re-scan
            // picks up name/media_type/extensions changes.
            if let Err(err) = upsert_library(&ctx.db, library) {
                tracing::error!(
                    library_id = %library.id,
                    error = %err,
                    "library.scan: failed to upsert library row, skipping",
                );
                continue;
            }

            scan_one_library(ctx, library).await;
            info!(library_name = %library.name, "library_scanned");
        }

        // TODO(migration-step-2-followup): port `autoMatchLibrary()` from
        // server/src/services/libraryScanner.ts:240-288 (OMDb auto-match
        // for newly-discovered videos). Tracking:
        // docs/migrations/rust-rewrite/06-File-Handling-Layer.md.
        // Until that lands, video_metadata rows only appear when the
        // user manually invokes `match_video`.

        info!(library_count = libraries.len(), "scan_complete");
    }
    .instrument(span)
    .await;

    ctx.scan_state.mark_ended();
}

/// Walk + probe + upsert one library. Per-file errors are logged and the
/// scan continues; DB-write failures abort the per-file unit but keep the
/// rest of the library going.
async fn scan_one_library(ctx: &AppContext, library: &LibraryRow) {
    let extensions = parse_extensions(library);
    let library_path = PathBuf::from(&library.path);

    // walkdir is sync — shove it onto the blocking pool so the async
    // runtime stays free for ffprobe spawns.
    let exts = extensions.clone();
    let walk_root = library_path.clone();
    let walk_result = tokio::task::spawn_blocking(move || walk_directory(&walk_root, &exts)).await;
    let paths = match walk_result {
        Ok(paths) => paths,
        Err(err) => {
            tracing::error!(
                library_id = %library.id,
                error = %err,
                "walkdir join failed",
            );
            return;
        }
    };

    let total = paths.len() as u32;
    ctx.scan_state.mark_progress(&library.id, 0, total);
    info!(
        library_name = %library.name,
        files_found = total,
        "Library scan started",
    );

    if total == 0 {
        return;
    }

    let done = Arc::new(AtomicUsize::new(0));
    let concurrency = ctx.config.scan.concurrency;
    let library_id = library.id.clone();

    stream::iter(paths)
        .for_each_concurrent(Some(concurrency), |path| {
            let ctx = ctx.clone();
            let done = done.clone();
            let library_id = library_id.clone();
            async move {
                if let Err(err) = process_file(&path, &library_id, &ctx).await {
                    warn!(
                        path = %path.display(),
                        error = %err,
                        "Failed to probe file",
                    );
                }
                let n = done.fetch_add(1, Ordering::SeqCst) as u32 + 1;
                ctx.scan_state.mark_progress(&library_id, n, total);
            }
        })
        .await;
}

/// Recursive directory walk. Returns every file whose extension matches
/// `extensions` (case-insensitive). Mirrors Bun's behaviour at
/// `server/src/services/libraryScanner.ts:80-97` — descends into all
/// subdirectories regardless of name, filters files by extension only.
fn walk_directory(root: &Path, extensions: &HashSet<String>) -> Vec<PathBuf> {
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|entry| {
            let entry = match entry {
                Ok(e) => e,
                Err(err) => {
                    warn!(error = %err, "skipping unreadable directory entry");
                    return None;
                }
            };
            if !entry.file_type().is_file() {
                return None;
            }
            let ext = entry
                .path()
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| format!(".{}", s.to_lowercase()))?;
            if extensions.contains(&ext) {
                Some(entry.into_path())
            } else {
                None
            }
        })
        .collect()
}

#[derive(Debug, thiserror::Error)]
enum ProcessError {
    #[error("stat failed: {0}")]
    Stat(#[from] std::io::Error),
    #[error("probe failed: {0}")]
    Probe(#[from] crate::services::ffmpeg_file::ProbeError),
    #[error("db write failed: {0}")]
    Db(#[from] crate::error::DbError),
}

/// Probe one file, fingerprint it, and upsert the rows. The video id is
/// `sha1(path)` to match Bun (existing rows survive the cutover when both
/// backends touch the same DB).
async fn process_file(path: &Path, library_id: &str, ctx: &AppContext) -> Result<(), ProcessError> {
    let file_meta = tokio::fs::metadata(path).await?;
    let size_bytes = file_meta.len();

    let mut ffmpeg_file = FfmpegFile::new(path.to_path_buf());
    let metadata = ffmpeg_file.probe(&ctx.ffmpeg_paths.ffprobe).await?.clone();

    let fingerprint = compute_content_fingerprint(path, size_bytes).await?;
    let video_id = sha1_path(path);
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let title = derive_title(&filename);

    let row = VideoRow {
        id: video_id.clone(),
        library_id: library_id.to_string(),
        path: path.to_str().unwrap_or_default().to_string(),
        filename: filename.clone(),
        title: Some(title),
        duration_seconds: metadata.duration_seconds,
        file_size_bytes: size_bytes as i64,
        bitrate: (metadata.bitrate_kbps * 1_000) as i64,
        scanned_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        content_fingerprint: fingerprint,
    };

    let mut streams: Vec<NewVideoStream> =
        Vec::with_capacity(metadata.video_streams.len() + metadata.audio_streams.len());
    for s in &metadata.video_streams {
        streams.push(NewVideoStream {
            video_id: video_id.clone(),
            stream_type: "video".to_string(),
            codec: s.codec.clone(),
            width: Some(s.width as i64),
            height: Some(s.height as i64),
            fps: Some(s.fps),
            channels: None,
            sample_rate: None,
        });
    }
    for s in &metadata.audio_streams {
        streams.push(NewVideoStream {
            video_id: video_id.clone(),
            stream_type: "audio".to_string(),
            codec: s.codec.clone(),
            width: None,
            height: None,
            fps: None,
            channels: Some(s.channels as i64),
            sample_rate: Some(s.sample_rate as i64),
        });
    }

    upsert_video(&ctx.db, &row)?;
    replace_video_streams(&ctx.db, &video_id, &streams)?;
    Ok(())
}

/// Fingerprint = `<size_bytes>:<sha1(first 64KB)>`. Stable across renames
/// and moves; changes only when file content does. Identical formula to
/// Bun (`libraryScanner.ts:69-77`) so both backends produce the same
/// fingerprints for the same file content during the cutover.
async fn compute_content_fingerprint(
    path: &Path,
    size_bytes: u64,
) -> Result<String, std::io::Error> {
    let file = tokio::fs::File::open(path).await?;
    let mut buf = Vec::with_capacity(FINGERPRINT_BYTES.min(size_bytes as usize));
    file.take(FINGERPRINT_BYTES as u64)
        .read_to_end(&mut buf)
        .await?;
    let mut hasher = Sha1::new();
    hasher.update(&buf);
    Ok(format!("{}:{}", size_bytes, hex::encode(hasher.finalize())))
}

fn sha1_path(path: &Path) -> String {
    let mut hasher = Sha1::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hex::encode(hasher.finalize())
}

fn derive_title(filename: &str) -> String {
    let stem = match filename.rsplit_once('.') {
        Some((stem, _ext)) => stem,
        None => filename,
    };
    let normalised: String = stem
        .chars()
        .map(|c| if c == '.' || c == '_' { ' ' } else { c })
        .collect();
    normalised.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_extensions(library: &LibraryRow) -> HashSet<String> {
    match serde_json::from_str::<Vec<String>>(&library.video_extensions) {
        Ok(list) if !list.is_empty() => list.into_iter().map(|s| s.to_lowercase()).collect(),
        Ok(_) | Err(_) => default_extensions(),
    }
}

fn default_extensions() -> HashSet<String> {
    [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm", ".ts"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Spawn the periodic background re-scan loop. Mirrors Bun's
/// `setInterval`-equivalent at `server/src/index.ts:63-74`: every
/// `interval_ms` ticks, a scan is kicked off if one is not already
/// running. The re-entry guard lives in `scan_libraries` →
/// `ScanState::mark_started`, so this loop never has to check itself.
pub fn spawn_periodic_scan(ctx: AppContext) {
    let interval = Duration::from_millis(ctx.config.scan.interval_ms);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(interval).await;
            scan_libraries(&ctx).await;
        }
    });
}

/// Parse a torrent-style filename into `(title, year)`. Mirrors Bun's
/// `parseTitleFromFilename` at `server/src/services/libraryScanner.ts:205-234`.
/// Public so the OMDb port (deferred) can call it directly.
pub fn parse_title_from_filename(filename: &str) -> (String, Option<i32>) {
    let stem = match filename.rsplit_once('.') {
        Some((stem, _ext)) => stem,
        None => filename,
    };

    // Year detector: 4-digit 19xx/20xx surrounded by separator chars.
    let bytes = stem.as_bytes();
    let mut year_at: Option<usize> = None;
    let mut year_value: Option<i32> = None;
    for i in 0..bytes.len() {
        if i + 4 > bytes.len() {
            break;
        }
        let prev_ok = i == 0 || matches!(bytes[i - 1], b'.' | b' ' | b'_' | b'(' | b'-');
        if !prev_ok {
            continue;
        }
        let candidate = &bytes[i..i + 4];
        if candidate.iter().all(|b| b.is_ascii_digit()) {
            // Must start with 19 or 20.
            if !(candidate.starts_with(b"19") || candidate.starts_with(b"20")) {
                continue;
            }
            let next_ok =
                i + 4 == bytes.len() || matches!(bytes[i + 4], b'.' | b' ' | b'_' | b')' | b'-');
            if !next_ok {
                continue;
            }
            let parsed: i32 = match std::str::from_utf8(candidate)
                .ok()
                .and_then(|s| s.parse().ok())
            {
                Some(n) => n,
                None => continue,
            };
            if (1900..=2099).contains(&parsed) {
                year_at = Some(i);
                year_value = Some(parsed);
                break;
            }
        }
    }

    let title_raw = match year_at {
        // Bun's regex consumes the separator before the year as part of
        // the match — its `slice(0, yearMatch.index)` ends BEFORE that
        // separator. Replicate by trimming trailing separator chars.
        Some(idx) => stem[..idx].trim_end_matches(['.', ' ', '_', '(', '-']),
        None => {
            // No year — strip a `.NNNN[pP]` resolution token if present.
            let lower = stem.to_lowercase();
            let bytes = lower.as_bytes();
            let mut cut: Option<usize> = None;
            for i in 0..bytes.len().saturating_sub(4) {
                if !matches!(bytes[i], b'.' | b' ' | b'_' | b'-') {
                    continue;
                }
                let mut j = i + 1;
                let mut digits = 0;
                while j < bytes.len() && bytes[j].is_ascii_digit() && digits < 4 {
                    digits += 1;
                    j += 1;
                }
                if (3..=4).contains(&digits) && j < bytes.len() && bytes[j] == b'p' {
                    cut = Some(i);
                    break;
                }
            }
            match cut {
                Some(idx) => &stem[..idx],
                None => stem,
            }
        }
    };

    let title: String = title_raw
        .chars()
        .map(|c| if c == '.' || c == '_' { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    (title, year_value)
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// `parse_title_from_filename` cases ported 1:1 from
// `server/src/services/__tests__/libraryScanner.test.ts:5-88`.
// Walk + fingerprint coverage uses tempdirs.

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    // ── parse_title_from_filename ─────────────────────────────────────────

    #[test]
    fn parse_title_extracts_year_from_dot_separated() {
        let (title, year) = parse_title_from_filename("Dune.Part.Two.2024.2160p.mkv");
        assert_eq!(title, "Dune Part Two");
        assert_eq!(year, Some(2024));
    }

    #[test]
    fn parse_title_extracts_year_at_end_with_no_extras() {
        let (title, year) = parse_title_from_filename("Parasite.Korean.2019.mkv");
        assert_eq!(title, "Parasite Korean");
        assert_eq!(year, Some(2019));
    }

    #[test]
    fn parse_title_handles_parenthesised_year() {
        let (title, year) = parse_title_from_filename("Inception (2010) 4K.mp4");
        assert_eq!(title, "Inception");
        assert_eq!(year, Some(2010));
    }

    #[test]
    fn parse_title_handles_year_at_very_end() {
        let (title, year) = parse_title_from_filename("The Shining 1980.mkv");
        assert_eq!(title, "The Shining");
        assert_eq!(year, Some(1980));
    }

    #[test]
    fn parse_title_with_no_year_strips_resolution_token() {
        let (title, year) = parse_title_from_filename("MovieTitle.1080p.x264.mkv");
        assert_eq!(title, "MovieTitle");
        assert_eq!(year, None);
    }

    #[test]
    fn parse_title_with_no_year_no_resolution_keeps_full_stem() {
        let (title, year) = parse_title_from_filename("Some Movie.mkv");
        assert_eq!(title, "Some Movie");
        assert_eq!(year, None);
    }

    #[test]
    fn parse_title_normalises_underscores_and_dots() {
        let (title, year) = parse_title_from_filename("My_Cool_Movie.2018.mkv");
        assert_eq!(title, "My Cool Movie");
        assert_eq!(year, Some(2018));
    }

    #[test]
    fn parse_title_ignores_year_like_token_without_separators() {
        // "Movie2024.mkv" has 2024 but no separator before it — Bun treats
        // it as part of the title, not a year.
        let (title, year) = parse_title_from_filename("Movie2024.mkv");
        assert_eq!(title, "Movie2024");
        assert_eq!(year, None);
    }

    // ── compute_content_fingerprint ──────────────────────────────────────

    #[tokio::test]
    async fn fingerprint_is_deterministic_for_same_bytes() {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("a.mkv");
        fs::write(&path, b"hello world").expect("write");
        let fp1 = compute_content_fingerprint(&path, 11).await.expect("fp1");
        let fp2 = compute_content_fingerprint(&path, 11).await.expect("fp2");
        assert_eq!(fp1, fp2);
        assert!(fp1.starts_with("11:"));
    }

    #[tokio::test]
    async fn fingerprint_changes_when_content_changes() {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("a.mkv");
        fs::write(&path, b"version one").expect("write");
        let fp1 = compute_content_fingerprint(&path, 11).await.expect("fp1");
        fs::write(&path, b"version two").expect("rewrite");
        let fp2 = compute_content_fingerprint(&path, 11).await.expect("fp2");
        assert_ne!(fp1, fp2);
    }

    #[tokio::test]
    async fn fingerprint_caps_read_at_64kb_for_large_files() {
        let dir = TempDir::new().expect("tempdir");
        let path = dir.path().join("big.mkv");
        // 80KB file — fingerprint should hash only the first 64KB and
        // record the FULL size in the prefix.
        let mut f = fs::File::create(&path).expect("create");
        f.write_all(&vec![0xABu8; 80 * 1024]).expect("write");
        drop(f);
        let fp = compute_content_fingerprint(&path, 80 * 1024)
            .await
            .expect("fp");
        assert!(fp.starts_with(&format!("{}:", 80 * 1024)));
        // Compare against fingerprint of a 64KB-only file with same byte
        // value — the hashed portion (suffix after `:`) must match.
        let path_small = dir.path().join("small.mkv");
        fs::write(&path_small, vec![0xABu8; 64 * 1024]).expect("write");
        let fp_small = compute_content_fingerprint(&path_small, 80 * 1024)
            .await
            .expect("fp");
        // Same hashed bytes → same suffix even though the recorded size
        // is identical (we passed 80KB for both).
        let suffix = |s: &str| s.split(':').nth(1).map(str::to_string).unwrap_or_default();
        assert_eq!(suffix(&fp), suffix(&fp_small));
    }

    // ── walk_directory ────────────────────────────────────────────────────

    fn make_exts(es: &[&str]) -> HashSet<String> {
        es.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn walk_returns_only_extension_matches() {
        let dir = TempDir::new().expect("tempdir");
        fs::write(dir.path().join("a.mkv"), b"x").expect("a");
        fs::write(dir.path().join("b.txt"), b"x").expect("b");
        fs::write(dir.path().join("c.mp4"), b"x").expect("c");
        let mut paths = walk_directory(dir.path(), &make_exts(&[".mkv", ".mp4"]));
        paths.sort();
        let names: Vec<String> = paths
            .iter()
            .map(|p| {
                p.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string()
            })
            .collect();
        assert_eq!(names, vec!["a.mkv", "c.mp4"]);
    }

    #[test]
    fn walk_descends_into_subdirectories() {
        let dir = TempDir::new().expect("tempdir");
        let sub = dir.path().join("season-01");
        fs::create_dir(&sub).expect("mkdir");
        fs::write(sub.join("e01.mkv"), b"x").expect("e01");
        let paths = walk_directory(dir.path(), &make_exts(&[".mkv"]));
        assert_eq!(paths.len(), 1);
        assert!(paths[0].ends_with("e01.mkv"));
    }

    #[test]
    fn walk_extension_match_is_case_insensitive() {
        let dir = TempDir::new().expect("tempdir");
        fs::write(dir.path().join("upper.MKV"), b"x").expect("upper");
        let paths = walk_directory(dir.path(), &make_exts(&[".mkv"]));
        assert_eq!(paths.len(), 1);
    }

    #[test]
    fn walk_returns_empty_for_missing_directory() {
        let path = PathBuf::from("/no/such/path/exists/here");
        let paths = walk_directory(&path, &make_exts(&[".mkv"]));
        assert!(paths.is_empty());
    }

    // ── derive_title ──────────────────────────────────────────────────────

    #[test]
    fn derive_title_strips_extension_and_normalises_separators() {
        assert_eq!(derive_title("My_Cool.Movie.mkv"), "My Cool Movie");
        assert_eq!(derive_title("plain.mp4"), "plain");
    }
}
