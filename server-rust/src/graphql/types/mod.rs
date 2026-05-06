//! GraphQL object types — all field nullability and names are part of the published SDL wire contract.

pub mod episode;
mod film;
mod library;
mod misc;
mod node;
mod omdb;
mod playback_session;
pub mod season;
mod show;
mod transcode_job;
mod video;
mod watchlist;

pub use episode::Episode;
pub use film::{Film, FilmConnection, FilmEdge};
pub use library::{Library, LibraryStats};
pub use misc::{DirEntry, LibraryScanProgress, LibraryScanUpdate, SettingEntry};
pub use node::{Node, PageInfo};
pub use omdb::OmdbSearchResult;
pub use playback_session::PlaybackSession;
pub use season::Season;
pub use show::{Show, ShowConnection, ShowEdge, ShowMetadata};
pub use transcode_job::{PlaybackError, StartTranscodeResult, TranscodeJob};
pub use video::{
    AudioStreamInfo, Video, VideoConnection, VideoEdge, VideoMetadata, VideoStreamInfo,
};
pub use watchlist::WatchlistItem;

/// Pick the URL the client should fetch for a poster at a specific
/// size. When the local cache has the file, return the same-origin
/// `/poster/<root>.w{N}.webp` route — the image is served from the
/// user's disk at the requested resolution, works offline, and is
/// pre-encoded so the response is byte-for-byte cacheable.
///
/// Otherwise fall back to the OMDb canonical URL so freshly-matched
/// rows still render in the 15-second window before the worker has
/// caught up. The fallback ignores `size` — OMDb's CDN is out of our
/// control and any per-size rewrite is best-effort at most.
pub fn poster_url_for_metadata(
    poster_local_path: Option<&str>,
    poster_url: Option<&str>,
    size: crate::graphql::scalars::PosterSize,
) -> Option<String> {
    if let Some(stored) = poster_local_path {
        if !stored.is_empty() {
            // Legacy rows wrote `<sha>.<ext>`; the new worker writes
            // just `<sha>`. Either way the SHA1 hex root is everything
            // before the first `.`.
            let root = stored.split('.').next().unwrap_or(stored);
            return Some(format!("/poster/{root}.{}.webp", size.suffix()));
        }
    }
    poster_url.map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::scalars::PosterSize;

    #[test]
    fn returns_sized_variant_url_when_local_path_is_a_bare_hex_root() {
        let got = poster_url_for_metadata(Some("abc123"), None, PosterSize::W400);
        assert_eq!(got, Some("/poster/abc123.w400.webp".to_string()));
    }

    #[test]
    fn strips_legacy_extension_from_local_path() {
        // Pre-PosterSize rows wrote `<sha>.jpg` to poster_local_path.
        // Startup cleanup wipes the legacy *files* but the DB column
        // stays until next match — strip the extension so the
        // re-encoded variants resolve cleanly.
        let got = poster_url_for_metadata(Some("abc123.jpg"), None, PosterSize::W800);
        assert_eq!(got, Some("/poster/abc123.w800.webp".to_string()));
    }

    #[test]
    fn falls_back_to_omdb_url_when_no_local_path() {
        let got = poster_url_for_metadata(
            None,
            Some("https://m.media-amazon.com/images/M/foo.jpg"),
            PosterSize::W3200,
        );
        assert_eq!(
            got,
            Some("https://m.media-amazon.com/images/M/foo.jpg".to_string())
        );
    }

    #[test]
    fn returns_none_when_neither_path_nor_url_is_set() {
        assert_eq!(poster_url_for_metadata(None, None, PosterSize::W240), None);
        assert_eq!(
            poster_url_for_metadata(Some(""), None, PosterSize::W240),
            None
        );
    }
}
