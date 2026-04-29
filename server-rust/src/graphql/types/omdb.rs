//! `OmdbSearchResult` — one entry per OMDb hit. Currently a Step-1 stub
//! (the resolver returns an empty list).

use async_graphql::SimpleObject;

#[derive(SimpleObject, Clone)]
pub struct OmdbSearchResult {
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub poster_url: Option<String>,
    pub plot: Option<String>,
}
