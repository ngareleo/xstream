//! GraphQL object types — structural mirror of the Bun `schema.ts` typeDefs.
//!
//! Field nullability, arg defaults, and enum-variant names must match
//! byte-equivalent or the SDL parity check fails and the Relay client's
//! generated artifacts won't deserialise.
//!
//! One file per domain to keep individual files small and the SDL-parity
//! diff easy to read when something drifts.

mod library;
mod misc;
mod node;
mod omdb;
mod playback_session;
mod transcode_job;
mod video;
mod watchlist;

pub use library::{Library, LibraryStats};
pub use misc::{DirEntry, LibraryScanProgress, LibraryScanUpdate, SettingEntry};
pub use node::{Node, PageInfo};
pub use omdb::OmdbSearchResult;
pub use playback_session::PlaybackSession;
pub use transcode_job::{PlaybackError, StartTranscodeResult, TranscodeJob};
pub use video::{
    AudioStreamInfo, Video, VideoConnection, VideoEdge, VideoMetadata, VideoStreamInfo,
};
pub use watchlist::WatchlistItem;
