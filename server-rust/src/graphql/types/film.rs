//! `Film` — a logical movie entity owning one or more `Video` file rows
//! (the file copies on disk). A user typically interacts with films, not
//! individual video files; the player picks which copy to play.
//!
//! See `docs/architecture/Library-Scan/01-Filename-Conventions.md` for the
//! Film entity contract and dedup rules.

use async_graphql::{Context, Object, SimpleObject, ID};

use super::node::PageInfo;
use super::video::{Video, VideoMetadata};
use crate::db::{get_metadata_by_video_id, get_videos_by_film_id, Db, FilmRow, VideoRow};
use crate::relay::to_global_id;

#[derive(Clone)]
pub struct Film {
    pub id: ID,
    pub title: String,
    pub year: Option<i32>,
    pub raw: FilmRow,
}

impl Film {
    pub fn from_row(row: &FilmRow) -> Self {
        Self {
            id: ID(to_global_id("Film", &row.id)),
            title: row.title.clone(),
            year: row.year,
            raw: row.clone(),
        }
    }
}

#[Object]
impl Film {
    pub async fn id(&self) -> &ID {
        &self.id
    }
    async fn title(&self) -> &str {
        &self.title
    }
    async fn year(&self) -> Option<i32> {
        self.year
    }

    /// Lifted from the bestCopy's `video_metadata` row (all copies of the
    /// same Film share the same OMDb match). Null for unmatched films.
    async fn metadata(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<VideoMetadata>> {
        let db = ctx.data_unchecked::<Db>();
        let videos = get_videos_by_film_id(db, &self.raw.id)?;
        for v in &videos {
            if let Some(m) = get_metadata_by_video_id(db, &v.id)? {
                return Ok(Some(VideoMetadata::from_row(m)));
            }
        }
        Ok(None)
    }

    /// `role='main'` rows — the canonical movie file in each containing
    /// folder. Sorted highest-resolution first, then by bitrate desc, so
    /// the variant picker renders best-first by default.
    async fn copies(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Video>> {
        let db = ctx.data_unchecked::<Db>();
        let rows = get_videos_by_film_id(db, &self.raw.id)?;
        Ok(rows
            .into_iter()
            .filter(|v| v.role == "main")
            .map(|r| Video::from_row(&r))
            .collect())
    }

    /// `role='extra'` rows — trailers, deleted scenes, behind-the-scenes
    /// living alongside the main file in the movie's folder.
    async fn extras(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Video>> {
        let db = ctx.data_unchecked::<Db>();
        let rows = get_videos_by_film_id(db, &self.raw.id)?;
        Ok(rows
            .into_iter()
            .filter(|v| v.role == "extra")
            .map(|r| Video::from_row(&r))
            .collect())
    }

    /// First entry in `copies` after the resolution+bitrate sort. Errors if
    /// the Film has no main copies (a Film row with zero `role='main'`
    /// videos is an invariant violation; the scanner shouldn't produce
    /// one).
    async fn best_copy(&self, ctx: &Context<'_>) -> async_graphql::Result<Video> {
        let db = ctx.data_unchecked::<Db>();
        let rows = get_videos_by_film_id(db, &self.raw.id)?;
        let best: Option<VideoRow> = rows.into_iter().find(|v| v.role == "main");
        match best {
            Some(r) => Ok(Video::from_row(&r)),
            None => Err(async_graphql::Error::new(format!(
                "Film {:?} has no main copies — invariant violation",
                self.id
            ))),
        }
    }
}

#[derive(SimpleObject, Clone)]
pub struct FilmEdge {
    pub node: Film,
    pub cursor: String,
}

#[derive(SimpleObject, Clone)]
pub struct FilmConnection {
    pub edges: Vec<FilmEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}
