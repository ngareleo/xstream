//! `Video` + metadata, stream info, and paginated-query connection wrappers.

use async_graphql::{Context, Object, SimpleObject, ID};

use super::library::Library;
use super::node::PageInfo;
use crate::db::{
    self, get_library_by_id, get_metadata_by_video_id, get_streams_by_video_id, Db, VideoRow,
};
use crate::graphql::scalars::{MediaType, PosterSize, Resolution};
use crate::relay::to_global_id;

#[derive(Clone)]
pub struct Video {
    pub id: ID,
    pub title: String,
    pub filename: String,
    pub duration_seconds: f64,
    pub file_size_bytes: f64,
    pub bitrate: i32,
    pub raw: VideoRow,
}

impl Video {
    pub fn from_row(row: &VideoRow) -> Self {
        Self {
            id: ID(to_global_id("Video", &row.id)),
            title: row.title.clone().unwrap_or_else(|| row.filename.clone()),
            filename: row.filename.clone(),
            duration_seconds: row.duration_seconds,
            file_size_bytes: row.file_size_bytes as f64,
            bitrate: row.bitrate as i32,
            raw: row.clone(),
        }
    }
}

#[Object]
impl Video {
    pub async fn id(&self) -> &ID {
        &self.id
    }
    async fn title(&self) -> &str {
        &self.title
    }
    async fn filename(&self) -> &str {
        &self.filename
    }
    async fn duration_seconds(&self) -> f64 {
        self.duration_seconds
    }
    async fn file_size_bytes(&self) -> f64 {
        self.file_size_bytes
    }
    async fn bitrate(&self) -> i32 {
        self.bitrate
    }

    async fn matched(&self, ctx: &Context<'_>) -> async_graphql::Result<bool> {
        let db = ctx.data_unchecked::<Db>();
        Ok(db::has_video_metadata(db, &self.raw.id)?)
    }

    async fn media_type(&self, ctx: &Context<'_>) -> async_graphql::Result<MediaType> {
        let db = ctx.data_unchecked::<Db>();
        let lib = get_library_by_id(db, &self.raw.library_id)?;
        Ok(lib
            .and_then(|l| {
                let raw = l.media_type;
                MediaType::from_internal(&raw).or_else(|| {
                    tracing::warn!(
                        video_id = %self.raw.id,
                        library_id = %self.raw.library_id,
                        raw = %raw,
                        "libraries.media_type held an unknown value (via Video.media_type) — defaulting to MOVIES"
                    );
                    Some(MediaType::Movies)
                })
            })
            .unwrap_or(MediaType::Movies))
    }

    async fn library(&self, ctx: &Context<'_>) -> async_graphql::Result<Library> {
        let db = ctx.data_unchecked::<Db>();
        let row = get_library_by_id(db, &self.raw.library_id)?.ok_or_else(|| {
            async_graphql::Error::new(format!(
                "Video {:?} references missing library {}",
                self.id, self.raw.library_id
            ))
        })?;
        Ok(Library::from_row(&row))
    }

    async fn metadata(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<VideoMetadata>> {
        let db = ctx.data_unchecked::<Db>();
        Ok(get_metadata_by_video_id(db, &self.raw.id)?.map(VideoMetadata::from_row))
    }

    async fn video_stream(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Option<VideoStreamInfo>> {
        let db = ctx.data_unchecked::<Db>();
        let streams = get_streams_by_video_id(db, &self.raw.id)?;
        let vs = streams.into_iter().find(|s| s.stream_type == "video");
        let vs = match vs {
            Some(v) => v,
            None => return Ok(None),
        };
        match (vs.width, vs.height, vs.fps) {
            (Some(w), Some(h), Some(fps)) => Ok(Some(VideoStreamInfo {
                codec: vs.codec,
                width: w as i32,
                height: h as i32,
                fps,
            })),
            _ => Ok(None),
        }
    }

    async fn audio_stream(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Option<AudioStreamInfo>> {
        let db = ctx.data_unchecked::<Db>();
        let streams = get_streams_by_video_id(db, &self.raw.id)?;
        let a = streams.into_iter().find(|s| s.stream_type == "audio");
        let a = match a {
            Some(v) => v,
            None => return Ok(None),
        };
        match (a.channels, a.sample_rate) {
            (Some(ch), Some(sr)) => Ok(Some(AudioStreamInfo {
                codec: a.codec,
                channels: ch as i32,
                sample_rate: sr as i32,
            })),
            _ => Ok(None),
        }
    }

    /// Native resolution rung determined at scan time. Null for rows scanned
    /// before the column was added (or for synthetic show rows that carry no
    /// playable file). An unknown value in the DB column is logged + degraded
    /// to None — the warn-then-degrade contract for enum mappers (§14).
    async fn native_resolution(&self) -> Option<Resolution> {
        let raw = self.raw.native_resolution.as_deref()?;
        Resolution::from_internal(raw).or_else(|| {
            tracing::warn!(
                video_id = %self.raw.id,
                raw = %raw,
                "videos.native_resolution held an unknown value — returning None"
            );
            None
        })
    }

    /// The Show this video is an episode of, when set. Movie videos and
    /// unmatched episode files return null. Lets the player resolve the
    /// full season tree from the show context without an extra query.
    async fn show(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<super::show::Show>> {
        let Some(show_id) = self.raw.show_id.as_deref() else {
            return Ok(None);
        };
        let db = ctx.data_unchecked::<Db>();
        Ok(crate::db::get_show_by_id(db, show_id)?
            .as_ref()
            .map(super::show::Show::from_row))
    }

    /// Episode coordinate `(season, episode)` for episode files; null
    /// for movies. Convenience for clients that want to highlight the
    /// active episode without joining back through the show.
    async fn season_number(&self) -> Option<i32> {
        self.raw.show_season.map(|n| n as i32)
    }
    async fn episode_number(&self) -> Option<i32> {
        self.raw.show_episode.map(|n| n as i32)
    }
}

/// OMDb-derived movie metadata. Field-for-field with `ShowMetadata`
/// except for the omitted show-only fields.
///
/// Implemented as `#[Object]` (not `SimpleObject`) so `posterUrl` can
/// take a `size: PosterSize` argument — the resolver appends the size
/// suffix to the cached basename root and returns the matching WebP
/// variant URL. All other fields are plain field readers.
#[derive(Clone)]
pub struct VideoMetadata {
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub cast: Vec<String>,
    pub rating: Option<f64>,
    pub plot: Option<String>,
    /// SHA1 root of the cached poster (no extension, no size suffix);
    /// `None` while the worker hasn't downloaded yet.
    pub poster_local_path: Option<String>,
    /// Original OMDb URL — used as a fallback before the cache fills.
    pub poster_source_url: Option<String>,
}

impl VideoMetadata {
    pub fn from_row(row: crate::db::VideoMetadataRow) -> Self {
        let cast: Vec<String> = match row.cast_list.as_deref() {
            None => Vec::new(),
            Some(raw) => match serde_json::from_str(raw) {
                Ok(v) => v,
                Err(err) => {
                    tracing::warn!(
                        video_id = %row.video_id,
                        raw = %raw,
                        error = %err,
                        "video_metadata.cast_list held malformed JSON — rendering empty cast"
                    );
                    Vec::new()
                }
            },
        };
        Self {
            imdb_id: row.imdb_id,
            title: row.title,
            year: row.year.map(|y| y as i32),
            genre: row.genre,
            director: row.director,
            cast,
            rating: row.rating,
            plot: row.plot,
            poster_local_path: row.poster_local_path,
            poster_source_url: row.poster_url,
        }
    }
}

#[Object]
impl VideoMetadata {
    async fn imdb_id(&self) -> &str {
        &self.imdb_id
    }
    async fn title(&self) -> &str {
        &self.title
    }
    async fn year(&self) -> Option<i32> {
        self.year
    }
    async fn genre(&self) -> Option<&str> {
        self.genre.as_deref()
    }
    async fn director(&self) -> Option<&str> {
        self.director.as_deref()
    }
    async fn cast(&self) -> &[String] {
        &self.cast
    }
    async fn rating(&self) -> Option<f64> {
        self.rating
    }
    async fn plot(&self) -> Option<&str> {
        self.plot.as_deref()
    }

    /// Resolved URL for the poster at the requested width. When the
    /// local cache has the entry, returns `/poster/<root>.w{N}.webp`
    /// at the same origin as the GraphQL endpoint — works offline. In
    /// the cache-fill window the OMDb URL is returned as-is; size is
    /// best-effort at most for that fallback.
    async fn poster_url(&self, size: PosterSize) -> Option<String> {
        crate::graphql::types::poster_url_for_metadata(
            self.poster_local_path.as_deref(),
            self.poster_source_url.as_deref(),
            size,
        )
    }
}

#[derive(SimpleObject, Clone)]
pub struct VideoStreamInfo {
    pub codec: String,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
}

#[derive(SimpleObject, Clone)]
pub struct AudioStreamInfo {
    pub codec: String,
    pub channels: i32,
    pub sample_rate: i32,
}

#[derive(SimpleObject, Clone)]
pub struct VideoConnection {
    pub edges: Vec<VideoEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}

#[derive(SimpleObject, Clone)]
pub struct VideoEdge {
    pub node: Video,
    pub cursor: String,
}
