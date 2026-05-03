//! Relay `Node` interface + `PageInfo`. Every globally-addressable type
//! must implement Node (`{ id: ID! }`).

use async_graphql::{Interface, SimpleObject, ID};

use super::film::Film;
use super::library::Library;
use super::transcode_job::TranscodeJob;
use super::video::Video;
use super::watchlist::WatchlistItem;

#[derive(Interface)]
#[graphql(field(name = "id", ty = "&ID"))]
pub enum Node {
    Library(Library),
    Video(Video),
    Film(Film),
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
