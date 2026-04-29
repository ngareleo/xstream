//! GraphQL object types — structural mirror of the Bun `schema.ts` typeDefs.
//!
//! Field nullability, arg defaults, and enum-variant names must match
//! byte-equivalent or the SDL parity check fails and the Relay client's
//! generated artifacts won't deserialise.

use async_graphql::{ComplexObject, Context, Interface, Object, SimpleObject, Union, ID};

use crate::db::{
    self, get_library_by_id, get_metadata_by_video_id, get_streams_by_video_id, get_video_by_id,
    Db, LibraryRow, TranscodeJobRow, VideoMetadataRow, VideoRow, WatchlistItemRow,
};
use crate::graphql::scalars::{JobStatus, MediaType, PlaybackErrorCode, Resolution};
use crate::relay::{encode_cursor, to_global_id};

const MAX_PAGE_SIZE: i32 = 100;

// ── Node interface ────────────────────────────────────────────────────────────

#[derive(Interface)]
#[graphql(field(name = "id", ty = "&ID"))]
pub enum Node {
    Library(Library),
    Video(Video),
    WatchlistItem(WatchlistItem),
    TranscodeJob(TranscodeJob),
}

// ── PageInfo ─────────────────────────────────────────────────────────────────

#[derive(SimpleObject, Default, Clone)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
    pub end_cursor: Option<String>,
}

// ── Library ──────────────────────────────────────────────────────────────────

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct Library {
    pub id: ID,
    pub name: String,
    pub path: String,
    pub media_type: MediaType,
    pub video_extensions: Vec<String>,
    #[graphql(skip)]
    pub raw_id: String,
}

impl Library {
    pub fn from_row(row: &LibraryRow) -> Self {
        let video_extensions: Vec<String> =
            serde_json::from_str(&row.video_extensions).unwrap_or_default();
        Self {
            id: ID(to_global_id("Library", &row.id)),
            name: row.name.clone(),
            path: row.path.clone(),
            media_type: MediaType::from_internal(&row.media_type),
            video_extensions,
            raw_id: row.id.clone(),
        }
    }
}

#[ComplexObject]
impl Library {
    async fn stats(&self, ctx: &Context<'_>) -> async_graphql::Result<LibraryStats> {
        let db = ctx.data_unchecked::<Db>();
        let total = db::count_videos_by_library(db, &self.raw_id, Default::default())?;
        let (matched, unmatched) = db::count_matched_by_library(db, &self.raw_id)?;
        let total_size = db::sum_file_size_by_library(db, &self.raw_id)?;
        Ok(LibraryStats {
            total_count: total as i32,
            matched_count: matched as i32,
            unmatched_count: unmatched as i32,
            total_size_bytes: total_size as f64,
        })
    }

    /// MAX_PAGE_SIZE = 100 (enforced server-side regardless of this default)
    #[graphql(name = "videos")]
    async fn videos(
        &self,
        ctx: &Context<'_>,
        #[graphql(default = 20)] first: Option<i32>,
        after: Option<String>,
        search: Option<String>,
        media_type: Option<MediaType>,
    ) -> async_graphql::Result<VideoConnection> {
        let first = first.unwrap_or(20);
        let db = ctx.data_unchecked::<Db>();
        let offset: i64 = match &after {
            Some(c) => (crate::relay::decode_cursor(c)? as i64) + 1,
            None => 0,
        };
        let limit = first.min(MAX_PAGE_SIZE).max(0) as i64;
        let filter = db::VideoFilter {
            search: search.clone(),
            media_type: media_type.map(|m| m.to_internal().to_string()),
        };
        let rows = db::get_videos_by_library(db, &self.raw_id, limit, offset, filter.clone())?;
        let total = db::count_videos_by_library(db, &self.raw_id, filter)?;

        let edges: Vec<VideoEdge> = rows
            .iter()
            .enumerate()
            .map(|(i, row)| VideoEdge {
                node: Video::from_row(row),
                cursor: encode_cursor(offset as usize + i),
            })
            .collect();

        let page_info = PageInfo {
            has_next_page: (offset + rows.len() as i64) < total,
            has_previous_page: offset > 0,
            start_cursor: edges.first().map(|e| e.cursor.clone()),
            end_cursor: edges.last().map(|e| e.cursor.clone()),
        };

        Ok(VideoConnection {
            edges,
            page_info,
            total_count: total as i32,
        })
    }
}

#[derive(SimpleObject, Clone)]
pub struct LibraryStats {
    pub total_count: i32,
    pub matched_count: i32,
    pub unmatched_count: i32,
    pub total_size_bytes: f64,
}

// ── Video ────────────────────────────────────────────────────────────────────

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
    async fn id(&self) -> &ID {
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
            .map(|l| MediaType::from_internal(&l.media_type))
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
}

#[derive(SimpleObject, Clone)]
pub struct VideoMetadata {
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub cast: Vec<String>,
    pub rating: Option<f64>,
    pub plot: Option<String>,
    pub poster_url: Option<String>,
}

impl VideoMetadata {
    pub fn from_row(row: VideoMetadataRow) -> Self {
        let cast: Vec<String> = row
            .cast_list
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        Self {
            imdb_id: row.imdb_id,
            title: row.title,
            year: row.year.map(|y| y as i32),
            genre: row.genre,
            director: row.director,
            cast,
            rating: row.rating,
            plot: row.plot,
            poster_url: row.poster_url,
        }
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

// ── Watchlist ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct WatchlistItem {
    pub id: ID,
    pub added_at: String,
    pub progress_seconds: f64,
    pub notes: Option<String>,
    pub raw: WatchlistItemRow,
}

impl WatchlistItem {
    pub fn from_row(row: &WatchlistItemRow) -> Self {
        Self {
            id: ID(to_global_id("WatchlistItem", &row.id)),
            added_at: row.added_at.clone(),
            progress_seconds: row.progress_seconds,
            notes: row.notes.clone(),
            raw: row.clone(),
        }
    }
}

#[Object]
impl WatchlistItem {
    async fn id(&self) -> &ID {
        &self.id
    }
    async fn added_at(&self) -> &str {
        &self.added_at
    }
    async fn progress_seconds(&self) -> f64 {
        self.progress_seconds
    }
    async fn notes(&self) -> Option<&String> {
        self.notes.as_ref()
    }
    async fn video(&self, ctx: &Context<'_>) -> async_graphql::Result<Video> {
        let db = ctx.data_unchecked::<Db>();
        let row = get_video_by_id(db, &self.raw.video_id)?.ok_or_else(|| {
            async_graphql::Error::new(format!(
                "WatchlistItem {:?} references missing video {}",
                self.id, self.raw.video_id
            ))
        })?;
        Ok(Video::from_row(&row))
    }
}

// ── OMDb search ──────────────────────────────────────────────────────────────

#[derive(SimpleObject, Clone)]
pub struct OmdbSearchResult {
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub poster_url: Option<String>,
    pub plot: Option<String>,
}

// ── TranscodeJob + PlaybackError + StartTranscodeResult union ────────────────

#[derive(Clone)]
pub struct TranscodeJob {
    pub id: ID,
    pub resolution: Resolution,
    pub status: JobStatus,
    pub total_segments: Option<i32>,
    pub completed_segments: i32,
    pub start_time_seconds: Option<f64>,
    pub end_time_seconds: Option<f64>,
    pub created_at: String,
    pub error: Option<String>,
    pub error_code: Option<PlaybackErrorCode>,
    pub raw_video_id: String,
}

impl TranscodeJob {
    pub fn from_row(row: &TranscodeJobRow) -> Self {
        Self {
            id: ID(to_global_id("TranscodeJob", &row.id)),
            resolution: Resolution::from_internal(&row.resolution).unwrap_or(Resolution::R1080p),
            status: JobStatus::from_internal(&row.status),
            total_segments: row.total_segments.map(|n| n as i32),
            completed_segments: row.completed_segments as i32,
            start_time_seconds: row.start_time_seconds,
            end_time_seconds: row.end_time_seconds,
            created_at: row.created_at.clone(),
            error: row.error.clone(),
            error_code: None,
            raw_video_id: row.video_id.clone(),
        }
    }
}

#[Object]
impl TranscodeJob {
    async fn id(&self) -> &ID {
        &self.id
    }
    async fn resolution(&self) -> Resolution {
        self.resolution
    }
    async fn status(&self) -> JobStatus {
        self.status
    }
    async fn total_segments(&self) -> Option<i32> {
        self.total_segments
    }
    async fn completed_segments(&self) -> i32 {
        self.completed_segments
    }
    async fn start_time_seconds(&self) -> Option<f64> {
        self.start_time_seconds
    }
    async fn end_time_seconds(&self) -> Option<f64> {
        self.end_time_seconds
    }
    async fn created_at(&self) -> &str {
        &self.created_at
    }
    async fn error(&self) -> Option<&String> {
        self.error.as_ref()
    }
    /// Typed code for mid-job failures (set when status == ERROR). Null otherwise.
    async fn error_code(&self) -> Option<PlaybackErrorCode> {
        self.error_code
    }
    async fn video(&self, ctx: &Context<'_>) -> async_graphql::Result<Video> {
        let db = ctx.data_unchecked::<Db>();
        let row = get_video_by_id(db, &self.raw_video_id)?.ok_or_else(|| {
            async_graphql::Error::new(format!(
                "TranscodeJob {:?} references missing video {}",
                self.id, self.raw_video_id
            ))
        })?;
        Ok(Video::from_row(&row))
    }
}

/// Typed failure for a chunk-start request. Returned by union from startTranscode
/// and surfaced via TranscodeJob.errorCode for failures that happen mid-job
/// (probe / encode) after the mutation already resolved successfully.
#[derive(SimpleObject, Clone)]
pub struct PlaybackError {
    pub code: PlaybackErrorCode,
    pub message: String,
    /// Whether the orchestration layer should retry the same call.
    pub retryable: bool,
    /// Server's hint for how long to wait before retrying. Null when retryable is false.
    pub retry_after_ms: Option<i32>,
}

#[derive(Union, Clone)]
pub enum StartTranscodeResult {
    TranscodeJob(TranscodeJob),
    PlaybackError(PlaybackError),
}

// ── Playback history ─────────────────────────────────────────────────────────

#[derive(SimpleObject, Clone)]
pub struct PlaybackSession {
    pub id: ID,
    pub trace_id: String,
    pub video_title: String,
    pub resolution: Resolution,
    pub started_at: String,
}

// ── Misc helper types ────────────────────────────────────────────────────────

#[derive(SimpleObject, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
}

#[derive(SimpleObject, Clone)]
pub struct SettingEntry {
    pub key: String,
    pub value: Option<String>,
}

#[derive(SimpleObject, Clone)]
pub struct LibraryScanUpdate {
    pub scanning: bool,
}

#[derive(SimpleObject, Clone)]
pub struct LibraryScanProgress {
    pub scanning: bool,
    pub library_id: Option<ID>,
    pub done: Option<i32>,
    pub total: Option<i32>,
}
