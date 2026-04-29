//! Root Mutation. CRUD for libraries, video metadata, watchlist, settings,
//! playback-session writes work fully. Background-scan and transcode-start
//! are stubbed (those depend on the chunker / scanner — Step 2).

use async_graphql::{Context, Object, ID};

use crate::db::{
    self, add_watchlist_item, create_library, delete_library, delete_video_metadata,
    get_video_by_id, insert_playback_session, remove_watchlist_item, set_setting, update_library,
    update_watchlist_progress, upsert_video_metadata, Db, LibraryUpdate, PlaybackHistoryRow,
    VideoMetadataRow,
};
use crate::graphql::scalars::{MediaType, PlaybackErrorCode, Resolution};
use crate::graphql::types::{
    Library, PlaybackError, PlaybackSession, StartTranscodeResult, Video, WatchlistItem,
};
use crate::relay::from_global_id;

#[derive(Default)]
pub struct Mutation;

#[Object]
impl Mutation {
    /// Step 1 stub — returns the current library list without running a real
    /// scan. The scanner ships in Step 2 alongside the chunker.
    async fn scan_libraries(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Library>> {
        let db = ctx.data_unchecked::<Db>();
        Ok(db::get_all_libraries(db)?
            .iter()
            .map(Library::from_row)
            .collect())
    }

    /// Step 1 stub — always returns an INTERNAL PlaybackError. The chunker /
    /// ffmpeg pool is out of scope for Step 1; turn the `useRustGraphQL`
    /// flag OFF on the player page until Step 2 ships.
    async fn start_transcode(
        &self,
        _video_id: ID,
        _resolution: Resolution,
        _start_time_seconds: Option<f64>,
        _end_time_seconds: Option<f64>,
    ) -> async_graphql::Result<StartTranscodeResult> {
        Ok(StartTranscodeResult::PlaybackError(PlaybackError {
            code: PlaybackErrorCode::Internal,
            message:
                "startTranscode is not implemented in the Rust GraphQL server yet (Step 1). Disable \
                 the `useRustGraphQL` flag in Settings → Flags before playing video — Step 2 wires \
                 the chunker/ffmpeg pool."
                    .to_string(),
            retryable: false,
            retry_after_ms: None,
        }))
    }

    async fn create_library(
        &self,
        ctx: &Context<'_>,
        name: String,
        path: String,
        media_type: MediaType,
        extensions: Vec<String>,
    ) -> async_graphql::Result<Library> {
        let db = ctx.data_unchecked::<Db>();
        let row = create_library(db, &name, &path, media_type.to_internal(), &extensions)?;
        Ok(Library::from_row(&row))
    }

    async fn delete_library(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<bool> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        Ok(delete_library(db, &local_id)?)
    }

    async fn update_library(
        &self,
        ctx: &Context<'_>,
        id: ID,
        name: Option<String>,
        path: Option<String>,
        media_type: Option<MediaType>,
        extensions: Option<Vec<String>>,
    ) -> async_graphql::Result<Library> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        let updated = update_library(
            db,
            &local_id,
            LibraryUpdate {
                name: name.as_deref(),
                path: path.as_deref(),
                media_type: media_type.map(|m| m.to_internal()),
                extensions,
            },
        )?
        .ok_or_else(|| async_graphql::Error::new("Library not found"))?;
        Ok(Library::from_row(&updated))
    }

    /// Step 1 stub — writes an empty metadata row keyed by IMDb ID. The full
    /// OMDb fetch ships in Step 2 alongside the scanner.
    async fn match_video(
        &self,
        ctx: &Context<'_>,
        video_id: ID,
        imdb_id: String,
    ) -> async_graphql::Result<Video> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&video_id)?;
        let video = get_video_by_id(db, &local_id)?
            .ok_or_else(|| async_graphql::Error::new(format!("Video not found: {video_id:?}")))?;
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        upsert_video_metadata(
            db,
            &VideoMetadataRow {
                video_id: local_id.clone(),
                imdb_id: imdb_id.clone(),
                title: video
                    .title
                    .clone()
                    .unwrap_or_else(|| video.filename.clone()),
                year: None,
                genre: None,
                director: None,
                cast_list: None,
                rating: None,
                plot: None,
                poster_url: None,
                matched_at: now,
            },
        )?;
        Ok(Video::from_row(&video))
    }

    async fn unmatch_video(&self, ctx: &Context<'_>, video_id: ID) -> async_graphql::Result<Video> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&video_id)?;
        let video = get_video_by_id(db, &local_id)?
            .ok_or_else(|| async_graphql::Error::new(format!("Video not found: {video_id:?}")))?;
        delete_video_metadata(db, &local_id)?;
        Ok(Video::from_row(&video))
    }

    async fn add_to_watchlist(
        &self,
        ctx: &Context<'_>,
        video_id: ID,
    ) -> async_graphql::Result<WatchlistItem> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&video_id)?;
        let row = add_watchlist_item(db, &local_id)?;
        Ok(WatchlistItem::from_row(&row))
    }

    async fn remove_from_watchlist(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<bool> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        Ok(remove_watchlist_item(db, &local_id)?)
    }

    async fn update_watch_progress(
        &self,
        ctx: &Context<'_>,
        video_id: ID,
        progress_seconds: f64,
    ) -> async_graphql::Result<WatchlistItem> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&video_id)?;
        let row = update_watchlist_progress(db, &local_id, progress_seconds)?
            .ok_or_else(|| async_graphql::Error::new("No watchlist item for video"))?;
        Ok(WatchlistItem::from_row(&row))
    }

    async fn set_setting(
        &self,
        ctx: &Context<'_>,
        key: String,
        value: String,
    ) -> async_graphql::Result<bool> {
        let db = ctx.data_unchecked::<Db>();
        set_setting(db, &key, &value)?;
        Ok(true)
    }

    async fn record_playback_session(
        &self,
        ctx: &Context<'_>,
        trace_id: String,
        video_id: ID,
        resolution: Resolution,
    ) -> async_graphql::Result<PlaybackSession> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&video_id)?;
        let video = get_video_by_id(db, &local_id)?;
        let video_title = video
            .map(|v| v.title.unwrap_or(v.filename))
            .unwrap_or_else(|| "Unknown".into());
        let id = uuid::Uuid::new_v4().to_string();
        let started_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let row = PlaybackHistoryRow {
            id: id.clone(),
            trace_id: trace_id.clone(),
            video_id: local_id,
            video_title: video_title.clone(),
            resolution: resolution.to_internal().into(),
            started_at: started_at.clone(),
        };
        insert_playback_session(db, &row)?;
        Ok(PlaybackSession {
            id: ID(id),
            trace_id,
            video_title,
            resolution,
            started_at,
        })
    }
}
