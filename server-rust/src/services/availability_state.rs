//! Profile-availability change broadcaster.
//!
//! Mirrors [`scan_state::ScanState`](crate::services::scan_state::ScanState):
//! a cheaply-cloneable handle around a `tokio::sync::broadcast` channel that
//! the periodic probe loop (`profile_availability`) feeds on every status
//! transition, and the `profileAvailabilityUpdated` GraphQL subscription
//! drains. The query keeps returning the cached DB status immediately (so a
//! hung/offline path never blocks the Profiles payload); fresh status arrives
//! out-of-band on this channel — the "fire-and-forget" shape the client wants.

use std::sync::Arc;

use tokio::sync::broadcast;

/// One availability datapoint: a single library's reachability flipped (or
/// was first observed). `status`/`last_seen_at` carry the same wire values
/// persisted to `libraries.status` / `libraries.last_seen_at`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailabilityEvent {
    pub library_id: String,
    pub status: String,
    pub last_seen_at: Option<String>,
}

/// Cheaply-cloneable handle to the process-wide availability broadcaster.
/// The probe loop and every subscription resolver hold a clone.
#[derive(Clone)]
pub struct AvailabilityState {
    tx: Arc<broadcast::Sender<AvailabilityEvent>>,
}

/// Channel buffer. Status flips are rare (a drive un/replugging), so a small
/// buffer is plenty; a lagged subscriber re-syncs from the initial DB seed
/// the subscription replays on (re)connect.
const BROADCAST_CAPACITY: usize = 64;

impl AvailabilityState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self { tx: Arc::new(tx) }
    }

    /// Subscribe to future status changes. The resolver seeds the initial
    /// frame from the DB, then forwards this stream.
    pub fn subscribe(&self) -> broadcast::Receiver<AvailabilityEvent> {
        self.tx.subscribe()
    }

    /// Best-effort broadcast — a `SendError` (no live subscribers) is
    /// swallowed exactly like `ScanState::broadcast`; the DB row is already
    /// authoritative for any future subscriber's initial seed.
    pub fn broadcast(&self, event: AvailabilityEvent) {
        let _ = self.tx.send(event);
    }
}

impl Default for AvailabilityState {
    fn default() -> Self {
        Self::new()
    }
}
