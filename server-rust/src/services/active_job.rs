//! In-memory `ActiveJob` state — the chunker's source of truth for live
//! transcodes.
//!
//! The DB row (`transcode_jobs` table) is the audit / restart-recovery
//! mirror; this struct is what the stream route actually reads while
//! ffmpeg is running. Updates are pushed to subscribers via a
//! `tokio::sync::Notify` per job (per-connection isolation — each
//! `/stream/:jobId` connection holds its own subscription).

use std::sync::{Arc, Mutex};

use tokio::sync::Notify;

use crate::graphql::scalars::{JobStatus, PlaybackErrorCode, Resolution};

/// Wire string for a status — matches the DB literal column values.
pub fn job_status_wire(status: JobStatus) -> &'static str {
    match status {
        JobStatus::Pending => "pending",
        JobStatus::Running => "running",
        JobStatus::Complete => "complete",
        JobStatus::Error => "error",
    }
}

/// Mutable in-memory state for one live transcode job. Wrapped in
/// `Arc<Mutex<...>>` at the `JobStore` level — readers (the stream route)
/// take a brief lock to copy the fields they need, never hold it across
/// I/O.
#[derive(Debug)]
pub struct ActiveJobInner {
    pub id: String,
    pub video_id: String,
    pub resolution: Resolution,
    pub status: JobStatus,
    pub segment_dir: String,
    pub total_segments: Option<i64>,
    pub completed_segments: i64,
    pub start_time_seconds: Option<f64>,
    pub end_time_seconds: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub error: Option<String>,
    /// Ordered list of completed segment paths. Indexed by segment number;
    /// gaps stay `None` until the corresponding file lands.
    pub segments: Vec<Option<String>>,
    pub init_segment_path: Option<String>,
    /// Live `/stream/:jobId` connection count. The orphan kill watches this
    /// reach zero after `orphan_timeout_ms`; the idle-stream timeout uses
    /// it on the route side.
    pub connections: u32,
    /// Set when the job fails mid-flight — used by the resolver to surface
    /// a typed error code to the client.
    pub error_code: Option<PlaybackErrorCode>,
}

impl ActiveJobInner {
    pub fn completed_count(&self) -> i64 {
        self.segments.iter().filter(|s| s.is_some()).count() as i64
    }
}

/// Public handle — reference-counted, lock-protected. The `notify` is the
/// per-job change signal: every state mutation calls
/// `job.notify.notify_waiters()` so subscribers wake without re-polling.
#[derive(Clone, Debug)]
pub struct ActiveJob {
    pub inner: Arc<Mutex<ActiveJobInner>>,
    pub notify: Arc<Notify>,
}

impl ActiveJob {
    pub fn new(inner: ActiveJobInner) -> Self {
        Self {
            inner: Arc::new(Mutex::new(inner)),
            notify: Arc::new(Notify::new()),
        }
    }

    /// Apply a mutation and wake every subscriber. `Notify::notify_waiters`
    /// fans out a single signal to all `notify.notified()` futures so the
    /// stream pump tasks can each re-check whether the next segment is
    /// available — no per-subscriber bookkeeping.
    pub fn with_inner_mut<R>(&self, f: impl FnOnce(&mut ActiveJobInner) -> R) -> R {
        let mut guard = self
            .inner
            .lock()
            .expect("ActiveJob mutex poisoned — another task panicked while holding it");
        let result = f(&mut guard);
        drop(guard);
        self.notify.notify_waiters();
        result
    }

    /// Read-only snapshot. The closure receives `&ActiveJobInner` and the
    /// lock is released as soon as it returns — never hold across I/O.
    pub fn with_inner<R>(&self, f: impl FnOnce(&ActiveJobInner) -> R) -> R {
        let guard = self
            .inner
            .lock()
            .expect("ActiveJob mutex poisoned — another task panicked while holding it");
        f(&guard)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_inner(id: &str) -> ActiveJobInner {
        ActiveJobInner {
            id: id.to_string(),
            video_id: "vvvv".to_string(),
            resolution: Resolution::R1080p,
            status: JobStatus::Pending,
            segment_dir: format!("/tmp/{id}"),
            total_segments: None,
            completed_segments: 0,
            start_time_seconds: None,
            end_time_seconds: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            error: None,
            segments: Vec::new(),
            init_segment_path: None,
            connections: 0,
            error_code: None,
        }
    }

    #[test]
    fn with_inner_mut_wakes_subscribers() {
        let job = ActiveJob::new(empty_inner("j1"));
        let notify = job.notify.clone();
        let waker = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("rt");
        let waiter = std::thread::spawn(move || {
            // Block on the notification.
            waker.block_on(async { notify.notified().await });
        });
        // Give the thread a moment to park.
        std::thread::sleep(std::time::Duration::from_millis(50));
        job.with_inner_mut(|inner| {
            inner.status = JobStatus::Running;
        });
        // The notify wakes the waiter; if the join blocks indefinitely the
        // test framework will timeout instead of spuriously passing.
        waiter.join().expect("waiter joined");
    }

    #[test]
    fn completed_count_ignores_gaps() {
        let mut inner = empty_inner("j1");
        inner.segments = vec![
            Some("/0".into()),
            None,
            Some("/2".into()),
            Some("/3".into()),
        ];
        assert_eq!(inner.completed_count(), 3);
    }

    #[test]
    fn job_status_wire_matches_db_literals() {
        assert_eq!(job_status_wire(JobStatus::Pending), "pending");
        assert_eq!(job_status_wire(JobStatus::Running), "running");
        assert_eq!(job_status_wire(JobStatus::Complete), "complete");
        assert_eq!(job_status_wire(JobStatus::Error), "error");
    }
}
