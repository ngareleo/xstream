//! Background poster fetcher; downloads each OMDb poster once and writes one WebP variant per `PosterSize`. See docs/architecture/Library-Scan/05-Poster-Caching.md.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::{self, StreamExt};
use image::imageops::FilterType;
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tracing::{info, info_span, warn, Instrument};

use crate::config::AppContext;
use crate::db::{
    list_shows_needing_poster_download, list_videos_needing_poster_download,
    set_show_poster_local_path, set_video_poster_local_path,
};
use crate::graphql::scalars::PosterSize;

/// libwebp lossy quality. 75 is the standard "indistinguishable from
/// source at typical poster sizes" point and keeps each variant in the
/// 25-40 KB range for a 2:3 poster.
const WEBP_QUALITY: f32 = 75.0;

/// Pixel width we request from Amazon's `m.media-amazon.com` CDN. Must
/// be ≥ the largest `PosterSize` so every variant downscales from the
/// source rather than upscaling from a 300px default.
const SOURCE_FETCH_WIDTH: u32 = 3200;

/// How often the worker wakes up to look for new pending downloads.
const POLL_INTERVAL: Duration = Duration::from_secs(15);
/// Maximum simultaneous in-flight HTTP requests. Modest — we don't want
/// to flood OMDb's CDN or the user's network.
const MAX_CONCURRENCY: usize = 4;

#[derive(Clone, Copy, Debug)]
enum Owner {
    Video,
    Show,
}

#[derive(Clone, Debug)]
struct PendingPoster {
    owner: Owner,
    owner_id: String,
    url: String,
}

/// One poll cycle: enumerate the rows needing posters, dedup by URL
/// (two films with the same poster_url share one HTTP fetch), download
/// each into the cache directory, then update each row.
pub async fn poll_once(
    ctx: &AppContext,
    client: &reqwest::Client,
    in_flight: &Arc<Mutex<HashSet<String>>>,
) -> usize {
    let span = info_span!("poster_cache.poll");
    async {
        let mut pending: Vec<PendingPoster> = Vec::new();
        match list_videos_needing_poster_download(&ctx.db) {
            Ok(rows) => {
                for (id, url) in rows {
                    pending.push(PendingPoster {
                        owner: Owner::Video,
                        owner_id: id,
                        url,
                    });
                }
            }
            Err(err) => warn!(error = %err, "list_videos_needing_poster_download failed"),
        }
        match list_shows_needing_poster_download(&ctx.db) {
            Ok(rows) => {
                for (id, url) in rows {
                    pending.push(PendingPoster {
                        owner: Owner::Show,
                        owner_id: id,
                        url,
                    });
                }
            }
            Err(err) => warn!(error = %err, "list_shows_needing_poster_download failed"),
        }
        if pending.is_empty() {
            return 0;
        }

        // Skip URLs already being downloaded by an in-flight request from a
        // previous cycle (cycle overlap can happen if downloads are slow).
        // Mark them in flight before kicking off so a re-entry won't redo.
        let mut to_run: Vec<PendingPoster> = Vec::with_capacity(pending.len());
        {
            let mut guard = in_flight.lock().await;
            for p in pending {
                if guard.contains(&p.url) {
                    continue;
                }
                guard.insert(p.url.clone());
                to_run.push(p);
            }
        }
        if to_run.is_empty() {
            return 0;
        }

        let total = to_run.len();
        info!(count = total, "downloading poster cache batch");

        let client = client.clone();
        let poster_dir = ctx.config.poster_dir.clone();
        let ctx = ctx.clone();
        stream::iter(to_run)
            .for_each_concurrent(Some(MAX_CONCURRENCY), |p| {
                let client = client.clone();
                let poster_dir = poster_dir.clone();
                let ctx = ctx.clone();
                let in_flight = in_flight.clone();
                async move {
                    let basename = match download_one(&client, &p.url, &poster_dir).await {
                        Ok(name) => name,
                        Err(err) => {
                            warn!(url = %p.url, error = %err, "poster download failed");
                            in_flight.lock().await.remove(&p.url);
                            return;
                        }
                    };
                    let res = match p.owner {
                        Owner::Video => {
                            set_video_poster_local_path(&ctx.db, &p.owner_id, &basename)
                        }
                        Owner::Show => set_show_poster_local_path(&ctx.db, &p.owner_id, &basename),
                    };
                    if let Err(err) = res {
                        warn!(
                            url = %p.url,
                            owner_id = %p.owner_id,
                            error = %err,
                            "poster row update failed",
                        );
                    }
                    in_flight.lock().await.remove(&p.url);
                }
            })
            .await;

        total
    }
    .instrument(span)
    .await
}

#[derive(Debug, thiserror::Error)]
enum DownloadError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("non-2xx status: {0}")]
    Status(u16),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("image decode failed: {0}")]
    Decode(#[from] image::ImageError),
    #[error("resize task panicked")]
    JoinError,
}

/// Fetch a poster and write one WebP variant per `PosterSize`.
///
/// Returns the SHA1 hex digest used as the basename root: each variant
/// lands at `<root>.w{N}.webp`. The root alone is stored in
/// `poster_local_path`; the size suffix is appended at GraphQL resolve
/// time so a single DB write covers every variant.
async fn download_one(
    client: &reqwest::Client,
    url: &str,
    poster_dir: &PathBuf,
) -> Result<String, DownloadError> {
    // Hash the original DB URL so the basename stays stable across
    // future tweaks to the rewriter, then fetch from the high-res
    // version so every variant downscales rather than upscaling from
    // the 300-px default.
    let root = sha1_root_for(url);
    let fetch_url = upgrade_amazon_cdn_url(url, SOURCE_FETCH_WIDTH);
    let response = client.get(fetch_url.as_ref()).send().await?;
    if !response.status().is_success() {
        return Err(DownloadError::Status(response.status().as_u16()));
    }
    let bytes = response.bytes().await?.to_vec();
    tokio::fs::create_dir_all(poster_dir).await?;

    // Resize + encode is CPU-bound (Lanczos3 over a 600×900 source is
    // ~5-10ms per variant; libwebp encode adds another ~10ms). Keep the
    // tokio runtime free by handing the whole batch to a blocking pool.
    let variants = tokio::task::spawn_blocking(move || encode_all_variants(&bytes))
        .await
        .map_err(|_| DownloadError::JoinError)??;

    for (size, encoded) in variants {
        let basename = variant_basename(&root, size);
        let target = poster_dir.join(&basename);
        // Atomic-ish write: stage in a sibling temp file, then rename.
        // The serving route only matches `<hex>.w<digits>.webp`, so the
        // `.part` files are invisible to clients even mid-write.
        let tmp = poster_dir.join(format!("{basename}.part"));
        let mut f = tokio::fs::File::create(&tmp).await?;
        f.write_all(&encoded).await?;
        f.flush().await?;
        drop(f);
        tokio::fs::rename(&tmp, &target).await?;
    }
    Ok(root)
}

/// Decode once, resize for every `PosterSize`, encode each as WebP q75.
/// Synchronous — caller wraps in `spawn_blocking`.
fn encode_all_variants(bytes: &[u8]) -> Result<Vec<(PosterSize, Vec<u8>)>, DownloadError> {
    let img = image::load_from_memory(bytes)?;
    let mut out = Vec::with_capacity(PosterSize::ALL.len());
    for &size in PosterSize::ALL {
        // resize() preserves aspect ratio: the longer edge becomes the
        // target width, the other shrinks proportionally. For OMDb's
        // 2:3 portrait posters that's exactly what we want.
        let resized = img.resize(size.width_px(), u32::MAX, FilterType::Lanczos3);
        let rgba = resized.to_rgba8();
        let encoder = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
        let memory = encoder.encode(WEBP_QUALITY);
        out.push((size, memory.to_vec()));
    }
    Ok(out)
}

/// Content-addressed basename root: `sha1(url)` hex. Stable so
/// re-downloading the same URL overwrites the same files.
fn sha1_root_for(url: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(url.as_bytes());
    hex::encode(hasher.finalize())
}

fn variant_basename(root: &str, size: PosterSize) -> String {
    format!("{root}.{}.webp", size.suffix())
}

/// Replace Amazon's `_V1_<modifiers>.<ext>` size hints with a single
/// `_V1_SX{width}.<ext>` so the CDN serves a high-res original we can
/// then downscale into the four `PosterSize` variants. URLs without
/// `._V1_` (non-Amazon) pass through unchanged.
///
/// Amazon's CDN packs an arbitrary chain of modifiers between `_V1_`
/// and the file extension — examples:
///   * `_V1_SX300.jpg`                           (width-only)
///   * `_V1_QL75_UY562_CR35,0,380,562_.jpg`      (quality + height + crop)
///
/// Both forms collapse to `_V1_SX{width}.<ext>`.
fn upgrade_amazon_cdn_url(url: &str, width: u32) -> std::borrow::Cow<'_, str> {
    if !url.contains("._V1_") {
        return std::borrow::Cow::Borrowed(url);
    }
    // Find the `._V1_` anchor, then split the suffix at the last `.`
    // which is the file extension. Anything between belongs to the
    // modifier block we want to replace wholesale.
    let Some(anchor) = url.find("._V1_") else {
        return std::borrow::Cow::Borrowed(url);
    };
    let prefix = &url[..anchor];
    let after_anchor = &url[anchor + 5..]; // skip `._V1_`
    let Some(dot) = after_anchor.rfind('.') else {
        return std::borrow::Cow::Borrowed(url);
    };
    let ext = &after_anchor[dot..];
    std::borrow::Cow::Owned(format!("{prefix}._V1_SX{width}{ext}"))
}

/// True when `name` matches `<hex>.w<digits>.webp`. Used by the startup
/// cleanup pass to spare the new sized files while reaping legacy
/// originals.
pub fn is_sized_variant_name(name: &str) -> bool {
    let Some((root, rest)) = name.split_once('.') else {
        return false;
    };
    if !root.chars().all(|c| c.is_ascii_hexdigit()) || root.is_empty() {
        return false;
    }
    let Some((suffix, ext)) = rest.split_once('.') else {
        return false;
    };
    if ext != "webp" {
        return false;
    }
    let Some(digits) = suffix.strip_prefix('w') else {
        return false;
    };
    !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit())
}

/// Idempotent startup reconciler — see docs/architecture/Library-Scan/05-Poster-Caching.md §"Startup purge".
pub async fn purge_legacy_cache(ctx: &AppContext) {
    let poster_dir = &ctx.config.poster_dir;

    let mut purged_legacy_files: u64 = 0;
    let mut roots_on_disk: HashMap<String, HashSet<String>> = HashMap::new();
    match tokio::fs::read_dir(poster_dir).await {
        Ok(mut iter) => {
            while let Ok(Some(entry)) = iter.next_entry().await {
                let name = entry.file_name();
                let Some(name_str) = name.to_str() else {
                    continue;
                };
                if !is_sized_variant_name(name_str) {
                    let path = entry.path();
                    if let Err(err) = tokio::fs::remove_file(&path).await {
                        warn!(path = %path.display(), error = %err, "purge_legacy_cache: remove failed");
                    } else {
                        purged_legacy_files += 1;
                    }
                    continue;
                }
                if let Some((root, rest)) = name_str.split_once('.') {
                    if let Some((suffix, _ext)) = rest.split_once('.') {
                        roots_on_disk
                            .entry(root.to_string())
                            .or_default()
                            .insert(suffix.to_string());
                    }
                }
            }
        }
        Err(err) if err.kind() != std::io::ErrorKind::NotFound => {
            warn!(dir = %poster_dir.display(), error = %err, "purge_legacy_cache: read_dir failed");
        }
        Err(_) => {}
    }

    let required: HashSet<String> = PosterSize::ALL
        .iter()
        .map(|s| s.suffix().to_string())
        .collect();

    let mut purged_orphan_files: u64 = 0;
    for (root, present) in &roots_on_disk {
        for suffix in present.difference(&required) {
            let path = poster_dir.join(format!("{root}.{suffix}.webp"));
            if let Err(err) = tokio::fs::remove_file(&path).await {
                warn!(path = %path.display(), error = %err, "purge_legacy_cache: remove orphan failed");
            } else {
                purged_orphan_files += 1;
            }
        }
    }

    let db_recorded_roots: Vec<String> = ctx
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT poster_local_path FROM video_metadata \
                    WHERE poster_local_path IS NOT NULL \
                      AND poster_local_path NOT LIKE '%.%' \
                 UNION \
                 SELECT poster_local_path FROM show_metadata \
                    WHERE poster_local_path IS NOT NULL \
                      AND poster_local_path NOT LIKE '%.%'",
            )?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            let out: Vec<String> = rows.filter_map(Result::ok).collect();
            Ok::<_, crate::error::DbError>(out)
        })
        .unwrap_or_default();

    let mut incomplete_set: HashSet<String> = roots_on_disk
        .iter()
        .filter(|(_, present)| !required.is_subset(present))
        .map(|(root, _)| root.clone())
        .collect();
    for root in &db_recorded_roots {
        let complete = roots_on_disk
            .get(root)
            .is_some_and(|present| required.is_subset(present));
        if !complete {
            incomplete_set.insert(root.clone());
        }
    }
    let incomplete_roots: Vec<String> = incomplete_set.into_iter().collect();

    let mut purged_incomplete_files: u64 = 0;
    for root in &incomplete_roots {
        if let Some(present) = roots_on_disk.get(root) {
            for suffix in present {
                let path = poster_dir.join(format!("{root}.{suffix}.webp"));
                if let Err(err) = tokio::fs::remove_file(&path).await {
                    warn!(path = %path.display(), error = %err, "purge_legacy_cache: remove incomplete failed");
                } else {
                    purged_incomplete_files += 1;
                }
            }
        }
    }

    // Per-row UPDATE rather than dynamic-SQL IN-clause: this fires once per
    // cache-schema bump for ≤ a few hundred rows, so the cost is bounded.
    let result = ctx.db.with(|c| {
        let mut v = c.execute(
            "UPDATE video_metadata SET poster_local_path = NULL \
             WHERE poster_local_path LIKE '%.%'",
            [],
        )?;
        let mut s = c.execute(
            "UPDATE show_metadata SET poster_local_path = NULL \
             WHERE poster_local_path LIKE '%.%'",
            [],
        )?;
        for root in &incomplete_roots {
            v += c.execute(
                "UPDATE video_metadata SET poster_local_path = NULL \
                 WHERE poster_local_path = ?1",
                [root],
            )?;
            s += c.execute(
                "UPDATE show_metadata SET poster_local_path = NULL \
                 WHERE poster_local_path = ?1",
                [root],
            )?;
        }
        Ok::<_, crate::error::DbError>((v, s))
    });
    let (videos_nulled, shows_nulled) = match result {
        Ok(t) => t,
        Err(err) => {
            warn!(error = %err, "purge_legacy_cache: DB null-out failed");
            (0, 0)
        }
    };
    if purged_legacy_files > 0
        || purged_orphan_files > 0
        || purged_incomplete_files > 0
        || videos_nulled > 0
        || shows_nulled > 0
    {
        info!(
            legacy_files = purged_legacy_files,
            orphan_files = purged_orphan_files,
            incomplete_files = purged_incomplete_files,
            incomplete_roots = incomplete_roots.len(),
            video_rows = videos_nulled,
            show_rows = shows_nulled,
            dir = %poster_dir.display(),
            "purged stale poster cache",
        );
    }
}

/// Spawn the periodic background worker. Idempotent — call once at
/// startup.
pub fn spawn_periodic_poster_cache(ctx: AppContext) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("xstream/poster-cache")
        .build()
    {
        Ok(c) => c,
        Err(err) => {
            warn!(error = %err, "could not build poster_cache reqwest client; worker disabled");
            return;
        }
    };
    let in_flight: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    tokio::spawn(async move {
        loop {
            let _ = poll_once(&ctx, &client, &in_flight).await;
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha1_root_is_stable_for_the_same_url() {
        let a = sha1_root_for("https://m.media-amazon.com/p.jpg");
        let b = sha1_root_for("https://m.media-amazon.com/p.jpg");
        assert_eq!(a, b);
        assert_eq!(a.len(), 40);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn variant_basename_appends_size_suffix_and_webp_ext() {
        assert_eq!(
            variant_basename("abc123", PosterSize::W240),
            "abc123.w240.webp"
        );
        assert_eq!(
            variant_basename("abc123", PosterSize::W3200),
            "abc123.w3200.webp"
        );
    }

    #[test]
    fn is_sized_variant_name_matches_hex_dot_w_digits_dot_webp() {
        assert!(is_sized_variant_name("abc123.w240.webp"));
        assert!(is_sized_variant_name("abc123.w1600.webp"));
        assert!(is_sized_variant_name(
            "0123456789abcdef0123456789abcdef01234567.w800.webp"
        ));
    }

    #[test]
    fn is_sized_variant_name_rejects_legacy_and_garbage() {
        assert!(!is_sized_variant_name("abc123.jpg"));
        assert!(!is_sized_variant_name("abc123.png"));
        assert!(!is_sized_variant_name("abc123.webp")); // missing size segment
        assert!(!is_sized_variant_name("abc123.w240.webp.part")); // staging file
        assert!(!is_sized_variant_name("abc123.w.webp")); // empty digits
        assert!(!is_sized_variant_name("zzz.w240.webp")); // non-hex root
        assert!(!is_sized_variant_name(""));
    }

    #[test]
    fn upgrade_amazon_cdn_url_replaces_sx300_with_target_width() {
        let got = upgrade_amazon_cdn_url(
            "https://m.media-amazon.com/images/M/abc._V1_SX300.jpg",
            2000,
        );
        assert_eq!(
            got.as_ref(),
            "https://m.media-amazon.com/images/M/abc._V1_SX2000.jpg"
        );
    }

    #[test]
    fn upgrade_amazon_cdn_url_collapses_complex_modifier_chain() {
        let got = upgrade_amazon_cdn_url(
            "https://m.media-amazon.com/images/M/abc._V1_QL75_UY562_CR35,0,380,562_.jpg",
            2000,
        );
        assert_eq!(
            got.as_ref(),
            "https://m.media-amazon.com/images/M/abc._V1_SX2000.jpg"
        );
    }

    #[test]
    fn upgrade_amazon_cdn_url_is_a_no_op_for_non_amazon_urls() {
        let got = upgrade_amazon_cdn_url("https://example.com/poster.jpg", 2000);
        assert_eq!(got.as_ref(), "https://example.com/poster.jpg");
    }

    #[test]
    fn encode_all_variants_produces_one_webp_per_size() {
        // Synthesize a tiny 4×6 RGB image, encode it as JPEG, then run
        // the variant pipeline against those bytes. Real OMDb posters
        // are ~600×900; the test fixture is just a smoke check that
        // every variant emits valid WebP-magic bytes.
        let mut img = image::RgbImage::new(4, 6);
        for px in img.pixels_mut() {
            *px = image::Rgb([200, 80, 120]);
        }
        let dynamic = image::DynamicImage::ImageRgb8(img);
        let mut jpeg_bytes = Vec::new();
        dynamic
            .write_to(
                &mut std::io::Cursor::new(&mut jpeg_bytes),
                image::ImageFormat::Jpeg,
            )
            .expect("jpeg encode");
        let variants = encode_all_variants(&jpeg_bytes).expect("encode");
        assert_eq!(variants.len(), PosterSize::ALL.len());
        for (size, bytes) in variants {
            assert!(bytes.starts_with(b"RIFF"), "WebP magic for {size:?}");
            assert!(bytes.len() > 16, "non-trivial encoded size for {size:?}");
        }
    }
}
