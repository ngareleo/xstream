//! Server services. Mirrors `server/src/services/*.ts`.
//!
//! Each submodule owns one service:
//! - [`cache_index`] — content-addressed segment cache lookup.
//!   Keyed by `(video_id, resolution, start_s, end_s)`, decoupled from the
//!   internal `job_id`. Forward-constraint for peer sharing
//!   (`docs/architecture/Sharing/00-Peer-Streaming.md`).
//! - [`job_restore`] — boot-time sweep that marks interrupted (`status =
//!   'running'`) jobs as errored so the next request re-encodes cleanly.

pub mod active_job;
pub mod cache_index;
pub mod chunker;
pub mod ffmpeg_file;
pub mod ffmpeg_path;
pub mod ffmpeg_pool;
pub mod hw_accel;
pub mod job_restore;
pub mod job_store;
pub mod kill_reason;
