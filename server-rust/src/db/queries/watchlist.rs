//! Watchlist CRUD.

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

// ── Tests ────────────────────────────────────────────────────────────────────
//
// The ON-CONFLICT upsert + post-write read pattern in `add_watchlist_item`
// is non-obvious enough to be worth pinning down — a wrong merge direction
// or a missed re-read would silently corrupt the watchlist.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_video(db: &Db, video_id: &str) {
        db.with(|c| {
            c.execute(
                "INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
                 VALUES ('lib1', 'Test Lib', '/lib1', 'movies', 'dev', '[]')
                 ON CONFLICT(path) DO NOTHING",
                [],
            )?;
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES (?1, 'lib1', ?2, ?3, NULL, 100.0, 1024, 5000,
                         '2026-01-01T00:00:00.000Z', '1024:abc')",
                params![
                    video_id,
                    format!("/v/{video_id}.mkv"),
                    format!("{video_id}.mkv")
                ],
            )?;
            Ok(())
        })
        .expect("seed video");
    }

    #[test]
    fn add_watchlist_item_inserts_a_new_row() {
        let db = fresh_db();
        seed_video(&db, "v1");
        let row = add_watchlist_item(&db, "v1").expect("add");
        assert_eq!(row.video_id, "v1");
        assert_eq!(row.progress_seconds, 0.0);
        assert!(row.notes.is_none());
        assert!(!row.id.is_empty()); // sha1("watchlist:v1")
    }

    #[test]
    fn add_watchlist_item_is_idempotent_on_video_id_conflict() {
        let db = fresh_db();
        seed_video(&db, "v1");
        let first = add_watchlist_item(&db, "v1").expect("first");
        let second = add_watchlist_item(&db, "v1").expect("second");
        // ON CONFLICT(video_id) DO NOTHING — second add should return the
        // original row unchanged, NOT create a duplicate or bump added_at.
        assert_eq!(first.id, second.id);
        assert_eq!(first.added_at, second.added_at);
        let all = get_watchlist(&db).expect("get_watchlist");
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn get_watchlist_returns_rows_in_added_at_desc_order() {
        let db = fresh_db();
        seed_video(&db, "v1");
        seed_video(&db, "v2");
        seed_video(&db, "v3");
        // Insert at known timestamps so ordering is deterministic regardless
        // of how fast `chrono::Utc::now()` ticks between add_watchlist_item
        // calls (in :memory: they can collide on the same millisecond).
        db.with(|c| {
            c.execute(
                "INSERT INTO watchlist_items (id, video_id, added_at, progress_seconds)
                 VALUES ('a', 'v1', '2026-01-01T00:00:00.000Z', 0),
                        ('b', 'v2', '2026-01-02T00:00:00.000Z', 0),
                        ('c', 'v3', '2026-01-03T00:00:00.000Z', 0)",
                [],
            )?;
            Ok(())
        })
        .expect("seed watchlist rows");
        let all = get_watchlist(&db).expect("get_watchlist");
        let ids: Vec<&str> = all.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["c", "b", "a"]);
    }

    #[test]
    fn get_watchlist_item_by_id_returns_none_for_unknown() {
        let db = fresh_db();
        assert!(get_watchlist_item_by_id(&db, "nope")
            .expect("query")
            .is_none());
    }

    #[test]
    fn get_watchlist_item_by_video_id_finds_the_row_after_add() {
        let db = fresh_db();
        seed_video(&db, "v1");
        let added = add_watchlist_item(&db, "v1").expect("add");
        let found = get_watchlist_item_by_video_id(&db, "v1")
            .expect("query")
            .expect("found");
        assert_eq!(found.id, added.id);
    }

    #[test]
    fn remove_watchlist_item_returns_true_when_row_existed() {
        let db = fresh_db();
        seed_video(&db, "v1");
        let added = add_watchlist_item(&db, "v1").expect("add");
        assert!(remove_watchlist_item(&db, &added.id).expect("remove"));
        assert!(get_watchlist_item_by_id(&db, &added.id)
            .expect("query")
            .is_none());
    }

    #[test]
    fn remove_watchlist_item_returns_false_when_row_did_not_exist() {
        let db = fresh_db();
        assert!(!remove_watchlist_item(&db, "no-such-id").expect("remove"));
    }

    #[test]
    fn update_watchlist_progress_writes_the_value() {
        let db = fresh_db();
        seed_video(&db, "v1");
        add_watchlist_item(&db, "v1").expect("add");
        let updated = update_watchlist_progress(&db, "v1", 42.5)
            .expect("update")
            .expect("row exists");
        assert_eq!(updated.progress_seconds, 42.5);
    }

    #[test]
    fn update_watchlist_progress_for_unknown_video_returns_none() {
        let db = fresh_db();
        let result = update_watchlist_progress(&db, "no-such-video", 10.0).expect("update");
        assert!(result.is_none());
    }
}
