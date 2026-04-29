//! Per-table query modules. One file per table to mirror
//! `server/src/db/queries/*.ts`. Public surface is re-exported by
//! `crate::db` so call sites stay flat.

pub mod jobs;
pub mod libraries;
pub mod playback_history;
pub mod segments;
pub mod user_settings;
pub mod video_metadata;
pub mod videos;
pub mod watchlist;
