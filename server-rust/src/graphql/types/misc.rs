//! Small leaf types that don't fit into a larger domain file.

use async_graphql::{SimpleObject, ID};

use crate::graphql::scalars::ProfileStatus;
use crate::relay::to_global_id;
use crate::services::availability_state::AvailabilityEvent;

/// The currently-authenticated user. Sourced from the verified JWT's
/// `sub` claim — `id` is the Supabase UUID. `null` query result means no
/// valid `Authorization` header was attached (or `SUPABASE_JWKS_URL` is
/// not configured); resolvers do not gate on this in alpha.
#[derive(SimpleObject, Clone)]
pub struct CurrentUser {
    pub id: ID,
}

#[derive(SimpleObject, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
}

#[derive(SimpleObject, Clone)]
pub struct SettingEntry {
    pub key: String,
    pub value: Option<String>,
}

#[derive(SimpleObject, Clone)]
pub struct LibraryScanUpdate {
    pub scanning: bool,
}

/// A single library's reachability, pushed over `profileAvailabilityUpdated`.
/// `libraryId` is the global `Library.id`.
#[derive(SimpleObject, Clone)]
pub struct ProfileAvailability {
    pub library_id: ID,
    pub status: ProfileStatus,
    pub last_seen_at: Option<String>,
}

impl From<&AvailabilityEvent> for ProfileAvailability {
    fn from(e: &AvailabilityEvent) -> Self {
        Self {
            library_id: ID(to_global_id("Library", &e.library_id)),
            status: ProfileStatus::from_internal(&e.status).unwrap_or(ProfileStatus::Unknown),
            last_seen_at: e.last_seen_at.clone(),
        }
    }
}

#[derive(SimpleObject, Clone)]
pub struct LibraryScanProgress {
    pub scanning: bool,
    pub library_id: Option<ID>,
    pub done: Option<i32>,
    pub total: Option<i32>,
    /// Sub-phase of the current scan. Wire values: `"scanning_files"`
    /// (file walk + ffprobe), `"discovering_tv"` (TV-show hierarchy
    /// build), `"fetching_omdb"` (per-show OMDb fetch), `"auto_matching"`
    /// (per-video metadata match). Older clients that don't surface this
    /// field continue to render the existing done/total numerics.
    pub phase: Option<String>,
    /// Free-text label of the item currently being processed (movie
    /// filename, TV show title, "Breaking Bad S03", …). Drives the
    /// "Fetching <X>…" client UI element. `None` when the scanner is
    /// between items.
    pub current_item: Option<String>,
}
