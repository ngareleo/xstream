//! `Episode` — one episode of a TV show. Supports multiple file rows per (show_id, season, episode) coordinate.

use async_graphql::{Object, ID};

use crate::db::{EpisodeRow, VideoRow};
use crate::graphql::scalars::Resolution;
use crate::graphql::types::library::Library;
use crate::graphql::types::video::Video;
use crate::relay::to_global_id;

#[derive(Clone)]
pub struct Episode {
    pub episode_number: i32,
    pub season_number: i32,
    pub title: Option<String>,
    pub copies: Vec<VideoRow>,
}

impl Episode {
    pub fn from_row(row: &EpisodeRow, copies: &[VideoRow]) -> Self {
        Self {
            episode_number: row.episode_number as i32,
            season_number: row.season_number as i32,
            title: row.title.clone(),
            copies: copies.to_vec(),
        }
    }

    fn best(&self) -> Option<&VideoRow> {
        // copies are pre-sorted by resolution+bitrate desc in
        // get_videos_by_show_id / get_videos_by_show_episode.
        self.copies.first()
    }
}

#[Object]
impl Episode {
    async fn season_number(&self) -> i32 {
        self.season_number
    }
    async fn episode_number(&self) -> i32 {
        self.episode_number
    }
    async fn title(&self) -> Option<&str> {
        self.title.as_deref()
    }

    /// True when at least one `videos` row exists for this episode
    /// coordinate. False renders the row dimmed in the seasons panel
    /// (OMDb-known but missing on disk).
    async fn on_disk(&self) -> bool {
        !self.copies.is_empty()
    }

    /// Duration sourced from the bestCopy (every copy of the same
    /// episode is the same logical file). Null when off-disk.
    async fn duration_seconds(&self) -> Option<f64> {
        self.best().map(|v| v.duration_seconds)
    }

    /// Native resolution of the bestCopy. Null when off-disk or when
    /// the column was unset for older rows.
    async fn native_resolution(&self) -> Option<Resolution> {
        let raw = self.best()?.native_resolution.as_deref()?;
        Resolution::from_internal(raw).or_else(|| {
            tracing::warn!(
                episode_season = self.season_number,
                episode_number = self.episode_number,
                raw = %raw,
                "videos.native_resolution held an unknown value — returning None"
            );
            None
        })
    }

    /// Every file row for this episode coordinate. Ordered res-desc /
    /// bitrate-desc so the picker renders best-first.
    async fn copies(&self) -> Vec<Video> {
        self.copies.iter().map(Video::from_row).collect()
    }

    /// First entry of `copies` (best-quality) or null when off-disk.
    /// Drives the default play target.
    async fn best_copy(&self) -> Option<Video> {
        self.best().map(Video::from_row)
    }

    /// Convenience: the bestCopy's library, when present. Lets the
    /// client mark an episode "offline" when its host library's status
    /// is OFFLINE without an extra round-trip.
    async fn library(
        &self,
        ctx: &async_graphql::Context<'_>,
    ) -> async_graphql::Result<Option<Library>> {
        let db = ctx.data_unchecked::<crate::db::Db>();
        let Some(best) = self.best() else {
            return Ok(None);
        };
        Ok(crate::db::get_library_by_id(db, &best.library_id)?
            .as_ref()
            .map(Library::from_row))
    }

    /// Carry-over for clients still keying on a single video id. The
    /// Relay node id of the bestCopy when present, null otherwise.
    /// Tech debt: clients should migrate to `bestCopy.id` and this
    /// field disappears.
    async fn video_id(&self) -> Option<ID> {
        self.best().map(|v| ID(to_global_id("Video", &v.id)))
    }
}
