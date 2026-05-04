//! SQLite layer — connection, migrations, and per-table query modules. Single connection wrapped in `Mutex`; WAL mode, foreign keys ON.

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
    // Per-process isolation: this server has its own DB so cross-server
    // transcode_jobs rows can't contaminate stream lookups during the
    // cutover. Resolved relative to the working directory; the dev script
    // overrides via DB_PATH so it lands at `<repo>/tmp/xstream-rust.db`.
    PathBuf::from("tmp/xstream-rust.db")
}

/// SHA-1 of a UTF-8 string, hex-encoded. Used for content-addressed IDs
/// (library/video/watchlist). The output is part of the wire contract —
/// any change to the hash function or its hex encoding makes existing
/// IDs unreachable.
///
/// Pure value-in / value-out — no IO, no error path. The implementation
/// uses `format!`-collect rather than `write!` to avoid an awkward
/// "infallible Result discard" idiom.
pub fn sha1_hex(input: &str) -> String {
    let mut h = Sha1::new();
    h.update(input.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

//
// Resolvers and other modules `use crate::db::{Db, LibraryRow, get_library_by_id, …}`.
// Re-exporting from the per-table modules means splitting db.rs into a tree
// didn't ripple into every call site.

pub use queries::films::{
    assign_video_to_film, build_parsed_title_key, count_films, film_id_for, find_film_by_imdb_id,
    find_film_by_parsed_title_key, get_film_by_id, list_films, merge_films, upsert_film, FilmRow,
    FilmsFilter,
};
pub use queries::jobs::{get_job_by_id, TranscodeJobRow};
pub use queries::libraries::{
    create_library, delete_library, get_all_libraries, get_library_by_id, update_library,
    update_library_status, upsert_library, LibraryRow, LibraryUpdate,
};
pub use queries::playback_history::{
    get_playback_history, insert_playback_session, PlaybackHistoryRow,
};
pub use queries::seasons::{
    get_episodes_by_show, get_seasons_by_show, upsert_episode, upsert_season, EpisodeRow, SeasonRow,
};
pub use queries::show_metadata::{
    get_show_metadata, list_shows_needing_poster_download, set_show_poster_local_path,
    upsert_show_metadata, ShowMetadataRow,
};
pub use queries::shows::{
    count_shows, find_show_by_imdb_id, find_show_by_parsed_title_key, get_show_by_id,
    link_show_to_imdb, list_shows, merge_shows, resolve_show_for_directory, show_id_for,
    upsert_show, ShowRow, ShowsFilter,
};
pub use queries::user_settings::{get_setting, set_setting};
pub use queries::video_metadata::{
    count_matched_by_library, delete_video_metadata, get_metadata_by_video_id,
    get_unmatched_video_ids, has_video_metadata, list_videos_needing_poster_download,
    set_video_poster_local_path, upsert_video_metadata, VideoMetadataRow,
};
pub use queries::videos::{
    assign_video_to_show, count_videos_by_library, get_streams_by_video_id, get_video_by_id,
    get_videos, get_videos_by_film_id, get_videos_by_library, get_videos_by_show_episode,
    get_videos_by_show_id, replace_video_streams, sum_file_size_by_library, upsert_video,
    NewVideoStream, VideoFilter, VideoRow, VideoStreamRow, VideosFilter,
};
pub use queries::watchlist::{
    add_watchlist_item, get_watchlist, get_watchlist_item_by_film_id, get_watchlist_item_by_id,
    remove_watchlist_item, update_watchlist_progress, WatchlistItemRow,
};

//
// The two connection-time PRAGMAs are part of the data-correctness contract:
//
// - `journal_mode = wal` keeps reads safe against the writer (chunker /
//   scanner / mutation handlers all hit the same DB; WAL is what prevents
//   SQLITE_BUSY at the resolver layer).
// - `foreign_keys = ON` is what makes the cascade-delete chain
//   (libraries → videos → segments / metadata / watchlist) actually fire.
//   Without it, deleting a library leaves orphaned rows.
//
// The Rust port has to match. These tests are the contract.

#[cfg(test)]
mod pragma_tests {
    use super::*;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    #[test]
    fn journal_mode_is_wal_on_disk_backed_db() {
        // SQLite refuses to use WAL on `:memory:` DBs (it has no sidecar
        // file to write the WAL into and silently reports "memory" mode
        // instead). Production opens a real file path, so the assertion
        // belongs against a tempfile — same code path the real boot takes.
        let tmp = tempfile::NamedTempFile::new().expect("tempfile");
        let db = Db::open(tmp.path()).expect("open file-backed db");
        let mode: String = db
            .with(|c| {
                c.query_row("PRAGMA journal_mode", [], |r| r.get::<_, String>(0))
                    .map_err(Into::into)
            })
            .expect("query journal_mode");
        assert_eq!(mode.to_lowercase(), "wal");
    }

    #[test]
    fn foreign_keys_is_enabled() {
        let db = fresh_db();
        let on: i64 = db
            .with(|c| {
                c.query_row("PRAGMA foreign_keys", [], |r| r.get::<_, i64>(0))
                    .map_err(Into::into)
            })
            .expect("query foreign_keys");
        assert_eq!(on, 1);
    }

    #[test]
    fn fk_violation_on_video_insert_without_library_returns_error() {
        // FK violations surface as `DbError::Sqlite` — never a silent
        // insert that leaves an orphan row.
        let db = fresh_db();
        let result: DbResult<()> = db.with(|c| {
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES ('orphan', 'no-such-lib', '/tmp/orphan.mkv', 'orphan.mkv',
                         NULL, 0.0, 0, 0, '2026-01-01T00:00:00.000Z', 'fp')",
                [],
            )?;
            Ok(())
        });
        assert!(result.is_err(), "FK violation must propagate as Err");
    }
}
