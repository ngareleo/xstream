//! Root Query — read-only resolvers. Driven by data the Bun server already
//! wrote into `tmp/xstream.db`.

use async_graphql::{Context, Object, ID};

use crate::db::{
    self, get_job_by_id, get_library_by_id, get_video_by_id, get_videos, get_watchlist,
    get_watchlist_item_by_id, Db,
};
use crate::graphql::scalars::MediaType;
use crate::graphql::types::{
    DirEntry, Library, Node, OmdbSearchResult, PlaybackSession, SettingEntry, TranscodeJob, Video,
    VideoConnection, VideoEdge, WatchlistItem,
};
use crate::relay::from_global_id;

#[derive(Default)]
pub struct Query;

#[Object]
impl Query {
    async fn node(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Node>> {
        let db = ctx.data_unchecked::<Db>();
        let (type_name, local_id) = match from_global_id(&id) {
            Ok(v) => v,
            Err(_) => return Ok(None),
        };
        match type_name.as_str() {
            "Library" => {
                Ok(get_library_by_id(db, &local_id)?.map(|r| Library::from_row(&r).into()))
            }
            "Video" => Ok(get_video_by_id(db, &local_id)?.map(|r| Video::from_row(&r).into())),
            "TranscodeJob" => {
                Ok(get_job_by_id(db, &local_id)?.map(|r| TranscodeJob::from_row(&r).into()))
            }
            "WatchlistItem" => Ok(get_watchlist_item_by_id(db, &local_id)?
                .map(|r| WatchlistItem::from_row(&r).into())),
            _ => Ok(None),
        }
    }

    async fn libraries(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Library>> {
        let db = ctx.data_unchecked::<Db>();
        Ok(db::get_all_libraries(db)?
            .iter()
            .map(Library::from_row)
            .collect())
    }

    async fn videos(
        &self,
        ctx: &Context<'_>,
        first: Option<i32>,
        library_id: Option<ID>,
        search: Option<String>,
        media_type: Option<MediaType>,
    ) -> async_graphql::Result<VideoConnection> {
        let db = ctx.data_unchecked::<Db>();
        let local_library_id = library_id
            .as_deref()
            .map(|s| from_global_id(s))
            .transpose()?
            .map(|(_, id)| id);
        let limit = first.unwrap_or(200) as i64;
        let filter = db::VideosFilter {
            library_id: local_library_id,
            search,
            media_type: media_type.map(|m| m.to_internal().to_string()),
        };
        let rows = get_videos(db, limit, filter)?;
        Ok(VideoConnection {
            edges: rows
                .iter()
                .map(|row| VideoEdge {
                    node: Video::from_row(row),
                    cursor: String::new(),
                })
                .collect(),
            page_info: Default::default(),
            total_count: rows.len() as i32,
        })
    }

    async fn video(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Video>> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        Ok(get_video_by_id(db, &local_id)?.map(|r| Video::from_row(&r)))
    }

    async fn transcode_job(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> async_graphql::Result<Option<TranscodeJob>> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        Ok(get_job_by_id(db, &local_id)?.map(|r| TranscodeJob::from_row(&r)))
    }

    async fn watchlist(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<WatchlistItem>> {
        let db = ctx.data_unchecked::<Db>();
        Ok(get_watchlist(db)?
            .iter()
            .map(WatchlistItem::from_row)
            .collect())
    }

    /// OMDb search — Step 1 stub; returns empty list. Implemented for real
    /// when the OMDb client lands in the Rust server (Step 2 area).
    async fn search_omdb(
        &self,
        _query: String,
        _year: Option<i32>,
    ) -> async_graphql::Result<Vec<OmdbSearchResult>> {
        Ok(Vec::new())
    }

    async fn list_directory(&self, path: String) -> async_graphql::Result<Vec<DirEntry>> {
        let mut out: Vec<DirEntry> = Vec::new();
        let read = match tokio::fs::read_dir(&path).await {
            Ok(r) => r,
            Err(_) => return Ok(out),
        };
        let mut read = read;
        while let Some(entry) = read.next_entry().await.unwrap_or(None) {
            let ft = match entry.file_type().await {
                Ok(t) => t,
                Err(_) => continue,
            };
            if !ft.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let p = entry.path().to_string_lossy().into_owned();
            out.push(DirEntry { name, path: p });
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    async fn playback_history(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<PlaybackSession>> {
        let db = ctx.data_unchecked::<Db>();
        let rows = db::get_playback_history(db, 50)?;
        Ok(rows
            .into_iter()
            .map(|r| PlaybackSession {
                id: ID(r.id),
                trace_id: r.trace_id,
                video_title: r.video_title,
                resolution: crate::graphql::scalars::Resolution::from_internal(&r.resolution)
                    .unwrap_or(crate::graphql::scalars::Resolution::R1080p),
                started_at: r.started_at,
            })
            .collect())
    }

    async fn settings(
        &self,
        ctx: &Context<'_>,
        keys: Vec<String>,
    ) -> async_graphql::Result<Vec<SettingEntry>> {
        let db = ctx.data_unchecked::<Db>();
        let mut out = Vec::with_capacity(keys.len());
        for key in keys {
            let value = db::get_setting(db, &key)?;
            out.push(SettingEntry { key, value });
        }
        Ok(out)
    }
}
