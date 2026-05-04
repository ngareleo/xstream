//! Root Mutation — CRUD for libraries, metadata, watchlist, settings, playback history.

use async_graphql::{Context, Object, ID};

use crate::db::{
    self, add_watchlist_item, create_library, delete_library, delete_video_metadata,
    get_video_by_id, insert_playback_session, remove_watchlist_item, set_setting, update_library,
    update_watchlist_progress, upsert_video_metadata, Db, LibraryUpdate, PlaybackHistoryRow,
    VideoMetadataRow,
};
use crate::graphql::scalars::{MediaType, Resolution};
use crate::graphql::types::{
    Library, PlaybackError, PlaybackSession, StartTranscodeResult, Video, WatchlistItem,
};
use crate::relay::from_global_id;

#[derive(Default)]
pub struct Mutation;

#[Object]
impl Mutation {
    /// Spawn a fire-and-forget background scan, then return the current
    /// library list immediately. Progress flows through the
    /// `library_scan_progress` subscription; the mutation contract is
    /// "kicked off, here are the current libraries". `ScanState::mark_started`
    /// inside `scan_libraries` is the dedup guard, so two concurrent
    /// callers won't both walk the filesystem.
    async fn scan_libraries(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Library>> {
        let app_ctx = ctx.data_unchecked::<crate::config::AppContext>();
        let spawn_ctx = app_ctx.clone();
        tokio::spawn(async move {
            crate::services::library_scanner::scan_libraries(&spawn_ctx).await;
        });
        Ok(db::get_all_libraries(&app_ctx.db)?
            .iter()
            .map(Library::from_row)
            .collect())
    }

    /// Cancel a list of in-flight transcode jobs by their global IDs.
    /// Fire-and-forget — the resolver always returns `true` and any
    /// per-id failure is logged inside `FfmpegPool::kill_job`. The
    /// pool's permit-drop runs synchronously, so a follow-up
    /// `start_transcode` from the same client (e.g. the seek path's new
    /// foreground chunk) sees the freed slot in <50 ms instead of
    /// queueing behind the kernel's process reap.
    async fn cancel_transcode(
        &self,
        ctx: &Context<'_>,
        job_ids: Vec<ID>,
    ) -> async_graphql::Result<bool> {
        use crate::services::kill_reason::KillReason;
        let app_ctx = ctx.data_unchecked::<crate::config::AppContext>();
        for global_id in job_ids {
            let (_, local_id) = from_global_id(&global_id)?;
            app_ctx.pool.kill_job(&local_id, KillReason::ClientCancel);
        }
        Ok(true)
    }

    /// Spawn (or reuse) a transcode job for the requested video range.
    /// Returns either a `TranscodeJob` payload (the job is now in the
    /// chunker's job_store and segments will arrive via `/stream/:jobId`)
    /// or a typed `PlaybackError` for the failure modes the client can
    /// react to (capacity exhausted, video not found, probe failed, etc.).
    async fn start_transcode(
        &self,
        ctx: &Context<'_>,
        video_id: ID,
        resolution: Resolution,
        start_time_seconds: Option<f64>,
        end_time_seconds: Option<f64>,
    ) -> async_graphql::Result<StartTranscodeResult> {
        use crate::graphql::types::TranscodeJob;
        use crate::services::chunker::{start_transcode_job, StartJobResult};
        let app_ctx = ctx.data_unchecked::<crate::config::AppContext>();
        let (_, local_id) = from_global_id(&video_id)?;
        let result = start_transcode_job(
            app_ctx,
            &local_id,
            resolution,
            start_time_seconds,
            end_time_seconds,
        )
        .await;
        Ok(match result {
            StartJobResult::Ok(job) => {
                StartTranscodeResult::TranscodeJob(TranscodeJob::from_active(&job))
            }
            StartJobResult::Error {
                code,
                message,
                retryable,
                retry_after_ms,
            } => StartTranscodeResult::PlaybackError(PlaybackError {
                code,
                message,
                retryable,
                retry_after_ms: retry_after_ms.map(|n| n as i32),
            }),
        })
    }

    async fn create_library(
        &self,
        ctx: &Context<'_>,
        name: String,
        path: String,
        media_type: MediaType,
        extensions: Vec<String>,
    ) -> async_graphql::Result<Library> {
        let app_ctx = ctx.data_unchecked::<crate::config::AppContext>();
        let row = create_library(
            &app_ctx.db,
            &name,
            &path,
            media_type.to_internal(),
            &extensions,
        )?;
        // Fire-and-forget background scan so a freshly-added profile gets
        // indexed without the user having to click "Scan All".
        let spawn_ctx = app_ctx.clone();
        tokio::spawn(async move {
            crate::services::library_scanner::scan_libraries(&spawn_ctx).await;
        });
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
                poster_local_path: None,
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

    async fn add_film_to_watchlist(
        &self,
        ctx: &Context<'_>,
        film_id: ID,
    ) -> async_graphql::Result<WatchlistItem> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&film_id)?;
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
        film_id: ID,
        progress_seconds: f64,
    ) -> async_graphql::Result<WatchlistItem> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&film_id)?;
        let row = update_watchlist_progress(db, &local_id, progress_seconds)?
            .ok_or_else(|| async_graphql::Error::new("No watchlist item for film"))?;
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
