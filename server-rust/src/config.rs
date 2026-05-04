//! AppConfig + RESOLUTION_PROFILES — the server-wide tunables.

use std::path::PathBuf;
use std::sync::Arc;

use dashmap::DashMap;

use crate::db::Db;
use crate::graphql::scalars::Resolution;
use crate::services::ffmpeg_file::FileMetadata;
use crate::services::ffmpeg_file::HwAccelConfig;
use crate::services::ffmpeg_path::FfmpegPaths;
use crate::services::ffmpeg_pool::FfmpegPool;
use crate::services::job_store::JobStore;
use crate::services::omdb::OmdbClient;
use crate::services::scan_state::ScanState;

/// Per-source VAAPI capability state, learned from prior failures. Lives on
/// `AppContext` so the chunker can read/write across cascade tiers without
/// a module global. Each entry pins one source's failure mode (the
/// hwdownload/sw-pad fallback is required, or HW is unsafe and we go
/// straight to libx264) so a re-encode doesn't repeat a known-failing path.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VaapiVideoState {
    NeedsSwPad,
    HwUnsafe,
}

pub type VaapiVideoStateMap = Arc<DashMap<String, VaapiVideoState>>;

/// Per-source ffprobe results, cached for the server's lifetime. Each
/// chunk's `run_cascade` calls `ffprobe` to discover the source's HDR/SDR
/// state, codec, and stream layout — but the answer is stable for any
/// given file, so re-running ffprobe per chunk burns ~150-200ms of
/// wall-clock that lands directly in the seek-to-first-frame budget. The
/// cache is keyed by `video_id` (matches `vaapi_state`) so library re-scan
/// rotates entries naturally as `video_id` lifecycle. No explicit
/// invalidation: a user replacing a file on disk + rescanning is a
/// server-restart event today.
pub type ProbeMetadataCache = Arc<DashMap<String, FileMetadata>>;

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
            max_concurrent_jobs: 5,
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

/// Top-level server config. `port` and other late-step fields land as
/// their respective subsystems are ported.
#[derive(Clone, Debug)]
pub struct AppConfig {
    pub segment_dir: PathBuf,
    pub db_path: PathBuf,
    /// Directory holding cached OMDb poster images. Hash-addressed by
    /// the SHA-1 of the source URL with the original extension preserved
    /// (e.g. `<dir>/abc123…ef.jpg`). Populated by
    /// `services::poster_cache`. Tauri-bundled apps point this at
    /// `app_cache_dir()/posters/`; dev points at `tmp/poster-cache/`.
    pub poster_dir: PathBuf,
    pub transcode: TranscodeConfig,
    pub stream: StreamConfig,
    pub scan: ScanConfig,
    /// OMDb API key — `None` means auto-match is disabled (the scanner
    /// skips the metadata fetch silently). Resolved at boot from the
    /// `OMDB_API_KEY` env var with a fallback to the persisted
    /// `omdbApiKey` setting in `user_settings`.
    pub omdb_api_key: Option<String>,
    /// Maximum OMDb requests we'll spend per UTC day. Free-tier OMDb is
    /// 1 000/day per IP; the default leaves headroom for ad-hoc / manual
    /// flows that share the same key. The counter resets at UTC
    /// midnight; exhaustion logs a warn and skips further calls without
    /// failing the surrounding scan.
    pub omdb_daily_budget: u32,
}

/// Library-scanner tunables.
#[derive(Clone, Debug)]
pub struct ScanConfig {
    /// Period of the background re-scan loop. Default is 30 s. Env
    /// override (`SCAN_INTERVAL_MS`) lands with the broader env-loading
    /// migration; today this is a constant.
    pub interval_ms: u64,
    /// Maximum number of files probed/fingerprinted simultaneously per
    /// library. Bounded so `ffprobe` fan-out and FD pressure stay sane on
    /// large libraries — default is 4.
    pub concurrency: usize,
    /// Period of the profile-availability probe loop. Defaults to
    /// `interval_ms` when zero (one cycle per scan cadence). The probe
    /// is cheap (a `stat` per library) so a sub-30s cadence is fine if
    /// the user wants flips reflected in the UI faster.
    pub availability_interval_ms: u64,
}

impl ScanConfig {
    pub fn availability_interval_ms(&self) -> u64 {
        if self.availability_interval_ms == 0 {
            self.interval_ms
        } else {
            self.availability_interval_ms
        }
    }
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            interval_ms: 30_000,
            concurrency: 4,
            availability_interval_ms: 0,
        }
    }
}

impl AppConfig {
    /// Default config for tests + dev. Per-process isolation during the
    /// cutover (`Plan/02-Streaming.md` §"Decisions to lock" #2): segment
    /// cache at `tmp/segments-rust/`, SQLite DB at `tmp/xstream-rust.db`,
    /// poster cache at `tmp/poster-cache/`.
    pub fn dev_defaults(project_root: &std::path::Path) -> Self {
        Self::with_paths(
            project_root.join("tmp").join("segments-rust"),
            project_root.join("tmp").join("xstream-rust.db"),
            project_root.join("tmp").join("poster-cache"),
        )
    }

    /// Build an `AppConfig` from explicit paths. The Tauri shell uses
    /// this with `app_cache_dir/segments`, `app_local_data_dir/xstream.db`,
    /// and `app_cache_dir/posters` so per-OS conventions are honoured.
    /// Dev uses `dev_defaults`, which composes onto this.
    pub fn with_paths(segment_dir: PathBuf, db_path: PathBuf, poster_dir: PathBuf) -> Self {
        Self {
            segment_dir,
            db_path,
            poster_dir,
            transcode: TranscodeConfig::default(),
            stream: StreamConfig::default(),
            scan: ScanConfig::default(),
            omdb_api_key: None,
            omdb_daily_budget: crate::services::omdb::DEFAULT_DAILY_BUDGET,
        }
    }
}

/// Bundle of long-lived state the chunker + stream route both need. The
/// router clones this for every request — every field is `Arc` / `Clone`.
#[derive(Clone)]
pub struct AppContext {
    pub db: Db,
    pub config: AppConfig,
    pub pool: FfmpegPool,
    pub ffmpeg_paths: Arc<FfmpegPaths>,
    pub hw_accel: HwAccelConfig,
    pub vaapi_state: VaapiVideoStateMap,
    pub probe_cache: ProbeMetadataCache,
    pub job_store: JobStore,
    pub scan_state: ScanState,
    /// `Some` when an `OMDB_API_KEY` is configured (env or DB setting).
    /// `None` means auto-match is silently disabled — the scanner just
    /// skips the metadata fetch step. Cheap-clone: wraps a shared
    /// `reqwest::Client` so the connection pool spans every call.
    pub omdb: Option<OmdbClient>,
}

impl AppContext {
    pub fn new(
        db: Db,
        config: AppConfig,
        ffmpeg_paths: Arc<FfmpegPaths>,
        hw_accel: HwAccelConfig,
    ) -> Self {
        let pool = FfmpegPool::new(config.transcode.clone());
        let daily_budget = config.omdb_daily_budget;
        let omdb = config.omdb_api_key.clone().map(|key| {
            // One Client → shared connection pool across every auto-match
            // call. reqwest::Client is internally Arc'd, so cloning it
            // for the OmdbClient wrapper is cheap. The budget counter
            // lives inside OmdbClient (Arc<Mutex<…>>) so every clone
            // shares the same daily quota.
            OmdbClient::production(reqwest::Client::new(), key, daily_budget)
        });
        Self {
            db,
            config,
            pool,
            ffmpeg_paths,
            hw_accel,
            vaapi_state: Arc::new(DashMap::<String, VaapiVideoState>::new()),
            probe_cache: Arc::new(DashMap::<String, FileMetadata>::new()),
            job_store: JobStore::new(),
            scan_state: ScanState::new(),
            omdb,
        }
    }

    /// Helper for tests + headless boot — supplies a stub `FfmpegPaths`
    /// pointing at `/bin/true` (probe is gated on actual encode args).
    pub fn for_tests(db: Db, segment_dir: PathBuf) -> Self {
        let poster_dir = segment_dir
            .parent()
            .map(|p| p.join("poster-cache"))
            .unwrap_or_else(|| PathBuf::from("/tmp/xstream-test-posters"));
        let config = AppConfig {
            segment_dir,
            db_path: PathBuf::from(":memory:"),
            poster_dir,
            transcode: TranscodeConfig::default(),
            stream: StreamConfig::default(),
            scan: ScanConfig::default(),
            omdb_api_key: None,
            omdb_daily_budget: crate::services::omdb::DEFAULT_DAILY_BUDGET,
        };
        let paths = Arc::new(FfmpegPaths {
            ffmpeg: PathBuf::from("/bin/true"),
            ffprobe: PathBuf::from("/bin/true"),
            version_string: "stub".to_string(),
        });
        Self::new(db, config, paths, HwAccelConfig::Software)
    }
}

/// Encode parameters for a single resolution tier — width/height for the
/// scaled-down output, target + max bitrates for the encoder, audio bitrate,
/// segment duration, and the H.264 level the encoder advertises. The full
/// table (`RESOLUTION_PROFILES`) lives in `profiles.rs`-equivalent below.
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
    fn transcode_config_uses_documented_defaults() {
        let t = TranscodeConfig::default();
        assert_eq!(t.max_concurrent_jobs, 5);
        assert_eq!(t.force_kill_timeout_ms, 2_000);
        assert_eq!(t.shutdown_timeout_ms, 5_000);
        assert_eq!(t.orphan_timeout_ms, 30_000);
        assert_eq!(t.max_encode_rate_multiplier, 3);
        assert_eq!(t.capacity_retry_hint_ms, 1_000);
        assert_eq!(t.inflight_dedup_timeout_ms, 5_000);
    }

    #[test]
    fn stream_config_uses_documented_idle_timeout() {
        let s = StreamConfig::default();
        assert_eq!(s.connection_idle_timeout_ms, 180_000);
    }
}
