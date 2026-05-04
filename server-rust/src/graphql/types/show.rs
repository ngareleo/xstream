//! `Show` — a logical TV series owning `seasons` + `episodes` tree. Mirrors `Film` at entity layer.

use std::collections::HashMap;

use async_graphql::{Context, Object, SimpleObject, ID};

use super::library::Library;
use super::node::PageInfo;
use super::season::Season;
use crate::db::{
    get_episodes_by_show, get_library_by_id, get_seasons_by_show, get_show_metadata,
    get_videos_by_show_id, Db, ShowRow, VideoRow,
};
use crate::graphql::types::episode::Episode;
use crate::relay::to_global_id;

#[derive(Clone)]
pub struct Show {
    pub id: ID,
    pub title: String,
    pub year: Option<i32>,
    pub raw: ShowRow,
}

impl Show {
    pub fn from_row(row: &ShowRow) -> Self {
        Self {
            id: ID(to_global_id("Show", &row.id)),
            title: row.title.clone(),
            year: row.year,
            raw: row.clone(),
        }
    }
}

#[Object]
impl Show {
    pub async fn id(&self) -> &ID {
        &self.id
    }
    async fn title(&self) -> &str {
        &self.title
    }
    async fn year(&self) -> Option<i32> {
        self.year
    }

    /// OMDb-matched details. Null for unmatched shows.
    async fn metadata(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<ShowMetadata>> {
        let db = ctx.data_unchecked::<Db>();
        Ok(get_show_metadata(db, &self.raw.id)?.map(ShowMetadata::from_row))
    }

    /// Distinct libraries that contain at least one episode file for
    /// this show. Surfaces the "Available in: <profiles>" line in the
    /// detail overlay.
    async fn profiles(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Library>> {
        let db = ctx.data_unchecked::<Db>();
        let videos = get_videos_by_show_id(db, &self.raw.id)?;
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut out: Vec<Library> = Vec::new();
        for v in &videos {
            if seen.insert(v.library_id.clone()) {
                if let Some(lib) = get_library_by_id(db, &v.library_id)? {
                    out.push(Library::from_row(&lib));
                }
            }
        }
        Ok(out)
    }

    /// Full season tree merged from `seasons` + `episodes`. Each
    /// `Episode` carries its `copies` (every `videos` row with a
    /// matching coordinate) — N+1-free: every video row is fetched once
    /// up front and grouped by coordinate.
    async fn seasons(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<Season>> {
        let db = ctx.data_unchecked::<Db>();
        let seasons = get_seasons_by_show(db, &self.raw.id)?;
        let episodes = get_episodes_by_show(db, &self.raw.id)?;
        let videos = get_videos_by_show_id(db, &self.raw.id)?;

        let mut by_coord: HashMap<(i64, i64), Vec<VideoRow>> = HashMap::new();
        for v in videos {
            if let (Some(s), Some(e)) = (v.show_season, v.show_episode) {
                by_coord.entry((s, e)).or_default().push(v);
            }
        }

        let mut tree: Vec<Season> = Vec::with_capacity(seasons.len());
        for season in seasons {
            let eps: Vec<Episode> = episodes
                .iter()
                .filter(|e| e.season_number == season.season_number)
                .map(|e| {
                    let coord = (e.season_number, e.episode_number);
                    let copies = by_coord.get(&coord).cloned().unwrap_or_default();
                    Episode::from_row(e, &copies)
                })
                .collect();
            tree.push(Season {
                season_number: season.season_number as i32,
                episodes: eps,
            });
        }
        Ok(tree)
    }
}

/// OMDb-derived show metadata. Mirrors `VideoMetadata`.
#[derive(SimpleObject, Clone)]
pub struct ShowMetadata {
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

impl ShowMetadata {
    pub fn from_row(row: crate::db::ShowMetadataRow) -> Self {
        let cast: Vec<String> = match row.cast_list.as_deref() {
            None => Vec::new(),
            Some(raw) => match serde_json::from_str(raw) {
                Ok(v) => v,
                Err(err) => {
                    tracing::warn!(
                        show_id = %row.show_id,
                        raw = %raw,
                        error = %err,
                        "show_metadata.cast_list held malformed JSON — rendering empty cast"
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
            poster_url: crate::graphql::types::poster_url_for_metadata(
                row.poster_local_path.as_deref(),
                row.poster_url.as_deref(),
            ),
        }
    }
}

#[derive(SimpleObject, Clone)]
pub struct ShowEdge {
    pub node: Show,
    pub cursor: String,
}

#[derive(SimpleObject, Clone)]
pub struct ShowConnection {
    pub edges: Vec<ShowEdge>,
    pub page_info: PageInfo,
    pub total_count: i32,
}
