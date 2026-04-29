//! AppConfig + RESOLUTION_PROFILES — the server-wide tunables. Mirrors
//! `server/src/config.ts`. Step 2 wires the streaming-related subsections
//! (`transcode` and `stream`); other sections (scan interval, OMDb match,
//! library config) come on as later steps need them.

use crate::graphql::scalars::Resolution;

/// Encode-pipeline tunables — concurrency cap, kill grace windows, retry
/// hints. All fields default-constructible; override via builder pattern
/// when wiring `AppConfig` from env at startup.
#[derive(Clone, Debug)]
pub struct TranscodeConfig {
    /// Maximum number of concurrently encoding ffmpeg jobs. Enforced by
    /// `ffmpeg_pool` via `Arc<Semaphore>`. Killed-but-not-yet-exited jobs
    /// (held in the `dying_jobs` set) do not count toward this limit.
    pub max_concurrent_jobs: usize,
    /// SIGTERM grace period before escalating to SIGKILL on a per-job
    /// kill. Software 4K encodes can hold a fragment buffer for tens of
    /// seconds after SIGTERM while flushing; this caps the
    /// dying-zombie window.
    pub force_kill_timeout_ms: u64,
    /// Total wait for live ffmpeg processes to exit during server
    /// shutdown. Greater than `force_kill_timeout_ms` so the per-job
    /// escalation has already SIGKILLed laggards by the time this fires.
    pub shutdown_timeout_ms: u64,
    /// If a transcode job has zero stream connections after this long,
    /// kill ffmpeg. Covers prefetched chunks where the user seeks away
    /// before the stream connection opens.
    pub orphan_timeout_ms: u64,
    /// Wall-clock encode budget multiplier — actual budget =
    /// `chunk_duration_s × this × 1_000 ms`. 3× gives ~5 min headroom on
    /// software libx264 1080p worst case.
    pub max_encode_rate_multiplier: u64,
    /// Hint sent back to the client orchestrator on a `CAPACITY_EXHAUSTED`
    /// rejection so it knows when to retry. Kept short — the cap
    /// typically clears as soon as the next chunk's `notifySubscribers`
    /// fires.
    pub capacity_retry_hint_ms: u64,
    /// Max time a concurrent caller polls `job_store` waiting for a peer
    /// to finish initialising the same job before falling through.
    pub inflight_dedup_timeout_ms: u64,
}

impl Default for TranscodeConfig {
    fn default() -> Self {
        Self {
            max_concurrent_jobs: 3,
            force_kill_timeout_ms: 2_000,
            shutdown_timeout_ms: 5_000,
            orphan_timeout_ms: 30_000,
            max_encode_rate_multiplier: 3,
            capacity_retry_hint_ms: 1_000,
            inflight_dedup_timeout_ms: 5_000,
        }
    }
}

/// Stream-route tunables — currently just the idle-kill threshold.
#[derive(Clone, Debug)]
pub struct StreamConfig {
    /// Idle window before `/stream/:jobId` assumes the connection is dead
    /// and kills the job. Must be larger than the widest back-pressure
    /// halt the client can induce (~60 s with `forwardTargetS=60`); 180 s
    /// leaves defensive margin for real network blips.
    ///
    /// Do **not** weaken — see feedback memory `feedback_safety_timeouts`.
    pub connection_idle_timeout_ms: u64,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            connection_idle_timeout_ms: 180_000,
        }
    }
}

/// Encode parameters for a single resolution tier. Mirrors
/// `ResolutionProfile` in Bun.
#[derive(Clone, Debug)]
pub struct ResolutionProfile {
    pub label: Resolution,
    pub width: u32,
    pub height: u32,
    /// e.g. `"4000k"` — passed verbatim into ffmpeg `-b:v`.
    pub video_bitrate: &'static str,
    /// e.g. `"192k"` — passed verbatim into ffmpeg `-b:a`.
    pub audio_bitrate: &'static str,
    /// e.g. `"4.0"` — passed verbatim into ffmpeg `-level:v`.
    pub h264_level: &'static str,
    /// HLS segment duration in seconds.
    pub segment_duration: u32,
}

/// Per-resolution profile lookup. Static table — every supported
/// `Resolution` returns a profile.
pub fn profile_for(resolution: Resolution) -> ResolutionProfile {
    match resolution {
        Resolution::R240p => ResolutionProfile {
            label: Resolution::R240p,
            width: 426,
            height: 240,
            video_bitrate: "300k",
            audio_bitrate: "96k",
            h264_level: "3.0",
            segment_duration: 2,
        },
        Resolution::R360p => ResolutionProfile {
            label: Resolution::R360p,
            width: 640,
            height: 360,
            video_bitrate: "800k",
            audio_bitrate: "128k",
            h264_level: "3.0",
            segment_duration: 2,
        },
        Resolution::R480p => ResolutionProfile {
            label: Resolution::R480p,
            width: 854,
            height: 480,
            video_bitrate: "1500k",
            audio_bitrate: "128k",
            h264_level: "3.0",
            segment_duration: 2,
        },
        Resolution::R720p => ResolutionProfile {
            label: Resolution::R720p,
            width: 1280,
            height: 720,
            video_bitrate: "2500k",
            audio_bitrate: "192k",
            h264_level: "3.1",
            segment_duration: 2,
        },
        Resolution::R1080p => ResolutionProfile {
            label: Resolution::R1080p,
            width: 1920,
            height: 1080,
            video_bitrate: "4000k",
            audio_bitrate: "192k",
            h264_level: "4.0",
            segment_duration: 2,
        },
        Resolution::R4k => ResolutionProfile {
            label: Resolution::R4k,
            width: 3840,
            height: 2160,
            video_bitrate: "15000k",
            audio_bitrate: "192k",
            h264_level: "5.1",
            segment_duration: 2,
        },
    }
}

/// Numeric value extracted from a `videoBitrate` / `audioBitrate` string
/// like `"4000k"`. Used by the encode-argv builder to compute
/// `maxrate = videoBitrate × 1.2` and `bufsize = videoBitrate × 2`.
pub fn bitrate_kbps(bitrate: &str) -> u64 {
    bitrate
        .trim_end_matches(|c: char| !c.is_ascii_digit())
        .parse()
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_for_4k_has_expected_geometry() {
        let p = profile_for(Resolution::R4k);
        assert_eq!(p.width, 3840);
        assert_eq!(p.height, 2160);
        assert_eq!(p.video_bitrate, "15000k");
        assert_eq!(p.h264_level, "5.1");
    }

    #[test]
    fn profile_for_240p_has_expected_geometry() {
        let p = profile_for(Resolution::R240p);
        assert_eq!(p.width, 426);
        assert_eq!(p.height, 240);
        assert_eq!(p.video_bitrate, "300k");
    }

    #[test]
    fn bitrate_kbps_strips_trailing_unit() {
        assert_eq!(bitrate_kbps("4000k"), 4000);
        assert_eq!(bitrate_kbps("192k"), 192);
        assert_eq!(bitrate_kbps("15000k"), 15000);
    }

    #[test]
    fn bitrate_kbps_returns_zero_for_garbage() {
        assert_eq!(bitrate_kbps("nope"), 0);
        assert_eq!(bitrate_kbps(""), 0);
    }

    #[test]
    fn transcode_config_defaults_match_bun() {
        let t = TranscodeConfig::default();
        assert_eq!(t.max_concurrent_jobs, 3);
        assert_eq!(t.force_kill_timeout_ms, 2_000);
        assert_eq!(t.shutdown_timeout_ms, 5_000);
        assert_eq!(t.orphan_timeout_ms, 30_000);
        assert_eq!(t.max_encode_rate_multiplier, 3);
        assert_eq!(t.capacity_retry_hint_ms, 1_000);
        assert_eq!(t.inflight_dedup_timeout_ms, 5_000);
    }

    #[test]
    fn stream_config_idle_timeout_default_matches_bun() {
        let s = StreamConfig::default();
        assert_eq!(s.connection_idle_timeout_ms, 180_000);
    }
}
