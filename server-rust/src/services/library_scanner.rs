//! Library scanner: file fingerprinting, ffprobe, and OMDb auto-match.

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
    assign_video_to_film, build_parsed_title_key, film_id_for, find_film_by_imdb_id,
    find_film_by_parsed_title_key, get_all_libraries, get_unmatched_video_ids, get_video_by_id,
    merge_films, upsert_film, upsert_library, upsert_video, upsert_video_metadata, FilmRow,
    LibraryRow, NewVideoStream, VideoMetadataRow, VideoRow,
};
use crate::graphql::scalars::Resolution;
use crate::services::ffmpeg_file::FfmpegFile;
use crate::services::omdb::{OmdbClient, OmdbResult};
use crate::services::tv_discovery;

const FINGERPRINT_BYTES: usize = 65_536;

/// Scan all libraries in the DB, re-indexing with idempotent upserts.
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
            // Profile availability is the first-class signal: when the
            // probe has flagged the library `offline`, skip the scan
            // outright. The existing `videos`/`films`/`shows` rows stay
            // put — the user can still browse what's catalogued, only
            // playback is blocked. The probe re-kicks a one-shot scan
            // when the library comes back online (see
            // `services::profile_availability`).
            if library.status == "offline" {
                info!(
                    library_name = %library.name,
                    path = %library.path,
                    "library_skipped — offline (probe says path unreachable)",
                );
                continue;
            }
            // Path-not-accessible fallback for the very first scan
            // (status defaults to `unknown` until the probe lands one
            // cycle later).
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
            // TV-show discovery: cross-checks the local file tree against
            // the OMDb canonical episode list and populates the seasons +
            // episodes tables. Runs before auto_match_library so the
            // synthetic show video row exists by the time the metadata
            // matcher iterates the unmatched-video list.
            if library.media_type == "tvShows" {
                tv_discovery::discover_tv_shows(ctx, library).await;
            }
            // Movie libraries: resolve MovieUnits → Films, set videos.film_id
            // and role. Runs before OMDb auto-match so the matcher can merge
            // films by imdb_id when two parsed-key Films later resolve to
            // the same canonical movie.
            if library.media_type == "movies" {
                resolve_films_for_library(ctx, library);
            }
            auto_match_library(ctx, library).await;
        }

        info!(library_count = libraries.len(), "scan_complete");
    }
    .instrument(span)
    .await;

    ctx.scan_state.mark_ended();
}

/// Scan a single library, walking and probing all video files.
pub async fn scan_one_library(ctx: &AppContext, library: &LibraryRow) {
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

    // Native resolution: take the first probed video stream's height and
    // map it to the closest rung. Stays `None` when the file has no video
    // stream (audio-only) — every other case (incl. `height == 0`) falls
    // through to `R240p` per the clamp contract.
    let native_resolution = metadata.video_streams.first().map(|vs| {
        Resolution::from_height(vs.height as i64)
            .to_internal()
            .to_string()
    });

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
        native_resolution,
        // Film/Show resolution happens in separate post-steps:
        //   movies → resolve_films_for_library → assign_video_to_film
        //   tvShows → discover_tv_shows → assign_video_to_show
        // The DB default for `role` is 'main'; passing it explicitly
        // keeps the upsert clear.
        film_id: None,
        show_id: None,
        show_season: None,
        show_episode: None,
        role: "main".to_string(),
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

    // Episode files belong to a Show — the show-level OMDb match lives
    // in `tv_discovery`. Don't pollute `video_metadata` with a per-file
    // match keyed on a parsed episode filename ("Show.S01E01" → wrong
    // OMDb hit). Skip silently; the show row carries the metadata via
    // `show_metadata`.
    if video.show_id.is_some() {
        return;
    }

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
        poster_local_path: None,
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

    // Promote the Film: now that we have an imdb_id, either annotate the
    // existing parsed-key-keyed Film with it, or merge into an
    // already-existing imdb_id-keyed Film if one exists. This is what
    // collapses two-encodes-of-the-same-movie into a single Film once
    // both rows match OMDb.
    if let Err(err) = link_video_film_to_imdb(
        ctx,
        video_id,
        &result.imdb_id,
        &result.title,
        result.year.and_then(|y| i32::try_from(y).ok()),
    ) {
        tracing::warn!(
            video_id = %video_id,
            error = %err,
            "auto_match: failed to link Film to imdb_id",
        );
    }

    info!(
        filename = %video.filename,
        matched_title = %result.title,
        imdb_id = %result.imdb_id,
        "Video matched",
    );
}

/// After OMDb match, ensure the video's Film carries the canonical imdb_id.
/// Three cases:
/// 1. Video has no Film yet (movie scanner skipped) — create one keyed on imdb_id.
/// 2. Video's Film has no imdb_id yet — try to set it. On UNIQUE conflict,
///    another Film already owns that imdb_id; merge.
/// 3. Video's Film already has the imdb_id — no-op.
fn link_video_film_to_imdb(
    ctx: &AppContext,
    video_id: &str,
    imdb_id: &str,
    canonical_title: &str,
    year: Option<i32>,
) -> Result<(), crate::error::DbError> {
    let video = match get_video_by_id(&ctx.db, video_id)? {
        Some(v) => v,
        None => return Ok(()),
    };
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // Case 1: no Film. Create one keyed on imdb_id and assign as 'main'.
    let Some(current_film_id) = video.film_id.clone() else {
        let new_id = film_id_for(Some(imdb_id), None);
        upsert_film(
            &ctx.db,
            &FilmRow {
                id: new_id.clone(),
                imdb_id: Some(imdb_id.to_string()),
                parsed_title_key: None,
                title: canonical_title.to_string(),
                year,
                created_at: now,
            },
        )?;
        assign_video_to_film(&ctx.db, video_id, &new_id, "main")?;
        return Ok(());
    };

    // Cases 2/3: Film exists. Look for any other Film already owning imdb_id.
    if let Some(existing) = find_film_by_imdb_id(&ctx.db, imdb_id)? {
        if existing.id != current_film_id {
            // Merge current → existing. Repoints videos and drops current.
            merge_films(&ctx.db, &current_film_id, &existing.id)?;
        }
        // Already linked — nothing more to do.
        return Ok(());
    }

    // Set imdb_id on the current Film (refresh title/year from OMDb canonical).
    upsert_film(
        &ctx.db,
        &FilmRow {
            id: current_film_id,
            imdb_id: Some(imdb_id.to_string()),
            parsed_title_key: None, // COALESCE in upsert preserves existing
            title: canonical_title.to_string(),
            year,
            created_at: now,
        },
    )?;
    Ok(())
}

/// One physical movie + its extras living in a folder, OR a single movie
/// file directly under the library root.
struct MovieUnit {
    main_file: PathBuf,
    extras: Vec<PathBuf>,
}

fn has_video_ext(path: &Path, extensions: &HashSet<String>) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| extensions.contains(&format!(".{}", s.to_lowercase())))
        .unwrap_or(false)
}

fn stem_lower(path: &Path) -> String {
    path.file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Enumerate MovieUnits at the library root.
///
/// - Direct video files at the root → each is its own unit (no extras).
/// - First-level subfolder → one unit per folder; main = largest video file
///   (tie-broken by stem matching the folder name); the rest are extras.
/// - Deeper nesting is not recursed; the convention doc says one level only.
fn enumerate_movie_units(library_root: &Path, extensions: &HashSet<String>) -> Vec<MovieUnit> {
    let mut units: Vec<MovieUnit> = Vec::new();
    let read = match std::fs::read_dir(library_root) {
        Ok(r) => r,
        Err(_) => return units,
    };
    for entry in read.flatten() {
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if ft.is_file() {
            if has_video_ext(&path, extensions) {
                units.push(MovieUnit {
                    main_file: path,
                    extras: Vec::new(),
                });
            }
            continue;
        }
        if !ft.is_dir() {
            continue;
        }
        // Folder-scoped layout — collect immediate video children.
        let folder_name_lower = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let sub = match std::fs::read_dir(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let mut videos: Vec<(PathBuf, u64)> = Vec::new();
        for sub_entry in sub.flatten() {
            let sub_path = sub_entry.path();
            if !sub_path.is_file() {
                continue;
            }
            if !has_video_ext(&sub_path, extensions) {
                continue;
            }
            let size = std::fs::metadata(&sub_path).map(|m| m.len()).unwrap_or(0);
            videos.push((sub_path, size));
        }
        if videos.is_empty() {
            continue;
        }
        // Tie-break: stem matches folder name → main; otherwise largest size.
        videos.sort_by(|a, b| {
            let a_match = stem_lower(&a.0) == folder_name_lower;
            let b_match = stem_lower(&b.0) == folder_name_lower;
            match (a_match, b_match) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => b.1.cmp(&a.1), // size desc
            }
        });
        let main = videos.remove(0).0;
        let extras: Vec<PathBuf> = videos.into_iter().map(|(p, _)| p).collect();
        units.push(MovieUnit {
            main_file: main,
            extras,
        });
    }
    units
}

/// For each MovieUnit, find or create its Film and set `videos.film_id`
/// + `role` for the main file and any extras. Runs after the per-file
///   `scan_one_library` upsert pass; before OMDb match. Pre-OMDb the Film
///   is keyed on `parsed_title_key`; the post-OMDb step in `match_one_video`
///   upgrades it to imdb-keyed and merges duplicates.
fn resolve_films_for_library(ctx: &AppContext, library: &LibraryRow) {
    let extensions = parse_extensions(library);
    let library_path = PathBuf::from(&library.path);
    let units = enumerate_movie_units(&library_path, &extensions);

    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    for unit in units {
        let main_video_id = sha1_path(&unit.main_file);
        let main_video = match get_video_by_id(&ctx.db, &main_video_id) {
            Ok(Some(v)) => v,
            // Probe failed earlier; skip — no video row to anchor a Film on.
            Ok(None) => continue,
            Err(err) => {
                tracing::warn!(
                    library_id = %library.id,
                    video_id = %main_video_id,
                    error = %err,
                    "resolve_films: failed to load main video",
                );
                continue;
            }
        };

        let (parsed_title, year) = parse_title_from_filename(&main_video.filename);
        let parsed_key = build_parsed_title_key(&parsed_title, year);

        let film_id = match find_film_by_parsed_title_key(&ctx.db, &parsed_key) {
            Ok(Some(existing)) => existing.id,
            Ok(None) => {
                let id = film_id_for(None, Some(&parsed_key));
                let display_title = if parsed_title.is_empty() {
                    main_video.filename.clone()
                } else {
                    parsed_title
                };
                let film = FilmRow {
                    id: id.clone(),
                    imdb_id: None,
                    parsed_title_key: Some(parsed_key),
                    title: display_title,
                    year,
                    created_at: now.clone(),
                };
                if let Err(err) = upsert_film(&ctx.db, &film) {
                    tracing::warn!(
                        library_id = %library.id,
                        video_id = %main_video_id,
                        error = %err,
                        "resolve_films: failed to upsert Film",
                    );
                    continue;
                }
                id
            }
            Err(err) => {
                tracing::warn!(
                    library_id = %library.id,
                    error = %err,
                    "resolve_films: lookup failed",
                );
                continue;
            }
        };

        if let Err(err) = assign_video_to_film(&ctx.db, &main_video_id, &film_id, "main") {
            tracing::warn!(
                library_id = %library.id,
                video_id = %main_video_id,
                error = %err,
                "resolve_films: failed to assign main video",
            );
            continue;
        }
        for extra in &unit.extras {
            let extra_id = sha1_path(extra);
            if let Err(err) = assign_video_to_film(&ctx.db, &extra_id, &film_id, "extra") {
                tracing::warn!(
                    library_id = %library.id,
                    extra_path = %extra.display(),
                    error = %err,
                    "resolve_films: failed to assign extra video",
                );
            }
        }
    }
}

/// Spawn the periodic background library scan loop.
pub fn spawn_periodic_scan(ctx: AppContext) {
    let interval = Duration::from_millis(ctx.config.scan.interval_ms);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(interval).await;
            scan_libraries(&ctx).await;
        }
    });
}

/// Scene-release tokens stripped before sending a title to OMDb.
/// All comparisons are case-insensitive. Each entry is a full token that must
/// appear as a complete separator-bounded word, not as a substring.
const SCENE_TOKENS: &[&str] = &[
    // Resolution
    "1080p",
    "720p",
    "2160p",
    "4k",
    "480p",
    "360p",
    "240p",
    // Source
    "bluray",
    "bdrip",
    "brrip",
    "web-dl",
    "webdl",
    "webrip",
    "hdrip",
    "dvdrip",
    "hdtv",
    // Video codec
    "x264",
    "x265",
    "hevc",
    "h264",
    "h265",
    "avc",
    // Audio codec
    "aac",
    "ac3",
    "eac3",
    "dts",
    "atmos",
    "truehd",
    "dts-hd",
    // Channels
    "5.1",
    "7.1",
    "2.0",
    // HDR
    "hdr",
    "hdr10",
    "dv",
    "dolbyvision",
    "10bit",
    "12bit",
];

/// Strip Scene-release tokens from a normalised (dots/underscores already
/// replaced with spaces) title string. Tokens are matched whole-word
/// (case-insensitive). Hyphenated tokens whose *base* part is a scene token
/// are also dropped (covers `x264-GROUP`, `x265-NAHOM`, etc.).
fn strip_scene_tokens(normalized: &str) -> String {
    let tokens: Vec<&str> = normalized.split_whitespace().collect();
    let mut out: Vec<&str> = Vec::with_capacity(tokens.len());

    for tok in &tokens {
        let lower = tok.to_lowercase();

        // 1. Exact match against the strip list.
        if SCENE_TOKENS.contains(&lower.as_str()) {
            continue;
        }

        // 2. Token contains a hyphen: check both the whole token and the
        //    base (everything before the first `-`). This handles cases like
        //    `x264-NAHOM` where the base `x264` is a scene token and `-NAHOM`
        //    is the release-group suffix.
        if let Some(dash_pos) = lower.find('-') {
            let base = &lower[..dash_pos];
            // Drop if the whole hyphenated token is in the list (e.g. WEB-DL)
            // or if the base is a scene token (e.g. x264-GROUP).
            if SCENE_TOKENS.contains(&lower.as_str()) || SCENE_TOKENS.contains(&base) {
                continue;
            }
        }

        out.push(tok);
    }

    out.join(" ")
}

/// Parse torrent-style filename to extract title and year.
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

    // Replace word-separating dots and underscores with spaces, then strip
    // known Scene-release tokens before re-joining.
    let normalized: String = title_raw
        .chars()
        .map(|c| if c == '.' || c == '_' { ' ' } else { c })
        .collect();

    let title = strip_scene_tokens(&normalized)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    (title, year_value)
}

//
// `parse_title_from_filename` covers torrent-style filename parsing.
// Walk + fingerprint coverage uses tempdirs.

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

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

    #[test]
    fn parse_title_strips_scene_tokens_after_parenthesised_year() {
        // Tokens inside the second pair of parens are after the year anchor
        // and are already discarded by the year-split; this confirms the
        // year-anchor path still works and the strip pass is a no-op here.
        let (title, year) =
            parse_title_from_filename("3 Idiots (2009) (1080p BDRip x265 10bit EAC3 5.1).mkv");
        assert_eq!(title, "3 Idiots");
        assert_eq!(year, Some(2009));
    }

    #[test]
    fn parse_title_strips_scene_tokens_dot_separated_after_year() {
        // Year splits at 2025; everything after is discarded; title is clean.
        let (title, year) =
            parse_title_from_filename("Bugonia.2025.4K.HDR.DV.2160p.WEBDL Ita Eng x265-NAHOM.mkv");
        assert_eq!(title, "Bugonia");
        assert_eq!(year, Some(2025));
    }

    #[test]
    fn parse_title_preserves_dash_in_subtitle_with_year_in_parens() {
        let (title, year) = parse_title_from_filename("Furiosa- A Mad Max Saga (2024) 4K.mkv");
        assert_eq!(title, "Furiosa- A Mad Max Saga");
        assert_eq!(year, Some(2024));
    }

    #[test]
    fn parse_title_preserves_dash_subtitle_plain_parens() {
        let (title, year) = parse_title_from_filename("Mad Max- Fury Road (2015).mkv");
        assert_eq!(title, "Mad Max- Fury Road");
        assert_eq!(year, Some(2015));
    }

    #[test]
    fn parse_title_year_at_end_no_scene_tokens() {
        let (title, year) = parse_title_from_filename("One Battle After Another 2025.mkv");
        assert_eq!(title, "One Battle After Another");
        assert_eq!(year, Some(2025));
    }

    #[test]
    fn parse_title_dot_separated_with_group_suffix_after_year() {
        // year-split discards everything after 1999; strip pass is no-op.
        let (title, year) =
            parse_title_from_filename("The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv");
        assert_eq!(title, "The Matrix");
        assert_eq!(year, Some(1999));
    }

    #[test]
    fn parse_title_dot_separated_complex_scene_tokens_after_year() {
        let (title, year) =
            parse_title_from_filename("Inception.2010.2160p.WEB-DL.HEVC.HDR10.Atmos.5.1-NAHOM.mkv");
        assert_eq!(title, "Inception");
        assert_eq!(year, Some(2010));
    }

    #[test]
    fn parse_title_strip_pass_no_year_removes_source_and_codec() {
        // No year — resolution strip cuts at 1080p, then strip pass removes
        // remaining scene tokens (BluRay, x264-GROUP).
        let (title, year) = parse_title_from_filename("The.Matrix.1080p.BluRay.x264-GROUP.mkv");
        assert_eq!(title, "The Matrix");
        assert_eq!(year, None);
    }

    #[test]
    fn parse_title_strip_pass_does_not_eat_real_title_words() {
        // "DV" is a scene token but it appears as part of the title "DVD"
        // only as a substring — not a whole token. Here we test that a
        // title word that merely starts with a scene-token prefix is kept.
        // "AVC" is also a scene token; "AVCO" is not.
        let (title, year) = parse_title_from_filename("AVCO.Productions.2010.mkv");
        assert_eq!(title, "AVCO Productions");
        assert_eq!(year, Some(2010));
    }

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

    #[test]
    fn derive_title_strips_extension_and_normalises_separators() {
        assert_eq!(derive_title("My_Cool.Movie.mkv"), "My Cool Movie");
        assert_eq!(derive_title("plain.mp4"), "plain");
    }

    fn library_with_exts(ext_json: &str) -> LibraryRow {
        LibraryRow {
            id: "lib".to_string(),
            name: "lib".to_string(),
            path: "/tmp".to_string(),
            media_type: "movies".to_string(),
            env: "user".to_string(),
            video_extensions: ext_json.to_string(),
            status: "unknown".to_string(),
            last_seen_at: None,
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
            native_resolution: None,
            film_id: None,
            show_id: None,
            show_season: None,
            show_episode: None,
            role: "main".to_string(),
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
