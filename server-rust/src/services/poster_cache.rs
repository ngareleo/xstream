//! Background poster fetcher for metadata rows; stores locally with SHA1 keying. See docs/architecture/Library-Scan/05-Poster-Caching.md.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::stream::{self, StreamExt};
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tracing::{info, info_span, warn, Instrument};

use crate::config::AppContext;
use crate::db::{
    list_shows_needing_poster_download, list_videos_needing_poster_download,
    set_show_poster_local_path, set_video_poster_local_path,
};

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
}

async fn download_one(
    client: &reqwest::Client,
    url: &str,
    poster_dir: &PathBuf,
) -> Result<String, DownloadError> {
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        return Err(DownloadError::Status(response.status().as_u16()));
    }
    let bytes = response.bytes().await?;
    let basename = basename_for(url);
    tokio::fs::create_dir_all(poster_dir).await?;
    let target = poster_dir.join(&basename);
    // Atomic-ish write: stage in a sibling temp file, then rename.
    let tmp = poster_dir.join(format!("{basename}.part"));
    let mut f = tokio::fs::File::create(&tmp).await?;
    f.write_all(&bytes).await?;
    f.flush().await?;
    drop(f);
    tokio::fs::rename(&tmp, &target).await?;
    Ok(basename)
}

/// Content-addressed basename: `sha1(url)` + the URL's original
/// extension (defaults to `.jpg`). Stable so re-downloading the same
/// URL overwrites the same file.
fn basename_for(url: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(url.as_bytes());
    let hash = hex::encode(hasher.finalize());
    let ext = extension_from_url(url);
    format!("{hash}.{ext}")
}

fn extension_from_url(url: &str) -> &'static str {
    let path_part = url.split('?').next().unwrap_or(url);
    let lower = path_part.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "png"
    } else if lower.ends_with(".webp") {
        "webp"
    } else if lower.ends_with(".gif") {
        "gif"
    } else {
        // OMDb posters are nearly always JPEG; default keeps the
        // common case fast and the response Content-Type will still be
        // accurate when set on the route.
        "jpg"
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
    fn basename_for_uses_sha1_and_jpg_default() {
        let name = basename_for("https://example.com/poster.jpg");
        assert!(name.ends_with(".jpg"));
        assert!(name.len() > "sha1.jpg".len());
    }

    #[test]
    fn extension_picks_png_webp_gif_jpg() {
        assert_eq!(extension_from_url("https://example.com/a.png"), "png");
        assert_eq!(extension_from_url("https://example.com/a.webp"), "webp");
        assert_eq!(extension_from_url("https://example.com/a.gif"), "gif");
        assert_eq!(extension_from_url("https://example.com/a.jpg"), "jpg");
        assert_eq!(extension_from_url("https://example.com/foo"), "jpg");
        assert_eq!(extension_from_url("https://example.com/a.JPG?x=1"), "jpg");
    }

    #[test]
    fn basename_is_stable_for_the_same_url() {
        let a = basename_for("https://m.media-amazon.com/p.jpg");
        let b = basename_for("https://m.media-amazon.com/p.jpg");
        assert_eq!(a, b);
    }
}
