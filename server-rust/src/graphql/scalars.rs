//! GraphQL enum types — must match the Bun SDL byte-equivalent at the
//! enum-name and variant-name level, AND match the Bun mapper contract:
//! every `from_internal` returns `Option<Self>`, with `None` on an unknown
//! input. The Bun side throws on unknown; the Rust side returns None and
//! lets the caller decide whether to log + degrade or propagate as a typed
//! error. Either way the unhappy path is visible — never a silent fallback.

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
    pub fn from_internal(s: &str) -> Option<Self> {
        Some(match s {
            "movies" => MediaType::Movies,
            "tvShows" => MediaType::TvShows,
            _ => return None,
        })
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
    pub fn from_internal(s: &str) -> Option<Self> {
        Some(match s {
            "pending" => JobStatus::Pending,
            "running" => JobStatus::Running,
            "complete" => JobStatus::Complete,
            "error" => JobStatus::Error,
            _ => return None,
        })
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

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Mirrors `server/src/graphql/__tests__/mappers.test.ts`. The Bun mapper
// throws on unknown input; the Rust mapper returns `None`. Same contract
// in different idioms — either way the unhappy path is visible to the
// caller. Round-trip every variant, then assert unknown values resolve
// to `None`.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolution_round_trips_every_variant() {
        const ALL: &[(&str, Resolution)] = &[
            ("240p", Resolution::R240p),
            ("360p", Resolution::R360p),
            ("480p", Resolution::R480p),
            ("720p", Resolution::R720p),
            ("1080p", Resolution::R1080p),
            ("4k", Resolution::R4k),
        ];
        for (internal, expected) in ALL {
            let parsed = Resolution::from_internal(internal).expect("known internal value parses");
            assert_eq!(parsed, *expected, "from_internal({internal})");
            assert_eq!(parsed.to_internal(), *internal, "to_internal round-trip");
        }
    }

    #[test]
    fn resolution_returns_none_on_unknown_value() {
        // Bun side throws — Rust side returns None. Either way the unhappy
        // path is visible to the caller (no silent fallback).
        assert!(Resolution::from_internal("8k").is_none());
        assert!(Resolution::from_internal("").is_none());
        assert!(Resolution::from_internal("RESOLUTION_240P").is_none()); // wrong direction
    }

    #[test]
    fn job_status_round_trips_every_variant() {
        const ALL: &[(&str, JobStatus)] = &[
            ("pending", JobStatus::Pending),
            ("running", JobStatus::Running),
            ("complete", JobStatus::Complete),
            ("error", JobStatus::Error),
        ];
        for (internal, expected) in ALL {
            let parsed = JobStatus::from_internal(internal).expect("known internal value parses");
            assert_eq!(parsed, *expected, "from_internal({internal})");
        }
    }

    #[test]
    fn job_status_is_case_sensitive_and_rejects_unknowns() {
        // Same case-sensitivity assertion the Bun test pins.
        assert!(JobStatus::from_internal("RUNNING").is_none());
        assert!(JobStatus::from_internal("paused").is_none());
        assert!(JobStatus::from_internal("").is_none());
    }

    #[test]
    fn media_type_round_trips_every_variant() {
        const ALL: &[(&str, MediaType)] = &[
            ("movies", MediaType::Movies),
            ("tvShows", MediaType::TvShows),
        ];
        for (internal, expected) in ALL {
            let parsed = MediaType::from_internal(internal).expect("known internal value parses");
            assert_eq!(parsed, *expected, "from_internal({internal})");
            assert_eq!(parsed.to_internal(), *internal, "to_internal round-trip");
        }
    }

    #[test]
    fn media_type_rejects_unknowns_and_typos() {
        // Mirrors the Bun assertions: "MUSIC" (other media), "MOVIE"
        // (singular vs plural typo), and "MOVIES" (wrong direction —
        // that's the GraphQL form, not the internal form).
        assert!(MediaType::from_internal("music").is_none());
        assert!(MediaType::from_internal("movie").is_none());
        assert!(MediaType::from_internal("MOVIES").is_none());
        assert!(MediaType::from_internal("").is_none());
    }
}
