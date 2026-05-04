//! Periodic library reachability probe.
//!
//! Each tick (default 30s, mirroring the periodic-scan cadence) the probe
//! stats every library's path. The status column transitions through the
//! states `unknown → online | offline`, with `last_seen_at` updated every
//! cycle (the "we successfully probed at this time" timestamp, not "we
//! last saw it online").
//!
//! On status flips:
//! - `online → offline`: log warn; existing rows stay put (the user can
//!   still browse what's catalogued while the drive is unplugged — only
//!   playback is blocked).
//! - `offline → online` (or `unknown → online`): log info; one-shot
//!   `scan_one_library` to catch up on changes that happened while
//!   offline.
//!
//! The first cycle's "flip" from the DB-default `unknown` to the
//! observed status counts as offline→online (or stays unknown if probing
//! fails outright). The probe is best-effort — it does not consume the
//! scan-state slot and never blocks a foreground scan.
//!
//! See `docs/architecture/Library-Scan/04-Profile-Availability.md`.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tokio::sync::Mutex;
use tracing::{info, info_span, warn, Instrument};

use crate::config::AppContext;
use crate::db::{get_all_libraries, update_library_status, LibraryRow};
use crate::services::library_scanner::scan_one_library;

pub const STATUS_ONLINE: &str = "online";
pub const STATUS_OFFLINE: &str = "offline";
pub const STATUS_UNKNOWN: &str = "unknown";

/// Run one probe cycle: stat every library's path, persist the result,
/// fire side-effects on status transitions. Returns the per-library
/// outcome map so callers (mostly tests) can assert on it.
pub async fn probe_once(
    ctx: &AppContext,
    last_status: &Mutex<HashMap<String, String>>,
) -> HashMap<String, String> {
    let span = info_span!("library.availability_probe");
    async {
        let mut current: HashMap<String, String> = HashMap::new();
        let libraries = match get_all_libraries(&ctx.db) {
            Ok(v) => v,
            Err(err) => {
                warn!(error = %err, "profile_availability: failed to list libraries");
                return current;
            }
        };
        let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        for lib in &libraries {
            let new_status = probe_library(&lib.path);
            current.insert(lib.id.clone(), new_status.to_string());

            if let Err(err) = update_library_status(&ctx.db, &lib.id, new_status, &now) {
                warn!(
                    library_id = %lib.id,
                    error = %err,
                    "profile_availability: failed to write status",
                );
                continue;
            }

            let prev = {
                let map = last_status.lock().await;
                map.get(&lib.id)
                    .cloned()
                    .unwrap_or_else(|| lib.status.clone())
            };
            if prev != new_status {
                handle_transition(ctx, lib, &prev, new_status).await;
            }
        }
        // Persist this cycle's view for next-tick flip detection.
        {
            let mut map = last_status.lock().await;
            *map = current.clone();
        }
        current
    }
    .instrument(span)
    .await
}

/// Cheap reachability check: the path exists and is a directory.
fn probe_library(path: &str) -> &'static str {
    let p = Path::new(path);
    match std::fs::metadata(p) {
        Ok(meta) if meta.is_dir() => STATUS_ONLINE,
        Ok(_) => STATUS_OFFLINE,
        Err(_) => STATUS_OFFLINE,
    }
}

async fn handle_transition(ctx: &AppContext, lib: &LibraryRow, prev: &str, new_status: &str) {
    match (prev, new_status) {
        (STATUS_ONLINE, STATUS_OFFLINE) => {
            warn!(
                library_id = %lib.id,
                library_name = %lib.name,
                path = %lib.path,
                "library went offline",
            );
        }
        (_, STATUS_ONLINE) => {
            info!(
                library_id = %lib.id,
                library_name = %lib.name,
                path = %lib.path,
                from = %prev,
                "library is online — kicking catch-up scan",
            );
            // Reload the row to pick up the latest status before scanning;
            // probe_once already wrote it but scan_one_library expects an
            // up-to-date LibraryRow.
            let row = LibraryRow {
                status: STATUS_ONLINE.to_string(),
                ..lib.clone()
            };
            scan_one_library(ctx, &row).await;
        }
        _ => {}
    }
}

/// Spawn the background probe loop. Cadence is `availability_interval_ms`
/// from the scan config (defaults to scan.interval_ms when not set).
pub fn spawn_periodic_availability(ctx: AppContext) {
    let interval = Duration::from_millis(ctx.config.scan.availability_interval_ms());
    let last_status: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(HashMap::new()));
    tokio::spawn(async move {
        loop {
            probe_once(&ctx, &last_status).await;
            tokio::time::sleep(interval).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_library, get_library_by_id, Db};
    use std::path::Path;
    use tempfile::TempDir;

    fn fresh_ctx(segment_dir: std::path::PathBuf) -> AppContext {
        let db = Db::open(Path::new(":memory:")).expect("db");
        AppContext::for_tests(db, segment_dir)
    }

    #[tokio::test]
    async fn probe_once_marks_existing_dir_online() {
        let tmp = TempDir::new().expect("tmp");
        let lib_path = tmp.path().join("lib");
        std::fs::create_dir_all(&lib_path).expect("mkdir");

        let ctx = fresh_ctx(tmp.path().join("seg"));
        let lib =
            create_library(&ctx.db, "L", lib_path.to_str().unwrap(), "movies", &[]).expect("lib");
        let last = Mutex::new(HashMap::new());
        let result = probe_once(&ctx, &last).await;
        assert_eq!(result.get(&lib.id).map(|s| s.as_str()), Some(STATUS_ONLINE));
        let row = get_library_by_id(&ctx.db, &lib.id)
            .expect("query")
            .expect("exists");
        assert_eq!(row.status, STATUS_ONLINE);
        assert!(row.last_seen_at.is_some());
    }

    #[tokio::test]
    async fn probe_once_marks_missing_dir_offline() {
        let tmp = TempDir::new().expect("tmp");
        let ctx = fresh_ctx(tmp.path().join("seg"));
        let lib = create_library(&ctx.db, "L", "/no/such/path", "movies", &[]).expect("lib");
        let last = Mutex::new(HashMap::new());
        let result = probe_once(&ctx, &last).await;
        assert_eq!(
            result.get(&lib.id).map(|s| s.as_str()),
            Some(STATUS_OFFLINE)
        );
    }

    #[tokio::test]
    async fn probe_once_writes_last_seen_at_every_cycle() {
        let tmp = TempDir::new().expect("tmp");
        let lib_path = tmp.path().join("lib");
        std::fs::create_dir_all(&lib_path).expect("mkdir");
        let ctx = fresh_ctx(tmp.path().join("seg"));
        let lib =
            create_library(&ctx.db, "L", lib_path.to_str().unwrap(), "movies", &[]).expect("lib");
        let last = Mutex::new(HashMap::new());
        probe_once(&ctx, &last).await;
        let first = get_library_by_id(&ctx.db, &lib.id)
            .expect("q")
            .expect("e")
            .last_seen_at
            .unwrap_or_default();
        // Sleep just long enough for the millisecond-precision timestamp
        // to advance.
        tokio::time::sleep(Duration::from_millis(5)).await;
        probe_once(&ctx, &last).await;
        let second = get_library_by_id(&ctx.db, &lib.id)
            .expect("q")
            .expect("e")
            .last_seen_at
            .unwrap_or_default();
        assert!(!first.is_empty());
        assert!(!second.is_empty());
        assert_ne!(first, second);
    }
}
