//! Library-scan progress state. Mirrors `server/src/services/scanStore.ts`.
//!
//! One process-wide [`ScanState`] holds the current scan snapshot behind
//! an `RwLock` and broadcasts every state change over a
//! `tokio::sync::broadcast` channel. The two GraphQL subscriptions
//! (`library_scan_updated`, `library_scan_progress`) seed themselves from
//! [`ScanState::current`] and then forward live broadcasts to the wire.
//!
//! Concurrency contract:
//! - [`mark_started`] is the atomic "is anyone scanning?" guard. It reads
//!   and flips `scanning` under the same write-lock so two callers racing
//!   into [`crate::services::library_scanner::scan_libraries`] cannot both
//!   advance past the guard. Mirrors Bun's single-threaded `isScanRunning`
//!   check at `server/src/services/libraryScanner.ts:296-304`.
//! - Broadcast `send` returns `Err` only when no subscribers exist; the
//!   scan itself is unaffected, so the no-receiver path is a documented
//!   no-op (per `docs/code-style/Invariants/00-Never-Violate.md` §14, the
//!   handler is explicit rather than a silent `let _ =`).

use std::sync::{Arc, RwLock};

use tokio::sync::broadcast;

use crate::graphql::types::{LibraryScanProgress, LibraryScanUpdate};

/// One scan-state datapoint. The wire-shape converters at the bottom of
/// this module produce the two GraphQL subscription payloads from this
/// single internal snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScanSnapshot {
    pub scanning: bool,
    pub library_id: Option<String>,
    pub done: Option<u32>,
    pub total: Option<u32>,
}

impl ScanSnapshot {
    pub fn idle() -> Self {
        Self {
            scanning: false,
            library_id: None,
            done: None,
            total: None,
        }
    }
}

/// Cheaply-cloneable handle to the process-wide scan state. Multiple
/// services + every subscription resolver hold a clone.
#[derive(Clone)]
pub struct ScanState {
    inner: Arc<Inner>,
}

struct Inner {
    current: RwLock<ScanSnapshot>,
    tx: broadcast::Sender<ScanSnapshot>,
}

/// Channel buffer. 128 covers a burst of per-file progress events from a
/// 4-way concurrent scan without lagged subscribers losing every update;
/// any subscriber slower than that gets `Lagged` and re-syncs from
/// [`ScanState::current`] on the next tick.
const BROADCAST_CAPACITY: usize = 128;

impl ScanState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            inner: Arc::new(Inner {
                current: RwLock::new(ScanSnapshot::idle()),
                tx,
            }),
        }
    }

    /// Latest snapshot. Used by subscription resolvers to seed the initial
    /// frame before they start forwarding broadcasts.
    pub fn current(&self) -> ScanSnapshot {
        match self.inner.current.read() {
            Ok(g) => g.clone(),
            Err(p) => p.into_inner().clone(),
        }
    }

    pub fn is_scanning(&self) -> bool {
        self.current().scanning
    }

    /// Atomically transition idle → scanning. Returns `false` (without
    /// broadcasting) if a scan was already in progress, so the caller
    /// uses this as the once-at-a-time guard.
    pub fn mark_started(&self) -> bool {
        let mut g = match self.inner.current.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        if g.scanning {
            return false;
        }
        *g = ScanSnapshot {
            scanning: true,
            library_id: None,
            done: None,
            total: None,
        };
        let snap = g.clone();
        drop(g);
        self.broadcast(snap);
        true
    }

    pub fn mark_progress(&self, library_id: &str, done: u32, total: u32) {
        let snap = ScanSnapshot {
            scanning: true,
            library_id: Some(library_id.to_string()),
            done: Some(done),
            total: Some(total),
        };
        match self.inner.current.write() {
            Ok(mut g) => *g = snap.clone(),
            Err(p) => *p.into_inner() = snap.clone(),
        }
        self.broadcast(snap);
    }

    pub fn mark_ended(&self) {
        let snap = ScanSnapshot::idle();
        match self.inner.current.write() {
            Ok(mut g) => *g = snap.clone(),
            Err(p) => *p.into_inner() = snap.clone(),
        }
        self.broadcast(snap);
    }

    /// Subscribe to future state changes. Combine with [`current`] to
    /// produce the "initial then live" stream the GraphQL clients expect.
    pub fn subscribe(&self) -> broadcast::Receiver<ScanSnapshot> {
        self.inner.tx.subscribe()
    }

    fn broadcast(&self, snap: ScanSnapshot) {
        if self.inner.tx.send(snap).is_err() {
            // No live subscribers — broadcast is best-effort. The state
            // is already in `current` for any future subscriber.
        }
    }
}

impl Default for ScanState {
    fn default() -> Self {
        Self::new()
    }
}

// ── Wire-shape converters ───────────────────────────────────────────────────
//
// The two subscription payloads project different views of the same
// snapshot. Keep the conversions here so the GraphQL layer stays free
// of state-internal knowledge.

impl From<&ScanSnapshot> for LibraryScanProgress {
    fn from(snap: &ScanSnapshot) -> Self {
        Self {
            scanning: snap.scanning,
            library_id: snap.library_id.clone().map(async_graphql::ID),
            done: snap.done.map(|n| n as i32),
            total: snap.total.map(|n| n as i32),
        }
    }
}

impl From<&ScanSnapshot> for LibraryScanUpdate {
    fn from(snap: &ScanSnapshot) -> Self {
        Self {
            scanning: snap.scanning,
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{timeout, Duration};

    #[test]
    fn fresh_state_is_idle() {
        let s = ScanState::new();
        let snap = s.current();
        assert!(!snap.scanning);
        assert!(snap.library_id.is_none());
        assert!(snap.done.is_none());
        assert!(snap.total.is_none());
        assert!(!s.is_scanning());
    }

    #[test]
    fn mark_started_flips_scanning_and_returns_true() {
        let s = ScanState::new();
        assert!(s.mark_started());
        assert!(s.is_scanning());
        assert!(s.current().scanning);
    }

    #[test]
    fn second_mark_started_returns_false_without_changing_state() {
        let s = ScanState::new();
        assert!(s.mark_started());
        s.mark_progress("lib-a", 5, 10);
        // Concurrent caller hits the guard — must NOT clobber existing progress.
        assert!(!s.mark_started());
        let snap = s.current();
        assert_eq!(snap.library_id.as_deref(), Some("lib-a"));
        assert_eq!(snap.done, Some(5));
        assert_eq!(snap.total, Some(10));
    }

    #[test]
    fn mark_ended_returns_to_idle() {
        let s = ScanState::new();
        s.mark_started();
        s.mark_progress("lib-a", 3, 9);
        s.mark_ended();
        let snap = s.current();
        assert!(!snap.scanning);
        assert!(snap.library_id.is_none());
        assert!(snap.done.is_none());
        assert!(snap.total.is_none());
    }

    #[test]
    fn mark_started_again_after_end_succeeds() {
        let s = ScanState::new();
        assert!(s.mark_started());
        s.mark_ended();
        assert!(
            s.mark_started(),
            "scanner should be runnable again after end"
        );
    }

    #[tokio::test]
    async fn subscribe_receives_each_broadcast_in_order() {
        let s = ScanState::new();
        let mut rx = s.subscribe();
        s.mark_started();
        s.mark_progress("lib-a", 1, 3);
        s.mark_progress("lib-a", 2, 3);
        s.mark_ended();

        // Four broadcasts: started, two progress, ended. Bounded timeout
        // so a missed broadcast surfaces as a test failure rather than a hang.
        let s1 = timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv 1 within timeout")
            .expect("snapshot 1");
        let s2 = timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv 2 within timeout")
            .expect("snapshot 2");
        let s3 = timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv 3 within timeout")
            .expect("snapshot 3");
        let s4 = timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv 4 within timeout")
            .expect("snapshot 4");

        assert!(s1.scanning && s1.done.is_none());
        assert_eq!(s2.done, Some(1));
        assert_eq!(s3.done, Some(2));
        assert!(!s4.scanning);
    }

    #[test]
    fn no_subscribers_does_not_break_mark_progress() {
        // Regression guard for §14: broadcast SendError on a no-subscriber
        // channel must not propagate or panic. Scan must continue.
        let s = ScanState::new();
        s.mark_started();
        s.mark_progress("lib-a", 1, 1);
        s.mark_ended();
        assert!(!s.is_scanning());
    }

    #[tokio::test]
    async fn snapshot_to_progress_payload_round_trips_fields() {
        let snap = ScanSnapshot {
            scanning: true,
            library_id: Some("lib-x".to_string()),
            done: Some(3),
            total: Some(7),
        };
        let p: LibraryScanProgress = (&snap).into();
        assert!(p.scanning);
        assert_eq!(p.library_id.as_ref().map(|id| id.as_str()), Some("lib-x"));
        assert_eq!(p.done, Some(3));
        assert_eq!(p.total, Some(7));
    }

    #[test]
    fn snapshot_to_update_payload_only_carries_scanning_flag() {
        let snap = ScanSnapshot {
            scanning: true,
            library_id: Some("lib-x".to_string()),
            done: Some(5),
            total: Some(5),
        };
        let u: LibraryScanUpdate = (&snap).into();
        assert!(u.scanning);
    }
}
