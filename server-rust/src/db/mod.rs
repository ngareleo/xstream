//! SQLite layer — connection, migrations, and per-table query modules.
//!
//! Mirrors `server/src/db/index.ts` + `server/src/db/queries/*.ts`. The Rust
//! port opens the same `tmp/xstream.db` file Bun uses (`DB_PATH` env var
//! override matches Bun) so both processes see identical data during the
//! Step 1 cutover.
//!
//! Notes / invariants:
//! - WAL + foreign_keys=ON pragmas applied BEFORE any query (matches Bun).
//! - Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`).
//! - Single connection wrapped in `Mutex` — sufficient for Step 1's read-heavy
//!   profile. A pool (r2d2-sqlite) is the natural next step if contention
//!   shows up under load.
//! - **Every query returns [`DbResult`].** Mutex poisoning is encoded as a
//!   typed error, never a panic. Callers `?`-propagate; resolvers surface
//!   it as a GraphQL error via `From<DbError>`.

mod migrate;
pub mod queries;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::{Connection, OpenFlags};
use sha1::{Digest, Sha1};

use crate::error::{DbError, DbResult};

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn open(path: &Path) -> DbResult<Self> {
        if let Some(parent) = path.parent() {
            // SQLITE_OPEN_CREATE creates the file but not its parent
            // directories. Mkdir before open so a fresh checkout with no
            // tmp/ doesn't crash. If mkdir fails we *still* try to open —
            // the parent might already exist (TOCTOU); SQLite's open will
            // give a sharper error.
            if let Err(err) = std::fs::create_dir_all(parent) {
                tracing::warn!(
                    parent = %parent.display(),
                    error = %err,
                    "create_dir_all failed; continuing — sqlite open will report the real cause if the dir is missing"
                );
            }
        }
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate::run(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Execute `f` against the connection under the mutex.
    ///
    /// On mutex poisoning (another task panicked while holding the lock),
    /// returns [`DbError::PoisonedMutex`] rather than re-panicking — the
    /// poisoning is a real but recoverable signal callers should be free
    /// to surface or retry.
    pub fn with<R>(&self, f: impl FnOnce(&Connection) -> DbResult<R>) -> DbResult<R> {
        let guard = self.conn.lock().map_err(|_| DbError::PoisonedMutex)?;
        f(&guard)
    }
}

pub fn default_db_path() -> PathBuf {
    if let Ok(p) = std::env::var("DB_PATH") {
        return PathBuf::from(p);
    }
    // Default to the Bun server's path so both processes share the same DB
    // during cutover. Bun resolves to `<repo>/tmp/xstream.db`. We don't have
    // a guaranteed repo-root anchor here, so fall back to `tmp/xstream.db`
    // relative to the working directory.
    PathBuf::from("tmp/xstream.db")
}

/// SHA-1 of a UTF-8 string, hex-encoded. Used for content-addressed IDs
/// (library/video/watchlist) — must produce byte-identical output to the
/// Bun side (`createHash('sha1').update(s).digest('hex')`).
///
/// Pure value-in / value-out — no IO, no error path. The implementation
/// uses `format!`-collect rather than `write!` to avoid an awkward
/// "infallible Result discard" idiom.
pub fn sha1_hex(input: &str) -> String {
    let mut h = Sha1::new();
    h.update(input.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

// ── Re-exports — keep call-site imports stable ───────────────────────────────
//
// Resolvers and other modules `use crate::db::{Db, LibraryRow, get_library_by_id, …}`.
// Re-exporting from the per-table modules means splitting db.rs into a tree
// didn't ripple into every call site.

pub use queries::jobs::{get_job_by_id, TranscodeJobRow};
pub use queries::libraries::{
    create_library, delete_library, get_all_libraries, get_library_by_id, update_library,
    LibraryRow, LibraryUpdate,
};
pub use queries::playback_history::{
    get_playback_history, insert_playback_session, PlaybackHistoryRow,
};
pub use queries::user_settings::{get_setting, set_setting};
pub use queries::video_metadata::{
    count_matched_by_library, delete_video_metadata, get_metadata_by_video_id, has_video_metadata,
    upsert_video_metadata, VideoMetadataRow,
};
pub use queries::videos::{
    count_videos_by_library, get_streams_by_video_id, get_video_by_id, get_videos,
    get_videos_by_library, sum_file_size_by_library, VideoFilter, VideoRow, VideoStreamRow,
    VideosFilter,
};
pub use queries::watchlist::{
    add_watchlist_item, get_watchlist, get_watchlist_item_by_id, get_watchlist_item_by_video_id,
    remove_watchlist_item, update_watchlist_progress, WatchlistItemRow,
};
