//! `Library` + `LibraryStats` — paginated videos field, aggregated totals in stats.

use async_graphql::{ComplexObject, Context, SimpleObject, ID};

use super::video::{Video, VideoConnection, VideoEdge};
use crate::db::{
    self, count_matched_by_library, count_videos_by_library, get_videos_by_library,
    sum_file_size_by_library, Db, LibraryRow,
};
use crate::graphql::scalars::{MediaType, ProfileStatus};
use crate::relay::{decode_cursor, encode_cursor, to_global_id};

const MAX_PAGE_SIZE: i32 = 100;

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct Library {
    pub id: ID,
    pub name: String,
    pub path: String,
    pub media_type: MediaType,
    pub video_extensions: Vec<String>,
    /// Reachability of this library's storage path. `ONLINE` when the
    /// path stats as a directory, `OFFLINE` when it doesn't (drive
    /// unplugged, NAS unreachable), `UNKNOWN` until the first probe
    /// cycle lands. Driven by `services::profile_availability`.
    pub status: ProfileStatus,
    /// ISO-8601 timestamp of the most recent probe. Null until the first
    /// probe runs.
    pub last_seen_at: Option<String>,
    #[graphql(skip)]
    pub raw_id: String,
}

impl Library {
    pub fn from_row(row: &LibraryRow) -> Self {
        // `video_extensions` is a TEXT column the writer always serialises as
        // a JSON string array. If a row holds malformed JSON (DB corruption,
        // schema-version mismatch, an external writer), surface the failure
        // visibly via tracing::warn — *don't* silently render an empty list,
        // which would make the row look like it has no extensions at all.
        let video_extensions: Vec<String> = match serde_json::from_str(&row.video_extensions) {
            Ok(v) => v,
            Err(err) => {
                tracing::warn!(
                    library_id = %row.id,
                    raw = %row.video_extensions,
                    error = %err,
                    "libraries.video_extensions held malformed JSON — rendering as empty"
                );
                Vec::new()
            }
        };
        Self {
            id: ID(to_global_id("Library", &row.id)),
            name: row.name.clone(),
            path: row.path.clone(),
            media_type: MediaType::from_internal(&row.media_type).unwrap_or_else(|| {
                tracing::warn!(
                    library_id = %row.id,
                    raw = %row.media_type,
                    "libraries.media_type held an unknown value — defaulting to MOVIES"
                );
                MediaType::Movies
            }),
            video_extensions,
            status: ProfileStatus::from_internal(&row.status).unwrap_or_else(|| {
                tracing::warn!(
                    library_id = %row.id,
                    raw = %row.status,
                    "libraries.status held an unknown value — defaulting to UNKNOWN"
                );
                ProfileStatus::Unknown
            }),
            last_seen_at: row.last_seen_at.clone(),
            raw_id: row.id.clone(),
        }
    }
}

#[ComplexObject]
impl Library {
    async fn stats(&self, ctx: &Context<'_>) -> async_graphql::Result<LibraryStats> {
        let db = ctx.data_unchecked::<Db>();
        let total = count_videos_by_library(db, &self.raw_id, Default::default())?;
        let (matched, unmatched) = count_matched_by_library(db, &self.raw_id)?;
        let total_size = sum_file_size_by_library(db, &self.raw_id)?;
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
        let db = ctx.data_unchecked::<Db>();
        let first = first.unwrap_or(20);
        let offset: i64 = match &after {
            Some(c) => (decode_cursor(c)? as i64) + 1,
            None => 0,
        };
        let limit = first.clamp(0, MAX_PAGE_SIZE) as i64;
        let filter = db::VideoFilter {
            search: search.clone(),
            media_type: media_type.map(|m| m.to_internal().to_string()),
        };
        let rows = get_videos_by_library(db, &self.raw_id, limit, offset, filter.clone())?;
        let total = count_videos_by_library(db, &self.raw_id, filter)?;

        let edges: Vec<VideoEdge> = rows
            .iter()
            .enumerate()
            .map(|(i, row)| VideoEdge {
                node: Video::from_row(row),
                cursor: encode_cursor(offset as usize + i),
            })
            .collect();

        let page_info = super::node::PageInfo {
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
