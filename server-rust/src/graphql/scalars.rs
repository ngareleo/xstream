//! GraphQL enum types — must match the Bun SDL byte-equivalent at the
//! enum-name and variant-name level.

use async_graphql::Enum;

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
#[graphql(name = "MediaType")]
pub enum MediaType {
    #[graphql(name = "MOVIES")]
    Movies,
    #[graphql(name = "TV_SHOWS")]
    TvShows,
}

impl MediaType {
    pub fn from_internal(s: &str) -> Self {
        match s {
            "movies" => MediaType::Movies,
            "tvShows" => MediaType::TvShows,
            _ => MediaType::Movies,
        }
    }
    pub fn to_internal(self) -> &'static str {
        match self {
            MediaType::Movies => "movies",
            MediaType::TvShows => "tvShows",
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
#[graphql(name = "Resolution")]
pub enum Resolution {
    #[graphql(name = "RESOLUTION_240P")]
    R240p,
    #[graphql(name = "RESOLUTION_360P")]
    R360p,
    #[graphql(name = "RESOLUTION_480P")]
    R480p,
    #[graphql(name = "RESOLUTION_720P")]
    R720p,
    #[graphql(name = "RESOLUTION_1080P")]
    R1080p,
    #[graphql(name = "RESOLUTION_4K")]
    R4k,
}

impl Resolution {
    pub fn from_internal(s: &str) -> Option<Self> {
        Some(match s {
            "240p" => Resolution::R240p,
            "360p" => Resolution::R360p,
            "480p" => Resolution::R480p,
            "720p" => Resolution::R720p,
            "1080p" => Resolution::R1080p,
            "4k" => Resolution::R4k,
            _ => return None,
        })
    }
    pub fn to_internal(self) -> &'static str {
        match self {
            Resolution::R240p => "240p",
            Resolution::R360p => "360p",
            Resolution::R480p => "480p",
            Resolution::R720p => "720p",
            Resolution::R1080p => "1080p",
            Resolution::R4k => "4k",
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
#[graphql(name = "JobStatus")]
pub enum JobStatus {
    #[graphql(name = "PENDING")]
    Pending,
    #[graphql(name = "RUNNING")]
    Running,
    #[graphql(name = "COMPLETE")]
    Complete,
    #[graphql(name = "ERROR")]
    Error,
}

impl JobStatus {
    pub fn from_internal(s: &str) -> Self {
        match s {
            "pending" => JobStatus::Pending,
            "running" => JobStatus::Running,
            "complete" => JobStatus::Complete,
            "error" => JobStatus::Error,
            _ => JobStatus::Pending,
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Debug)]
#[graphql(name = "PlaybackErrorCode")]
pub enum PlaybackErrorCode {
    /// The server hit MAX_CONCURRENT_JOBS. Recoverable — retry after retryAfterMs.
    #[graphql(name = "CAPACITY_EXHAUSTED")]
    CapacityExhausted,
    /// The requested videoId does not exist in the DB. Non-retryable.
    #[graphql(name = "VIDEO_NOT_FOUND")]
    VideoNotFound,
    /// ffprobe rejected the source file. Non-retryable for this resolution.
    #[graphql(name = "PROBE_FAILED")]
    ProbeFailed,
    /// ffmpeg failed every fallback tier (HW → sw-pad → software). Non-retryable.
    #[graphql(name = "ENCODE_FAILED")]
    EncodeFailed,
    /// Catch-all for unexpected server failures (DB write, mkdir, …). Non-retryable.
    #[graphql(name = "INTERNAL")]
    Internal,
}
