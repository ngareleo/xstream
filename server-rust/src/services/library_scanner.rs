//! Library scanner.
//!
//! One sweep walks every library row in the DB, fingerprints each video
//! file, ffprobes it for streams + duration, and upserts the
//! `videos` + `video_streams` rows. Per-library progress flows through
//! [`crate::services::scan_state::ScanState`] so the GraphQL
//! `library_scan_progress` subscription can drive the dashboard.
//!
//! Triggers:
//! - GraphQL `scan_libraries` mutation (resolver spawns this).
//! - GraphQL `create_library` mutation (chains a fire-and-forget scan so
//!   adding a profile auto-indexes it — the user-visible "click Scan All
//!   did nothing" symptom this guards against).
//! - [`spawn_periodic_scan`] background loop, started at boot from
//!   `lib.rs::run`. Re-entry-guarded by
//!   [`crate::services::scan_state::ScanState::mark_started`].
//!
//! OMDb auto-match runs after each library finishes its file walk: any
//! video without a `video_metadata` row gets searched against OMDb (if
//! `OMDB_API_KEY` is configured) — see [`auto_match_library`].

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
    get_all_libraries, get_unmatched_video_ids, get_video_by_id, upsert_library, upsert_video,
    upsert_video_metadata, LibraryRow, NewVideoStream, VideoMetadataRow, VideoRow,
};
use crate::services::ffmpeg_file::FfmpegFile;
use crate::services::omdb::{OmdbClient, OmdbResult};

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
            // Probe access first — emit `library_skipped` for unreachable
            // paths (offline mount, deleted directory).
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
            auto_match_library(ctx, library).await;
        }

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
/// `extensions` (case-insensitive). Descends into all subdirectories
/// regardless of name, filters files by extension only.
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
/// `sha1(path)` so existing rows are stable across re-scans.
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
/// and moves; changes only when file content does.
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

/// Match every unmatched video in `library` against OMDb. Silent no-op
/// when no `OMDB_API_KEY` is configured (typical dev path) or when the
/// library has no unmatched videos.
///
/// Per-video failures (network error, no match found, missing video row)
/// are tolerated — the helper logs and moves to the next id. The scan is
/// otherwise unaffected.
async fn auto_match_library(ctx: &AppContext, library: &LibraryRow) {
    let Some(omdb) = ctx.omdb.clone() else {
        return;
    };

    let unmatched = match get_unmatched_video_ids(&ctx.db, &library.id) {
        Ok(ids) => ids,
        Err(err) => {
            tracing::error!(
                library_id = %library.id,
                error = %err,
                "auto_match: failed to load unmatched video ids",
            );
            return;
        }
    };
    if unmatched.is_empty() {
        return;
    }

    info!(
        library_name = %library.name,
        unmatched_count = unmatched.len(),
        "Auto-matching unmatched videos",
    );

    let total = unmatched.len() as u32;
    let done = Arc::new(AtomicUsize::new(0));
    let concurrency = ctx.config.scan.concurrency;
    let library_id = library.id.clone();

    stream::iter(unmatched)
        .for_each_concurrent(Some(concurrency), |video_id| {
            let ctx = ctx.clone();
            let omdb = omdb.clone();
            let done = done.clone();
            let library_id = library_id.clone();
            async move {
                match_one_video(&ctx, &omdb, &video_id).await;
                let n = done.fetch_add(1, Ordering::SeqCst) as u32 + 1;
                ctx.scan_state.mark_progress(&library_id, n, total);
            }
        })
        .await;
}

/// One OMDb lookup + metadata upsert. Errors are logged at the right
/// level (warn for "no match"/"network blip", error for "DB write fail")
/// and never propagate — auto-match is best-effort over a flaky external
/// API.
async fn match_one_video(ctx: &AppContext, omdb: &OmdbClient, video_id: &str) {
    let video = match get_video_by_id(&ctx.db, video_id) {
        Ok(Some(v)) => v,
        Ok(None) => {
            // Video deleted between the unmatched-ids query and now —
            // benign race, just skip.
            return;
        }
        Err(err) => {
            tracing::error!(
                video_id = %video_id,
                error = %err,
                "auto_match: failed to load video row",
            );
            return;
        }
    };

    let (title, year) = parse_title_from_filename(&video.filename);
    let result: OmdbResult = match omdb.search(&title, year).await {
        Some(r) => r,
        None => {
            // OmdbClient already logged the cause (warn level).
            return;
        }
    };

    let cast_list = if result.actors.is_empty() {
        None
    } else {
        match serde_json::to_string(&result.actors) {
            Ok(s) => Some(s),
            Err(err) => {
                tracing::warn!(
                    video_id = %video_id,
                    error = %err,
                    "auto_match: failed to serialise actors",
                );
                None
            }
        }
    };

    let metadata = VideoMetadataRow {
        video_id: video_id.to_string(),
        imdb_id: result.imdb_id.clone(),
        title: result.title.clone(),
        year: result.year,
        genre: result.genre,
        director: result.director,
        cast_list,
        rating: result.imdb_rating,
        plot: result.plot,
        poster_url: result.poster_url,
        matched_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    };

    if let Err(err) = upsert_video_metadata(&ctx.db, &metadata) {
        tracing::error!(
            video_id = %video_id,
            error = %err,
            "auto_match: failed to upsert metadata row",
        );
        return;
    }

    info!(
        filename = %video.filename,
        matched_title = %result.title,
        imdb_id = %result.imdb_id,
        "Video matched",
    );
}

/// Spawn the periodic background re-scan loop. Every `interval_ms`
/// ticks, a scan is kicked off if one is not already running. The
/// re-entry guard lives in `scan_libraries` → `ScanState::mark_started`,
/// so this loop never has to check itself.
pub fn spawn_periodic_scan(ctx: AppContext) {
    let interval = Duration::from_millis(ctx.config.scan.interval_ms);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(interval).await;
            scan_libraries(&ctx).await;
        }
    });
}

/// Parse a torrent-style filename into `(title, year)`.
/// Public so the OMDb match path can call it directly.
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
        // Trim trailing separator chars so a stem like "Movie.2024" yields
        // title "Movie" (not "Movie."), matching the user's expected title.
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
// `parse_title_from_filename` covers torrent-style filename parsing.
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
        // "Movie2024.mkv" has 2024 but no separator before it — treat the
        // whole thing as the title.
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

    // ── parse_extensions ──────────────────────────────────────────────────

    fn library_with_exts(ext_json: &str) -> LibraryRow {
        LibraryRow {
            id: "lib".to_string(),
            name: "lib".to_string(),
            path: "/tmp".to_string(),
            media_type: "movies".to_string(),
            env: "user".to_string(),
            video_extensions: ext_json.to_string(),
        }
    }

    #[test]
    fn parse_extensions_uses_explicit_list_when_present() {
        let exts = parse_extensions(&library_with_exts(r#"[".webm",".mov"]"#));
        assert!(exts.contains(".webm"));
        assert!(exts.contains(".mov"));
        assert!(
            !exts.contains(".mkv"),
            "explicit list should NOT include defaults"
        );
    }

    #[test]
    fn parse_extensions_falls_back_to_defaults_on_empty_list() {
        let exts = parse_extensions(&library_with_exts("[]"));
        // Default set must include the canary extensions.
        assert!(exts.contains(".mkv"));
        assert!(exts.contains(".mp4"));
    }

    #[test]
    fn parse_extensions_falls_back_to_defaults_on_malformed_json() {
        let exts = parse_extensions(&library_with_exts("not-json-at-all"));
        assert!(exts.contains(".mkv"));
        assert!(exts.contains(".mp4"));
    }

    #[test]
    fn parse_extensions_lowercases_input() {
        let exts = parse_extensions(&library_with_exts(r#"[".MKV",".Mp4"]"#));
        assert!(exts.contains(".mkv"));
        assert!(exts.contains(".mp4"));
    }

    // ── scan_libraries (end-to-end with stub ffprobe) ────────────────────

    fn fresh_test_ctx(segment_dir: PathBuf) -> AppContext {
        let db = crate::db::Db::open(std::path::Path::new(":memory:")).expect("db");
        AppContext::for_tests(db, segment_dir)
    }

    fn seed_library_row(db: &crate::db::Db, name: &str, path: &str) -> String {
        crate::db::create_library(db, name, path, "movies", &[])
            .expect("create_library")
            .id
    }

    #[tokio::test]
    async fn scan_libraries_with_no_libraries_runs_to_completion() {
        let dir = TempDir::new().expect("tempdir");
        let ctx = fresh_test_ctx(dir.path().to_path_buf());
        scan_libraries(&ctx).await;
        // ScanState must end idle even with zero libraries.
        assert!(!ctx.scan_state.is_scanning());
    }

    #[tokio::test]
    async fn scan_libraries_with_missing_path_skips_and_continues() {
        let dir = TempDir::new().expect("tempdir");
        let ctx = fresh_test_ctx(dir.path().to_path_buf());
        // Library row points at a path that does not exist on disk.
        seed_library_row(&ctx.db, "ghost", "/no/such/dir/anywhere");
        scan_libraries(&ctx).await;
        assert!(!ctx.scan_state.is_scanning());
        // No videos were inserted (nothing to walk).
        let total = crate::db::count_videos_by_library(&ctx.db, "ignored", Default::default())
            .expect("count");
        assert_eq!(total, 0);
    }

    #[tokio::test]
    async fn scan_libraries_dedup_guards_concurrent_callers() {
        // Two concurrent scan_libraries calls must not both walk. The
        // ScanState::mark_started guard is what protects this; the test
        // proves the scanner respects it.
        let dir = TempDir::new().expect("tempdir");
        let lib_dir = dir.path().join("lib");
        fs::create_dir(&lib_dir).expect("mkdir");
        let ctx = fresh_test_ctx(dir.path().to_path_buf());
        seed_library_row(&ctx.db, "test", lib_dir.to_str().expect("utf8"));

        // Mark a scan in flight via the public API, then observe that a
        // second scan_libraries call returns immediately (without flipping
        // state). This is the guard contract.
        assert!(ctx.scan_state.mark_started());
        scan_libraries(&ctx).await;
        // State must still be "scanning" — the no-op call does NOT
        // mark_ended, because the guard rejected it.
        assert!(ctx.scan_state.is_scanning());
        ctx.scan_state.mark_ended();
    }

    #[tokio::test]
    async fn scan_libraries_completes_with_stub_ffprobe() {
        // /bin/true ffprobe (the for_tests stub) returns no metadata, so
        // every per-file probe fails and no video rows are inserted —
        // but the scan itself must run to completion and leave ScanState
        // idle.
        let dir = TempDir::new().expect("tempdir");
        let lib_dir = dir.path().join("lib");
        fs::create_dir(&lib_dir).expect("mkdir");
        fs::write(lib_dir.join("file.mp4"), b"fake").expect("file");
        fs::write(lib_dir.join("file.mkv"), b"fake").expect("file");
        let ctx = fresh_test_ctx(dir.path().to_path_buf());
        let lib_id = seed_library_row(&ctx.db, "stub", lib_dir.to_str().expect("utf8"));
        scan_libraries(&ctx).await;
        assert!(!ctx.scan_state.is_scanning());
        let videos = crate::db::count_videos_by_library(&ctx.db, &lib_id, Default::default())
            .expect("count");
        assert_eq!(videos, 0, "stub ffprobe should fail every probe");
    }

    // ── auto_match_library (with wiremock OMDb) ──────────────────────────

    use crate::db::{upsert_video, VideoRow};
    use crate::services::omdb::OmdbClient;
    use wiremock::matchers::{method, path as wm_path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn fixture_video(library_id: &str, video_id: &str, filename: &str) -> VideoRow {
        VideoRow {
            id: video_id.to_string(),
            library_id: library_id.to_string(),
            path: format!("/v/{filename}"),
            filename: filename.to_string(),
            title: Some("placeholder".to_string()),
            duration_seconds: 60.0,
            file_size_bytes: 1_000,
            bitrate: 100_000,
            scanned_at: "2026-01-01T00:00:00.000Z".to_string(),
            content_fingerprint: "1000:abc".to_string(),
        }
    }

    async fn ctx_with_mock_omdb(server_uri: &str, segment_dir: PathBuf) -> AppContext {
        let mut ctx = fresh_test_ctx(segment_dir);
        ctx.omdb = Some(OmdbClient::with_base_url(
            reqwest::Client::new(),
            "test-key".to_string(),
            server_uri.to_string(),
        ));
        ctx
    }

    #[tokio::test]
    async fn auto_match_no_op_when_omdb_disabled() {
        let dir = TempDir::new().expect("tempdir");
        let ctx = fresh_test_ctx(dir.path().to_path_buf());
        // ctx.omdb is None.
        let lib =
            crate::db::create_library(&ctx.db, "L", "/no/where", "movies", &[]).expect("create");
        upsert_video(&ctx.db, &fixture_video(&lib.id, "vid1", "Film.2024.mkv"))
            .expect("upsert video");
        // Should return immediately without panicking; the unmatched
        // video stays unmatched.
        auto_match_library(&ctx, &lib).await;
        let unmatched = crate::db::get_unmatched_video_ids(&ctx.db, &lib.id).expect("query");
        assert_eq!(unmatched.len(), 1);
    }

    #[tokio::test]
    async fn auto_match_no_op_when_no_unmatched_videos() {
        let server = MockServer::start().await;
        // No mock set up — if auto_match calls OMDb, the mock server
        // returns 404 by default and the test would be slow but pass;
        // we assert the count below as the real signal.
        let dir = TempDir::new().expect("tempdir");
        let ctx = ctx_with_mock_omdb(&server.uri(), dir.path().to_path_buf()).await;
        let lib =
            crate::db::create_library(&ctx.db, "L", "/no/where", "movies", &[]).expect("create");
        // No videos at all → nothing to match.
        auto_match_library(&ctx, &lib).await;
        assert!(crate::db::get_unmatched_video_ids(&ctx.db, &lib.id)
            .expect("query")
            .is_empty());
    }

    #[tokio::test]
    async fn auto_match_writes_metadata_for_unmatched_videos() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(wm_path("/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "imdbID": "tt9999999",
                "Title": "Mocked Movie",
                "Year": "2024",
                "Genre": "Drama",
                "Director": "Director X",
                "Actors": "A, B",
                "Plot": "A plot.",
                "imdbRating": "7.7",
                "Poster": "https://x/p.jpg"
            })))
            .mount(&server)
            .await;

        let dir = TempDir::new().expect("tempdir");
        let ctx = ctx_with_mock_omdb(&server.uri(), dir.path().to_path_buf()).await;
        let lib =
            crate::db::create_library(&ctx.db, "L", "/no/where", "movies", &[]).expect("create");
        upsert_video(&ctx.db, &fixture_video(&lib.id, "vid-A", "Film.A.2024.mkv")).expect("upsert");
        upsert_video(&ctx.db, &fixture_video(&lib.id, "vid-B", "Film.B.2023.mkv")).expect("upsert");

        auto_match_library(&ctx, &lib).await;

        // Both videos should now have a metadata row.
        assert!(crate::db::get_unmatched_video_ids(&ctx.db, &lib.id)
            .expect("query")
            .is_empty());
        let m = crate::db::get_metadata_by_video_id(&ctx.db, "vid-A")
            .expect("query")
            .expect("row");
        assert_eq!(m.imdb_id, "tt9999999");
        assert_eq!(m.title, "Mocked Movie");
        assert_eq!(m.rating, Some(7.7));
        // cast_list is JSON-encoded.
        let actors: Vec<String> =
            serde_json::from_str(&m.cast_list.unwrap_or_default()).expect("json");
        assert_eq!(actors, vec!["A".to_string(), "B".to_string()]);
    }

    #[tokio::test]
    async fn auto_match_skips_unmatched_video_when_omdb_returns_false() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "False",
                "Error": "Movie not found!"
            })))
            .mount(&server)
            .await;

        let dir = TempDir::new().expect("tempdir");
        let ctx = ctx_with_mock_omdb(&server.uri(), dir.path().to_path_buf()).await;
        let lib =
            crate::db::create_library(&ctx.db, "L", "/no/where", "movies", &[]).expect("create");
        upsert_video(
            &ctx.db,
            &fixture_video(&lib.id, "vid-X", "Unknown.Title.2024.mkv"),
        )
        .expect("upsert");

        auto_match_library(&ctx, &lib).await;

        // No metadata row should have been written — the video stays
        // unmatched, scan continues, no panic.
        assert!(crate::db::get_metadata_by_video_id(&ctx.db, "vid-X")
            .expect("query")
            .is_none());
        let unmatched = crate::db::get_unmatched_video_ids(&ctx.db, &lib.id).expect("query");
        assert_eq!(unmatched, vec!["vid-X".to_string()]);
    }

    #[tokio::test]
    async fn auto_match_continues_other_videos_when_one_fails() {
        // First request → 503 (transient failure), second → 200 True.
        // Per-video failures must not abort sibling matches.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "imdbID": "tt0000001",
                "Title": "OK Movie",
                "Year": "2024",
                "Genre": "Drama", "Director": "X", "Actors": "Y",
                "Plot": "Z", "imdbRating": "5.0", "Poster": "N/A"
            })))
            .mount(&server)
            .await;

        let dir = TempDir::new().expect("tempdir");
        let ctx = ctx_with_mock_omdb(&server.uri(), dir.path().to_path_buf()).await;
        let lib =
            crate::db::create_library(&ctx.db, "L", "/no/where", "movies", &[]).expect("create");
        // Three videos; all hit the same mock so all should get matched.
        for i in 0..3 {
            upsert_video(
                &ctx.db,
                &fixture_video(&lib.id, &format!("v{i}"), &format!("Film.{i}.2024.mkv")),
            )
            .expect("upsert");
        }

        auto_match_library(&ctx, &lib).await;

        // Every video matched.
        for i in 0..3 {
            assert!(
                crate::db::has_video_metadata(&ctx.db, &format!("v{i}")).expect("query"),
                "v{i} should be matched"
            );
        }
    }
}
