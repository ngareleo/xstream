//! `KillReason` enum with wire-format string mapping for observability.

use tracing::warn;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum KillReason {
    ClientRequest,
    /// Explicit cancellation initiated by a client mutation
    /// (`cancelTranscode`). Distinct from `ClientRequest`, which is the
    /// fallback used when a kill arrives without a recorded reason.
    /// Fires on seek-driven cleanup of obsolete prefetched chunks.
    ClientCancel,
    ClientDisconnected,
    StreamIdleTimeout,
    OrphanNoConnection,
    MaxEncodeTimeout,
    CascadeRetry,
    ServerShutdown,
}

impl KillReason {
    /// Wire-format string. Locked — Seq queries and the
    /// `02-Streaming.md` contract pin these literals.
    pub fn as_wire_str(self) -> &'static str {
        match self {
            Self::ClientRequest => "client_request",
            Self::ClientCancel => "client_cancel",
            Self::ClientDisconnected => "client_disconnected",
            Self::StreamIdleTimeout => "stream_idle_timeout",
            Self::OrphanNoConnection => "orphan_no_connection",
            Self::MaxEncodeTimeout => "max_encode_timeout",
            Self::CascadeRetry => "cascade_retry",
            Self::ServerShutdown => "server_shutdown",
        }
    }

    /// Option-shape mapper from a wire string back to the enum.
    /// Logs a `warn` on unknown input (per the Step 1 mapper convention).
    pub fn from_wire_str(s: &str) -> Option<Self> {
        let mapped = match s {
            "client_request" => Self::ClientRequest,
            "client_cancel" => Self::ClientCancel,
            "client_disconnected" => Self::ClientDisconnected,
            "stream_idle_timeout" => Self::StreamIdleTimeout,
            "orphan_no_connection" => Self::OrphanNoConnection,
            "max_encode_timeout" => Self::MaxEncodeTimeout,
            "cascade_retry" => Self::CascadeRetry,
            "server_shutdown" => Self::ServerShutdown,
            other => {
                warn!(raw = %other, "unknown KillReason wire value — degrading to None");
                return None;
            }
        };
        Some(mapped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_all_variants() {
        for variant in [
            KillReason::ClientRequest,
            KillReason::ClientCancel,
            KillReason::ClientDisconnected,
            KillReason::StreamIdleTimeout,
            KillReason::OrphanNoConnection,
            KillReason::MaxEncodeTimeout,
            KillReason::CascadeRetry,
            KillReason::ServerShutdown,
        ] {
            let s = variant.as_wire_str();
            assert_eq!(
                KillReason::from_wire_str(s),
                Some(variant),
                "wire string {s}"
            );
        }
    }

    #[test]
    fn unknown_value_degrades_to_none() {
        assert_eq!(KillReason::from_wire_str("nonsense"), None);
        assert_eq!(KillReason::from_wire_str(""), None);
    }
}
