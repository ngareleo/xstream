//! Watchlist CRUD. Mirrors `server/src/db/queries/watchlist.ts`.

use rusqlite::{params, OptionalExtension, Row};

use crate::db::{sha1_hex, Db};
use crate::error::{DbError, DbResult};

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

pub fn get_watchlist(db: &Db) -> DbResult<Vec<WatchlistItemRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM watchlist_items ORDER BY added_at DESC")?;
        let rows = stmt.query_map([], WatchlistItemRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn get_watchlist_item_by_id(db: &Db, id: &str) -> DbResult<Option<WatchlistItemRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM watchlist_items WHERE id = ?1",
                params![id],
                WatchlistItemRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn get_watchlist_item_by_video_id(
    db: &Db,
    video_id: &str,
) -> DbResult<Option<WatchlistItemRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM watchlist_items WHERE video_id = ?1",
                params![video_id],
                WatchlistItemRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn add_watchlist_item(db: &Db, video_id: &str) -> DbResult<WatchlistItemRow> {
    let id = sha1_hex(&format!("watchlist:{video_id}"));
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    db.with(|c| {
        c.execute(
            r#"INSERT INTO watchlist_items (id, video_id, added_at, progress_seconds)
               VALUES (?1, ?2, ?3, 0)
               ON CONFLICT(video_id) DO NOTHING"#,
            params![id, video_id, now],
        )?;
        Ok(())
    })?;
    get_watchlist_item_by_video_id(db, video_id)?.ok_or(DbError::Invariant(
        "watchlist_items row missing immediately after INSERT … ON CONFLICT",
    ))
}

pub fn remove_watchlist_item(db: &Db, id: &str) -> DbResult<bool> {
    db.with(|c| {
        let n = c.execute("DELETE FROM watchlist_items WHERE id = ?1", params![id])?;
        Ok(n > 0)
    })
}

pub fn update_watchlist_progress(
    db: &Db,
    video_id: &str,
    progress_seconds: f64,
) -> DbResult<Option<WatchlistItemRow>> {
    db.with(|c| {
        c.execute(
            "UPDATE watchlist_items SET progress_seconds = ?1 WHERE video_id = ?2",
            params![progress_seconds, video_id],
        )?;
        Ok(())
    })?;
    get_watchlist_item_by_video_id(db, video_id)
}
