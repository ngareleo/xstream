//! Relay `Node` interface + `PageInfo` — every globally-addressable type implements Node.

use async_graphql::{Interface, SimpleObject, ID};

use super::film::Film;
use super::library::Library;
use super::show::Show;
use super::transcode_job::TranscodeJob;
use super::video::Video;
use super::watchlist::WatchlistItem;

// Variants are GraphQL-typed structs of varying sizes; boxing one to
// equalise stack footprint would force every constructor + match arm to
// add the indirection without any practical benefit (this enum is only
// ever held briefly during resolver dispatch, never in hot loops).
#[allow(clippy::large_enum_variant)]
#[derive(Interface)]
#[graphql(field(name = "id", ty = "&ID"))]
pub enum Node {
    Library(Library),
    Video(Video),
    Film(Film),
    Show(Show),
    WatchlistItem(WatchlistItem),
    TranscodeJob(TranscodeJob),
}

#[derive(SimpleObject, Default, Clone)]
pub struct PageInfo {
    pub has_next_page: bool,
    pub has_previous_page: bool,
    pub start_cursor: Option<String>,
    pub end_cursor: Option<String>,
}
