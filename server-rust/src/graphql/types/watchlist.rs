//! `WatchlistItem` — one row per saved video.

use async_graphql::{Context, Object, ID};

use super::video::Video;
use crate::db::{get_video_by_id, Db, WatchlistItemRow};
use crate::relay::to_global_id;

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
    pub async fn id(&self) -> &ID {
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
