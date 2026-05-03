//! GraphQL object types.
//!
//! Field nullability, arg defaults, and enum-variant names are part of the
//! published wire contract — the SDL-parity check fails on any drift and
//! the Relay client's generated artifacts won't deserialise.
//!
//! One file per domain to keep individual files small and the SDL-parity
//! diff easy to read when something drifts.

pub mod episode;
mod film;
mod library;
mod misc;
mod node;
mod omdb;
mod playback_session;
pub mod season;
mod transcode_job;
mod video;
mod watchlist;

pub use episode::Episode;
pub use film::{Film, FilmConnection, FilmEdge};
pub use library::{Library, LibraryStats};
pub use misc::{DirEntry, LibraryScanProgress, LibraryScanUpdate, SettingEntry};
pub use node::{Node, PageInfo};
pub use omdb::OmdbSearchResult;
pub use playback_session::PlaybackSession;
pub use season::Season;
pub use transcode_job::{PlaybackError, StartTranscodeResult, TranscodeJob};
pub use video::{
    AudioStreamInfo, Video, VideoConnection, VideoEdge, VideoMetadata, VideoStreamInfo,
};
pub use watchlist::WatchlistItem;
