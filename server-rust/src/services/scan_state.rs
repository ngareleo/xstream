//! Library-scan progress snapshot with broadcast subscriptions.

use std::sync::{Arc, RwLock};

use tokio::sync::broadcast;

use crate::graphql::types::{LibraryScanProgress, LibraryScanUpdate};

/// One scan-state datapoint. The wire-shape converters at the bottom of
/// this module produce the two GraphQL subscription payloads from this
/// single internal snapshot.
///
/// `phase` and `current_item` are extension fields added for the
/// release-design TV-show discovery flow: the scanner moves through
/// phases (`scanning_files`, `discovering_tv`, `fetching_omdb`,
/// `auto_matching`) and reports the current show / video being processed
/// so the client UI can show "Fetching Breaking Bad S03 episodes…"
/// instead of just a numeric counter. Both are `Option<String>` to
/// preserve back-compat for existing callers that still report
/// progress without a phase.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScanSnapshot {
    pub scanning: bool,
    pub library_id: Option<String>,
    pub done: Option<u32>,
    pub total: Option<u32>,
    pub phase: Option<String>,
    pub current_item: Option<String>,
}

impl ScanSnapshot {
    pub fn idle() -> Self {
        Self {
            scanning: false,
            library_id: None,
            done: None,
            total: None,
            phase: None,
            current_item: None,
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
            phase: None,
            current_item: None,
        };
        let snap = g.clone();
        drop(g);
        self.broadcast(snap);
        true
    }

    pub fn mark_progress(&self, library_id: &str, done: u32, total: u32) {
        self.mark_progress_with_context(library_id, done, total, None, None);
    }

    /// Like [`mark_progress`] but carries the current `phase` (e.g.
    /// `"fetching_omdb"`) and `current_item` (e.g. show title) for the
    /// richer client UX. Existing callers that don't yet plumb these
    /// stay on `mark_progress` and emit `None` for both.
    pub fn mark_progress_with_context(
        &self,
        library_id: &str,
        done: u32,
        total: u32,
        phase: Option<&str>,
        current_item: Option<&str>,
    ) {
        let snap = ScanSnapshot {
            scanning: true,
            library_id: Some(library_id.to_string()),
            done: Some(done),
            total: Some(total),
            phase: phase.map(|s| s.to_string()),
            current_item: current_item.map(|s| s.to_string()),
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
            phase: snap.phase.clone(),
            current_item: snap.current_item.clone(),
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
    fn mark_progress_outside_a_scan_still_records_state() {
        // The scanner only calls mark_progress while inside a scan, but
        // the API does not enforce that ordering — confirm that a stale
        // progress call (no preceding mark_started) still updates the
        // snapshot rather than panicking. Defensive assertion against
        // a future refactor accidentally tightening the contract.
        let s = ScanState::new();
        s.mark_progress("lib-stale", 7, 10);
        let snap = s.current();
        assert_eq!(snap.library_id.as_deref(), Some("lib-stale"));
        assert_eq!(snap.done, Some(7));
        assert_eq!(snap.total, Some(10));
        // Note: scanning is true even though mark_started wasn't called —
        // that's the documented mark_progress behaviour.
        assert!(snap.scanning);
    }

    #[tokio::test]
    async fn subscribe_after_state_change_misses_old_events_but_sees_new_ones() {
        // Broadcast channels do NOT replay history to late subscribers.
        // Late subscribers must use `current()` to seed; this test pins
        // that expectation so a future refactor doesn't silently switch
        // to a replay-on-subscribe channel without updating the
        // subscription resolvers.
        let s = ScanState::new();
        s.mark_started();
        s.mark_progress("lib-a", 1, 5);

        let mut rx = s.subscribe();
        // The next state change should land — old ones are gone.
        s.mark_progress("lib-a", 2, 5);
        let snap = timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("recv")
            .expect("snapshot");
        assert_eq!(snap.done, Some(2));

        // current() still returns the latest snapshot regardless of
        // subscription history.
        assert_eq!(s.current().done, Some(2));
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
            phase: Some("fetching_omdb".to_string()),
            current_item: Some("Breaking Bad".to_string()),
        };
        let p: LibraryScanProgress = (&snap).into();
        assert!(p.scanning);
        assert_eq!(p.library_id.as_ref().map(|id| id.as_str()), Some("lib-x"));
        assert_eq!(p.done, Some(3));
        assert_eq!(p.total, Some(7));
        assert_eq!(p.phase.as_deref(), Some("fetching_omdb"));
        assert_eq!(p.current_item.as_deref(), Some("Breaking Bad"));
    }

    #[test]
    fn snapshot_to_update_payload_only_carries_scanning_flag() {
        let snap = ScanSnapshot {
            scanning: true,
            library_id: Some("lib-x".to_string()),
            done: Some(5),
            total: Some(5),
            phase: None,
            current_item: None,
        };
        let u: LibraryScanUpdate = (&snap).into();
        assert!(u.scanning);
    }

    #[test]
    fn mark_progress_with_context_carries_phase_and_current_item() {
        let s = ScanState::new();
        s.mark_started();
        s.mark_progress_with_context("lib-a", 2, 5, Some("fetching_omdb"), Some("Breaking Bad"));
        let snap = s.current();
        assert_eq!(snap.phase.as_deref(), Some("fetching_omdb"));
        assert_eq!(snap.current_item.as_deref(), Some("Breaking Bad"));
        assert_eq!(snap.done, Some(2));
        assert_eq!(snap.total, Some(5));
    }

    #[test]
    fn mark_progress_emits_none_phase_and_item_for_back_compat_callers() {
        let s = ScanState::new();
        s.mark_started();
        s.mark_progress("lib-a", 1, 3);
        let snap = s.current();
        assert!(snap.phase.is_none());
        assert!(snap.current_item.is_none());
    }
}
