//! Root Query — read-only resolvers over the local SQLite DB.

use async_graphql::{Context, Object, ID};

use crate::db::{
    self, count_films, count_shows, get_film_by_id, get_job_by_id, get_library_by_id,
    get_show_by_id, get_video_by_id, get_videos, get_watchlist, get_watchlist_item_by_id,
    list_films, list_shows, Db, FilmsFilter, ShowsFilter,
};
use crate::graphql::scalars::MediaType;
use crate::graphql::types::{
    DirEntry, Film, FilmConnection, FilmEdge, Library, Node, OmdbSearchResult, SettingEntry, Show,
    ShowConnection, ShowEdge, TranscodeJob, Video, VideoConnection, VideoEdge, WatchlistItem,
};
#[cfg(feature = "dev-features")]
use crate::graphql::types::PlaybackSession;
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
            "Film" => Ok(get_film_by_id(db, &local_id)?.map(|r| Film::from_row(&r).into())),
            "Show" => Ok(get_show_by_id(db, &local_id)?.map(|r| Show::from_row(&r).into())),
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

    /// Films are the homepage Movies row's source of truth — paginated,
    /// server-filterable. One Film per logical movie; multiple `videos`
    /// (file copies) hang off `Film.copies`. See
    /// `docs/architecture/Library-Scan/01-Filename-Conventions.md`.
    async fn films(
        &self,
        ctx: &Context<'_>,
        first: Option<i32>,
        library_id: Option<ID>,
        search: Option<String>,
    ) -> async_graphql::Result<FilmConnection> {
        let db = ctx.data_unchecked::<Db>();
        let local_library_id = library_id
            .as_deref()
            .map(|s| from_global_id(s))
            .transpose()?
            .map(|(_, id)| id);
        let limit = first.unwrap_or(200) as i64;
        let filter = FilmsFilter {
            library_id: local_library_id,
            search,
        };
        let total = count_films(db, filter.clone())? as i32;
        let rows = list_films(db, limit, filter)?;
        Ok(FilmConnection {
            edges: rows
                .iter()
                .map(|row| FilmEdge {
                    node: Film::from_row(row),
                    cursor: String::new(),
                })
                .collect(),
            page_info: Default::default(),
            total_count: total,
        })
    }

    async fn film(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Film>> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        Ok(get_film_by_id(db, &local_id)?.map(|r| Film::from_row(&r)))
    }

    /// Shows are the homepage TV row's source of truth — paginated,
    /// server-filterable. One Show per logical series; multiple `videos`
    /// (episode files, possibly across libraries) hang off
    /// `Show.seasons → episode.copies`. See
    /// `docs/architecture/Library-Scan/03-Show-Entity.md`.
    async fn shows(
        &self,
        ctx: &Context<'_>,
        first: Option<i32>,
        library_id: Option<ID>,
        search: Option<String>,
    ) -> async_graphql::Result<ShowConnection> {
        let db = ctx.data_unchecked::<Db>();
        let local_library_id = library_id
            .as_deref()
            .map(|s| from_global_id(s))
            .transpose()?
            .map(|(_, id)| id);
        let limit = first.unwrap_or(200) as i64;
        let filter = ShowsFilter {
            library_id: local_library_id,
            search,
        };
        let total = count_shows(db, filter.clone())? as i32;
        let rows = list_shows(db, limit, filter)?;
        Ok(ShowConnection {
            edges: rows
                .iter()
                .map(|row| ShowEdge {
                    node: Show::from_row(row),
                    cursor: String::new(),
                })
                .collect(),
            page_info: Default::default(),
            total_count: total,
        })
    }

    async fn show(&self, ctx: &Context<'_>, id: ID) -> async_graphql::Result<Option<Show>> {
        let db = ctx.data_unchecked::<Db>();
        let (_, local_id) = from_global_id(&id)?;
        Ok(get_show_by_id(db, &local_id)?.map(|r| Show::from_row(&r)))
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

    /// OMDb free-text search behind the DetailPane edit picker. Reads
    /// the `OmdbClient` off `AppContext` and forwards to its
    /// `search_list`. Returns an empty Vec when no API key is configured
    /// or the call fails (same shape OMDb uses on quota exhaustion /
    /// network failure) so the client renders its "no matches" branch
    /// gracefully.
    async fn search_omdb(
        &self,
        ctx: &Context<'_>,
        query: String,
        year: Option<i32>,
    ) -> async_graphql::Result<Vec<OmdbSearchResult>> {
        let app_ctx = ctx.data_unchecked::<crate::config::AppContext>();
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        let Some(omdb) = app_ctx.omdb.as_ref() else {
            return Ok(Vec::new());
        };
        let hits = omdb.search_list(trimmed, year).await;
        Ok(hits
            .into_iter()
            .map(|h| OmdbSearchResult {
                imdb_id: h.imdb_id,
                title: h.title,
                year: h.year.and_then(|y| i32::try_from(y).ok()),
                poster_url: h.poster_url,
                plot: None,
            })
            .collect())
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

    #[cfg(feature = "dev-features")]
    async fn playback_history(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<PlaybackSession>> {
        let db = ctx.data_unchecked::<Db>();
        let rows = db::get_playback_history(db, 50)?;
        Ok(rows
            .into_iter()
            .map(|r| {
                let resolution = crate::graphql::scalars::Resolution::from_internal(&r.resolution)
                    .unwrap_or_else(|| {
                        tracing::warn!(
                            playback_session_id = %r.id,
                            raw = %r.resolution,
                            "playback_history.resolution held an unknown value — defaulting to 1080p"
                        );
                        crate::graphql::scalars::Resolution::R1080p
                    });
                PlaybackSession {
                    id: ID(r.id),
                    trace_id: r.trace_id,
                    video_title: r.video_title,
                    resolution,
                    started_at: r.started_at,
                }
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
