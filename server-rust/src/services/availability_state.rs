//! Profile-availability change broadcaster. See docs/architecture/Library-Scan/04-Profile-Availability.md.

use std::sync::Arc;

use tokio::sync::broadcast;

/// A single library's reachability, as persisted to `libraries.status` /
/// `libraries.last_seen_at`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailabilityEvent {
    pub library_id: String,
    pub status: String,
    pub last_seen_at: Option<String>,
}

/// Cheaply-cloneable handle to the process-wide availability broadcaster.
#[derive(Clone)]
pub struct AvailabilityState {
    tx: Arc<broadcast::Sender<AvailabilityEvent>>,
}

// Status flips are rare (a drive un/replugging); a lagged subscriber re-syncs
// from the subscription's initial DB seed.
const BROADCAST_CAPACITY: usize = 64;

impl AvailabilityState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self { tx: Arc::new(tx) }
    }

    /// Subscribe to future status changes.
    pub fn subscribe(&self) -> broadcast::Receiver<AvailabilityEvent> {
        self.tx.subscribe()
    }

    /// Best-effort broadcast; a no-subscriber `SendError` is swallowed.
    pub fn broadcast(&self, event: AvailabilityEvent) {
        let _ = self.tx.send(event);
    }
}

impl Default for AvailabilityState {
    fn default() -> Self {
        Self::new()
    }
}
