//! GraphQL enum types — all names are part of the published SDL wire contract (locked in `scripts/check-sdl-parity.ts`).

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

    /// Map a probed pixel height to the closest Resolution rung, rounding
    /// DOWN (i.e. floor to the highest rung whose threshold is ≤ the
    /// input). Heights below 240 clamp up to `R240p` — the lowest rung is
    /// the floor, not a typed error, because we'd rather expose a low-res
    /// source than refuse to play it.
    pub fn from_height(height: i64) -> Self {
        const RUNGS: &[(i64, Resolution)] = &[
            (2160, Resolution::R4k),
            (1080, Resolution::R1080p),
            (720, Resolution::R720p),
            (480, Resolution::R480p),
            (360, Resolution::R360p),
            (240, Resolution::R240p),
        ];
        for (threshold, label) in RUNGS {
            if height >= *threshold {
                return *label;
            }
        }
        Resolution::R240p
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
#[graphql(name = "ProfileStatus")]
pub enum ProfileStatus {
    /// Library path is reachable and is a directory — content is
    /// playable. Set by `services::profile_availability` after a
    /// successful probe.
    #[graphql(name = "ONLINE")]
    Online,
    /// Library path is missing, denied, or no longer a directory.
    /// Existing rows stay catalogued (so the user can still browse) but
    /// playback is blocked at the picker.
    #[graphql(name = "OFFLINE")]
    Offline,
    /// Default for fresh rows — the probe has not run yet (it lands one
    /// cycle after server start). Treated as "trust nothing" by the
    /// client.
    #[graphql(name = "UNKNOWN")]
    Unknown,
}

impl ProfileStatus {
    pub fn from_internal(s: &str) -> Option<Self> {
        Some(match s {
            "online" => ProfileStatus::Online,
            "offline" => ProfileStatus::Offline,
            "unknown" => ProfileStatus::Unknown,
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

//
// Round-trip every variant, then assert unknown values resolve to `None`.
// The unhappy path must be visible to the caller — never a silent
// fallback to a default variant.

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
        // Unhappy path is visible to the caller — no silent fallback.
        assert!(Resolution::from_internal("8k").is_none());
        assert!(Resolution::from_internal("").is_none());
        assert!(Resolution::from_internal("RESOLUTION_240P").is_none()); // wrong direction
    }

    #[test]
    fn resolution_from_height_exact_rungs() {
        for (h, expected) in [
            (240, Resolution::R240p),
            (360, Resolution::R360p),
            (480, Resolution::R480p),
            (720, Resolution::R720p),
            (1080, Resolution::R1080p),
            (2160, Resolution::R4k),
        ] {
            assert_eq!(Resolution::from_height(h), expected, "h={h}");
        }
    }

    #[test]
    fn resolution_from_height_rounds_down_between_rungs() {
        assert_eq!(Resolution::from_height(700), Resolution::R480p); // 480 ≤ 700 < 720
        assert_eq!(Resolution::from_height(1079), Resolution::R720p); // 720 ≤ 1079 < 1080
        assert_eq!(Resolution::from_height(1440), Resolution::R1080p); // 1080 ≤ 1440 < 2160
        assert_eq!(Resolution::from_height(2159), Resolution::R1080p);
    }

    #[test]
    fn resolution_from_height_clamps_below_240_up_to_r240p() {
        assert_eq!(Resolution::from_height(144), Resolution::R240p);
        assert_eq!(Resolution::from_height(0), Resolution::R240p);
    }

    #[test]
    fn resolution_from_height_treats_above_4k_as_4k() {
        assert_eq!(Resolution::from_height(4320), Resolution::R4k); // 8K probed
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
        // Wire format is the lowercase form — uppercase variants must not
        // be tolerated by the parser, since the DB writes the lowercase
        // form and a case-insensitive read would mask a write bug.
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
        // "MUSIC" (other media), "MOVIE" (singular vs plural typo), and
        // "MOVIES" (wrong direction — that's the GraphQL form, not the
        // internal form).
        assert!(MediaType::from_internal("music").is_none());
        assert!(MediaType::from_internal("movie").is_none());
        assert!(MediaType::from_internal("MOVIES").is_none());
        assert!(MediaType::from_internal("").is_none());
    }
}
