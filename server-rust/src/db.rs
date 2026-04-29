//! SQLite layer — connection, migrations, and all query functions.
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

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use rusqlite::{params, params_from_iter, Connection, OpenFlags, OptionalExtension, Row, ToSql};
use sha1::{Digest, Sha1};

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        if let Some(parent) = path.parent() {
            // SQLITE_OPEN_CREATE creates the file but not its parent directories.
            // Mkdir before open so a fresh checkout with no tmp/ doesn't crash.
            let _ = std::fs::create_dir_all(parent);
        }
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        run_migrations(&conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Execute `f` against the connection under the mutex. Holds the lock
    /// for the duration of the closure — keep the closure short.
    pub fn with<R>(&self, f: impl FnOnce(&Connection) -> R) -> R {
        let guard = self.conn.lock().expect("db mutex poisoned");
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
    // relative to the working directory (which `bun dev` and `cargo run`
    // both invoke from the repo root).
    PathBuf::from("tmp/xstream.db")
}

// ── sha1 helper ───────────────────────────────────────────────────────────────

pub fn sha1_hex(input: &str) -> String {
    let mut h = Sha1::new();
    h.update(input.as_bytes());
    hex_encode(&h.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(s, "{b:02x}");
    }
    s
}

// ── Row shapes ────────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct LibraryRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub media_type: String, // internal: "movies" | "tvShows"
    pub env: String,
    pub video_extensions: String, // JSON-encoded string array
}

impl LibraryRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            name: r.get("name")?,
            path: r.get("path")?,
            media_type: r.get("media_type")?,
            env: r.get("env")?,
            video_extensions: r.get("video_extensions")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct VideoRow {
    pub id: String,
    pub library_id: String,
    pub path: String,
    pub filename: String,
    pub title: Option<String>,
    pub duration_seconds: f64,
    pub file_size_bytes: i64,
    pub bitrate: i64,
    pub scanned_at: String,
    pub content_fingerprint: String,
}

impl VideoRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            library_id: r.get("library_id")?,
            path: r.get("path")?,
            filename: r.get("filename")?,
            title: r.get("title")?,
            duration_seconds: r.get("duration_seconds")?,
            file_size_bytes: r.get("file_size_bytes")?,
            bitrate: r.get("bitrate")?,
            scanned_at: r.get("scanned_at")?,
            content_fingerprint: r.get("content_fingerprint")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct VideoStreamRow {
    pub id: i64,
    pub video_id: String,
    pub stream_type: String, // "video" | "audio"
    pub codec: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<f64>,
    pub channels: Option<i64>,
    pub sample_rate: Option<i64>,
}

impl VideoStreamRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            video_id: r.get("video_id")?,
            stream_type: r.get("stream_type")?,
            codec: r.get("codec")?,
            width: r.get("width")?,
            height: r.get("height")?,
            fps: r.get("fps")?,
            channels: r.get("channels")?,
            sample_rate: r.get("sample_rate")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct VideoMetadataRow {
    pub video_id: String,
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub cast_list: Option<String>, // JSON-encoded string array
    pub rating: Option<f64>,
    pub plot: Option<String>,
    pub poster_url: Option<String>,
    pub matched_at: String,
}

impl VideoMetadataRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            video_id: r.get("video_id")?,
            imdb_id: r.get("imdb_id")?,
            title: r.get("title")?,
            year: r.get("year")?,
            genre: r.get("genre")?,
            director: r.get("director")?,
            cast_list: r.get("cast_list")?,
            rating: r.get("rating")?,
            plot: r.get("plot")?,
            poster_url: r.get("poster_url")?,
            matched_at: r.get("matched_at")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct WatchlistItemRow {
    pub id: String,
    pub video_id: String,
    pub added_at: String,
    pub progress_seconds: f64,
    pub notes: Option<String>,
}

impl WatchlistItemRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            video_id: r.get("video_id")?,
            added_at: r.get("added_at")?,
            progress_seconds: r.get("progress_seconds")?,
            notes: r.get("notes")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct TranscodeJobRow {
    pub id: String,
    pub video_id: String,
    pub resolution: String, // internal kebab: "240p"|...|"4k"
    pub status: String,     // "pending"|"running"|"complete"|"error"
    pub segment_dir: String,
    pub total_segments: Option<i64>,
    pub completed_segments: i64,
    pub start_time_seconds: Option<f64>,
    pub end_time_seconds: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
    pub error: Option<String>,
}

impl TranscodeJobRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            video_id: r.get("video_id")?,
            resolution: r.get("resolution")?,
            status: r.get("status")?,
            segment_dir: r.get("segment_dir")?,
            total_segments: r.get("total_segments")?,
            completed_segments: r.get("completed_segments")?,
            start_time_seconds: r.get("start_time_seconds")?,
            end_time_seconds: r.get("end_time_seconds")?,
            created_at: r.get("created_at")?,
            updated_at: r.get("updated_at")?,
            error: r.get("error")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct PlaybackHistoryRow {
    pub id: String,
    pub trace_id: String,
    pub video_id: String,
    pub video_title: String,
    pub resolution: String,
    pub started_at: String,
}

impl PlaybackHistoryRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            trace_id: r.get("trace_id")?,
            video_id: r.get("video_id")?,
            video_title: r.get("video_title")?,
            resolution: r.get("resolution")?,
            started_at: r.get("started_at")?,
        })
    }
}

// ── Filters ───────────────────────────────────────────────────────────────────

#[derive(Default, Clone, Debug)]
pub struct VideoFilter {
    pub search: Option<String>,
    /// Internal media type: "movies" | "tvShows"
    pub media_type: Option<String>,
}

#[derive(Default, Clone, Debug)]
pub struct VideosFilter {
    pub library_id: Option<String>,
    pub search: Option<String>,
    pub media_type: Option<String>,
}

// ── Migrations ────────────────────────────────────────────────────────────────

fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        BEGIN;
        CREATE TABLE IF NOT EXISTS libraries (
          id               TEXT PRIMARY KEY,
          name             TEXT NOT NULL,
          path             TEXT NOT NULL UNIQUE,
          media_type       TEXT NOT NULL,
          env              TEXT NOT NULL,
          video_extensions TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS videos (
          id                   TEXT PRIMARY KEY,
          library_id           TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          path                 TEXT NOT NULL UNIQUE,
          filename             TEXT NOT NULL,
          title                TEXT,
          duration_seconds     REAL NOT NULL,
          file_size_bytes      INTEGER NOT NULL,
          bitrate              INTEGER NOT NULL,
          scanned_at           TEXT NOT NULL,
          content_fingerprint  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS videos_library_id ON videos(library_id);
        CREATE TABLE IF NOT EXISTS video_streams (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id     TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          stream_type  TEXT NOT NULL,
          codec        TEXT NOT NULL,
          width        INTEGER,
          height       INTEGER,
          fps          REAL,
          channels     INTEGER,
          sample_rate  INTEGER
        );
        CREATE INDEX IF NOT EXISTS video_streams_video_id ON video_streams(video_id);
        CREATE TABLE IF NOT EXISTS transcode_jobs (
          id                  TEXT PRIMARY KEY,
          video_id            TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          resolution          TEXT NOT NULL,
          status              TEXT NOT NULL,
          segment_dir         TEXT NOT NULL,
          total_segments      INTEGER,
          completed_segments  INTEGER NOT NULL DEFAULT 0,
          start_time_seconds  REAL,
          end_time_seconds    REAL,
          created_at          TEXT NOT NULL,
          updated_at          TEXT NOT NULL,
          error               TEXT
        );
        CREATE TABLE IF NOT EXISTS segments (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id           TEXT NOT NULL REFERENCES transcode_jobs(id) ON DELETE CASCADE,
          segment_index    INTEGER NOT NULL,
          path             TEXT NOT NULL,
          duration_seconds REAL,
          size_bytes       INTEGER,
          UNIQUE(job_id, segment_index)
        );
        CREATE INDEX IF NOT EXISTS segments_job_id ON segments(job_id);
        CREATE TABLE IF NOT EXISTS video_metadata (
          video_id      TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
          imdb_id       TEXT NOT NULL,
          title         TEXT NOT NULL,
          year          INTEGER,
          genre         TEXT,
          director      TEXT,
          cast_list     TEXT,
          rating        REAL,
          plot          TEXT,
          poster_url    TEXT,
          matched_at    TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS watchlist_items (
          id               TEXT PRIMARY KEY,
          video_id         TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
          added_at         TEXT NOT NULL,
          progress_seconds REAL NOT NULL DEFAULT 0,
          notes            TEXT,
          UNIQUE(video_id)
        );
        CREATE INDEX IF NOT EXISTS watchlist_video_id ON watchlist_items(video_id);
        CREATE TABLE IF NOT EXISTS user_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS playback_history (
          id          TEXT PRIMARY KEY,
          trace_id    TEXT NOT NULL,
          video_id    TEXT NOT NULL,
          video_title TEXT NOT NULL,
          resolution  TEXT NOT NULL,
          started_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS playback_history_started_at ON playback_history(started_at DESC);
        COMMIT;
        "#,
    )
}

// ── Library queries ───────────────────────────────────────────────────────────

pub fn get_all_libraries(db: &Db) -> rusqlite::Result<Vec<LibraryRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM libraries")?;
        let rows = stmt.query_map([], LibraryRow::from_row)?;
        rows.collect()
    })
}

pub fn get_library_by_id(db: &Db, id: &str) -> rusqlite::Result<Option<LibraryRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM libraries WHERE id = ?1",
            params![id],
            LibraryRow::from_row,
        )
        .optional()
    })
}

pub fn create_library(
    db: &Db,
    name: &str,
    path: &str,
    media_type: &str,
    extensions: &[String],
) -> rusqlite::Result<LibraryRow> {
    let id = sha1_hex(path);
    let exts_json = if extensions.is_empty() {
        // Mirror Bun's DEFAULT_VIDEO_EXTENSIONS
        serde_json::to_string(&[".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm", ".ts"])
            .expect("static array serialises")
    } else {
        serde_json::to_string(extensions).expect("string array serialises")
    };
    db.with(|c| -> rusqlite::Result<()> {
        c.execute(
            r#"INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(path) DO UPDATE SET
                 name = excluded.name,
                 media_type = excluded.media_type,
                 env = excluded.env,
                 video_extensions = excluded.video_extensions"#,
            params![id, name, path, media_type, "user", exts_json],
        )?;
        Ok(())
    })?;
    Ok(get_library_by_id(db, &id)?.expect("library just inserted must exist"))
}

pub fn delete_library(db: &Db, id: &str) -> rusqlite::Result<bool> {
    db.with(|c| {
        c.execute("DELETE FROM libraries WHERE id = ?1", params![id])
            .map(|n| n > 0)
    })
}

pub struct LibraryUpdate<'a> {
    pub name: Option<&'a str>,
    pub path: Option<&'a str>,
    pub media_type: Option<&'a str>,
    pub extensions: Option<Vec<String>>,
}

pub fn update_library(
    db: &Db,
    id: &str,
    update: LibraryUpdate<'_>,
) -> rusqlite::Result<Option<LibraryRow>> {
    let mut parts: Vec<&str> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if let Some(n) = update.name {
        parts.push("name = ?");
        vals.push(Box::new(n.to_string()));
    }
    if let Some(p) = update.path {
        parts.push("path = ?");
        vals.push(Box::new(p.to_string()));
    }
    if let Some(mt) = update.media_type {
        parts.push("media_type = ?");
        vals.push(Box::new(mt.to_string()));
    }
    if let Some(exts) = update.extensions {
        parts.push("video_extensions = ?");
        vals.push(Box::new(
            serde_json::to_string(&exts).expect("string vec serialises"),
        ));
    }
    if parts.is_empty() {
        return get_library_by_id(db, id);
    }
    let sql = format!("UPDATE libraries SET {} WHERE id = ?", parts.join(", "));
    vals.push(Box::new(id.to_string()));
    db.with(|c| -> rusqlite::Result<()> {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        c.execute(&sql, params_from_iter(refs))?;
        Ok(())
    })?;
    get_library_by_id(db, id)
}

// ── Video queries ─────────────────────────────────────────────────────────────

pub fn get_video_by_id(db: &Db, id: &str) -> rusqlite::Result<Option<VideoRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM videos WHERE id = ?1",
            params![id],
            VideoRow::from_row,
        )
        .optional()
    })
}

pub fn get_videos(db: &Db, limit: i64, filter: VideosFilter) -> rusqlite::Result<Vec<VideoRow>> {
    let mut sql = String::from("SELECT v.* FROM videos v");
    let mut clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if let Some(lib) = filter.library_id {
        clauses.push(format!("v.library_id = ?{}", vals.len() + 1));
        vals.push(Box::new(lib));
    }
    if let Some(s) = filter.search {
        clauses.push(format!("v.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if let Some(mt) = filter.media_type {
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            vals.len() + 1
        ));
        vals.push(Box::new(mt));
    }
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(&format!(
        " ORDER BY v.title, v.filename LIMIT ?{}",
        vals.len() + 1
    ));
    vals.push(Box::new(limit));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(refs), VideoRow::from_row)?;
        rows.collect()
    })
}

pub fn get_videos_by_library(
    db: &Db,
    library_id: &str,
    limit: i64,
    offset: i64,
    filter: VideoFilter,
) -> rusqlite::Result<Vec<VideoRow>> {
    let mut sql = String::from("SELECT v.* FROM videos v WHERE v.library_id = ?1");
    let mut vals: Vec<Box<dyn ToSql>> = vec![Box::new(library_id.to_string())];
    if let Some(s) = filter.search {
        sql.push_str(&format!(" AND v.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if let Some(mt) = filter.media_type {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            vals.len() + 1
        ));
        vals.push(Box::new(mt));
    }
    sql.push_str(&format!(
        " ORDER BY v.title, v.filename LIMIT ?{} OFFSET ?{}",
        vals.len() + 1,
        vals.len() + 2
    ));
    vals.push(Box::new(limit));
    vals.push(Box::new(offset));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(refs), VideoRow::from_row)?;
        rows.collect()
    })
}

pub fn count_videos_by_library(
    db: &Db,
    library_id: &str,
    filter: VideoFilter,
) -> rusqlite::Result<i64> {
    let mut sql = String::from("SELECT COUNT(*) AS c FROM videos v WHERE v.library_id = ?1");
    let mut vals: Vec<Box<dyn ToSql>> = vec![Box::new(library_id.to_string())];
    if let Some(s) = filter.search {
        sql.push_str(&format!(" AND v.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if let Some(mt) = filter.media_type {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            vals.len() + 1
        ));
        vals.push(Box::new(mt));
    }
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        c.query_row(&sql, params_from_iter(refs), |r| r.get::<_, i64>(0))
    })
}

pub fn sum_file_size_by_library(db: &Db, library_id: &str) -> rusqlite::Result<i64> {
    db.with(|c| {
        c.query_row(
            "SELECT COALESCE(SUM(file_size_bytes), 0) FROM videos WHERE library_id = ?1",
            params![library_id],
            |r| r.get::<_, i64>(0),
        )
    })
}

pub fn get_streams_by_video_id(db: &Db, video_id: &str) -> rusqlite::Result<Vec<VideoStreamRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM video_streams WHERE video_id = ?1")?;
        let rows = stmt.query_map(params![video_id], VideoStreamRow::from_row)?;
        rows.collect()
    })
}

// ── Job queries (read-only for Step 1) ────────────────────────────────────────

pub fn get_job_by_id(db: &Db, id: &str) -> rusqlite::Result<Option<TranscodeJobRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM transcode_jobs WHERE id = ?1",
            params![id],
            TranscodeJobRow::from_row,
        )
        .optional()
    })
}

// ── Video metadata queries ────────────────────────────────────────────────────

pub fn get_metadata_by_video_id(
    db: &Db,
    video_id: &str,
) -> rusqlite::Result<Option<VideoMetadataRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM video_metadata WHERE video_id = ?1",
            params![video_id],
            VideoMetadataRow::from_row,
        )
        .optional()
    })
}

pub fn has_video_metadata(db: &Db, video_id: &str) -> rusqlite::Result<bool> {
    db.with(|c| {
        let exists: Option<i64> = c
            .query_row(
                "SELECT 1 FROM video_metadata WHERE video_id = ?1 LIMIT 1",
                params![video_id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    })
}

pub fn count_matched_by_library(db: &Db, library_id: &str) -> rusqlite::Result<(i64, i64)> {
    db.with(|c| {
        c.query_row(
            r#"SELECT COUNT(m.video_id) AS matched,
                      COUNT(v.id) - COUNT(m.video_id) AS unmatched
               FROM videos v LEFT JOIN video_metadata m ON v.id = m.video_id
               WHERE v.library_id = ?1"#,
            params![library_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
    })
}

pub fn upsert_video_metadata(db: &Db, row: &VideoMetadataRow) -> rusqlite::Result<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO video_metadata
                 (video_id, imdb_id, title, year, genre, director, cast_list,
                  rating, plot, poster_url, matched_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
               ON CONFLICT(video_id) DO UPDATE SET
                 imdb_id    = excluded.imdb_id,
                 title      = excluded.title,
                 year       = excluded.year,
                 genre      = excluded.genre,
                 director   = excluded.director,
                 cast_list  = excluded.cast_list,
                 rating     = excluded.rating,
                 plot       = excluded.plot,
                 poster_url = excluded.poster_url,
                 matched_at = excluded.matched_at"#,
            params![
                row.video_id,
                row.imdb_id,
                row.title,
                row.year,
                row.genre,
                row.director,
                row.cast_list,
                row.rating,
                row.plot,
                row.poster_url,
                row.matched_at,
            ],
        )?;
        Ok(())
    })
}

pub fn delete_video_metadata(db: &Db, video_id: &str) -> rusqlite::Result<()> {
    db.with(|c| {
        c.execute(
            "DELETE FROM video_metadata WHERE video_id = ?1",
            params![video_id],
        )?;
        Ok(())
    })
}

// ── Watchlist queries ─────────────────────────────────────────────────────────

pub fn get_watchlist(db: &Db) -> rusqlite::Result<Vec<WatchlistItemRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM watchlist_items ORDER BY added_at DESC")?;
        let rows = stmt.query_map([], WatchlistItemRow::from_row)?;
        rows.collect()
    })
}

pub fn get_watchlist_item_by_id(db: &Db, id: &str) -> rusqlite::Result<Option<WatchlistItemRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM watchlist_items WHERE id = ?1",
            params![id],
            WatchlistItemRow::from_row,
        )
        .optional()
    })
}

pub fn get_watchlist_item_by_video_id(
    db: &Db,
    video_id: &str,
) -> rusqlite::Result<Option<WatchlistItemRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM watchlist_items WHERE video_id = ?1",
            params![video_id],
            WatchlistItemRow::from_row,
        )
        .optional()
    })
}

pub fn add_watchlist_item(db: &Db, video_id: &str) -> rusqlite::Result<WatchlistItemRow> {
    let id = sha1_hex(&format!("watchlist:{video_id}"));
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    db.with(|c| -> rusqlite::Result<()> {
        c.execute(
            r#"INSERT INTO watchlist_items (id, video_id, added_at, progress_seconds)
               VALUES (?1, ?2, ?3, 0)
               ON CONFLICT(video_id) DO NOTHING"#,
            params![id, video_id, now],
        )?;
        Ok(())
    })?;
    Ok(get_watchlist_item_by_video_id(db, video_id)?
        .expect("watchlist item just inserted must exist"))
}

pub fn remove_watchlist_item(db: &Db, id: &str) -> rusqlite::Result<bool> {
    db.with(|c| {
        c.execute("DELETE FROM watchlist_items WHERE id = ?1", params![id])
            .map(|n| n > 0)
    })
}

pub fn update_watchlist_progress(
    db: &Db,
    video_id: &str,
    progress_seconds: f64,
) -> rusqlite::Result<Option<WatchlistItemRow>> {
    db.with(|c| -> rusqlite::Result<()> {
        c.execute(
            "UPDATE watchlist_items SET progress_seconds = ?1 WHERE video_id = ?2",
            params![progress_seconds, video_id],
        )?;
        Ok(())
    })?;
    get_watchlist_item_by_video_id(db, video_id)
}

// ── User settings ─────────────────────────────────────────────────────────────

pub fn get_setting(db: &Db, key: &str) -> rusqlite::Result<Option<String>> {
    db.with(|c| {
        c.query_row(
            "SELECT value FROM user_settings WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        )
        .optional()
    })
}

pub fn set_setting(db: &Db, key: &str, value: &str) -> rusqlite::Result<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO user_settings (key, value) VALUES (?1, ?2)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
            params![key, value],
        )?;
        Ok(())
    })
}

// ── Playback history ──────────────────────────────────────────────────────────

pub fn insert_playback_session(db: &Db, row: &PlaybackHistoryRow) -> rusqlite::Result<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO playback_history
                 (id, trace_id, video_id, video_title, resolution, started_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
            params![
                row.id,
                row.trace_id,
                row.video_id,
                row.video_title,
                row.resolution,
                row.started_at,
            ],
        )?;
        Ok(())
    })
}

pub fn get_playback_history(db: &Db, limit: i64) -> rusqlite::Result<Vec<PlaybackHistoryRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            r#"SELECT id, trace_id, video_id, video_title, resolution, started_at
               FROM playback_history ORDER BY started_at DESC LIMIT ?1"#,
        )?;
        let rows = stmt.query_map(params![limit], PlaybackHistoryRow::from_row)?;
        rows.collect()
    })
}
