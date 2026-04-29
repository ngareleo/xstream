//! `PlaybackSession` — one entry per recorded play start, keyed by trace id.

use async_graphql::{SimpleObject, ID};

use crate::graphql::scalars::Resolution;

#[derive(SimpleObject, Clone)]
pub struct PlaybackSession {
    pub id: ID,
    pub trace_id: String,
    pub video_title: String,
    pub resolution: Resolution,
    pub started_at: String,
}
