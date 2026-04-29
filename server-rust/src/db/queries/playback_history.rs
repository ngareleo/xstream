//! Trace-ID-keyed playback session log. Mirrors
//! `server/src/db/queries/playbackHistory.ts`.

use rusqlite::{params, Row};

use crate::db::Db;
use crate::error::DbResult;

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

pub fn insert_playback_session(db: &Db, row: &PlaybackHistoryRow) -> DbResult<()> {
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

pub fn get_playback_history(db: &Db, limit: i64) -> DbResult<Vec<PlaybackHistoryRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            r#"SELECT id, trace_id, video_id, video_title, resolution, started_at
               FROM playback_history ORDER BY started_at DESC LIMIT ?1"#,
        )?;
        let rows = stmt.query_map(params![limit], PlaybackHistoryRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// No Bun counterpart. Added here for pattern consistency. The DESC-by-started_at
// ordering and the limit semantic are the load-bearing assertions for the
// client's "trace history" Settings tab.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn row(id: &str, started_at: &str) -> PlaybackHistoryRow {
        PlaybackHistoryRow {
            id: id.to_string(),
            trace_id: format!("trace-{id}"),
            video_id: format!("video-{id}"),
            video_title: format!("Title {id}"),
            resolution: "1080p".to_string(),
            started_at: started_at.to_string(),
        }
    }

    #[test]
    fn insert_then_get_round_trips_a_session() {
        let db = fresh_db();
        insert_playback_session(&db, &row("s1", "2026-01-01T00:00:00.000Z")).expect("insert");
        let all = get_playback_history(&db, 10).expect("query");
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, "s1");
        assert_eq!(all[0].trace_id, "trace-s1");
        assert_eq!(all[0].resolution, "1080p");
    }

    #[test]
    fn get_playback_history_returns_rows_in_desc_started_at_order() {
        let db = fresh_db();
        insert_playback_session(&db, &row("a", "2026-01-01T00:00:00.000Z")).expect("a");
        insert_playback_session(&db, &row("b", "2026-01-02T00:00:00.000Z")).expect("b");
        insert_playback_session(&db, &row("c", "2026-01-03T00:00:00.000Z")).expect("c");
        let all = get_playback_history(&db, 10).expect("query");
        let ids: Vec<&str> = all.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["c", "b", "a"]);
    }

    #[test]
    fn get_playback_history_respects_the_limit() {
        let db = fresh_db();
        for i in 0..5 {
            insert_playback_session(
                &db,
                &row(&format!("s{i}"), &format!("2026-01-0{i}T00:00:00.000Z")),
            )
            .expect("insert");
        }
        let all = get_playback_history(&db, 3).expect("query");
        assert_eq!(all.len(), 3);
    }

    #[test]
    fn get_playback_history_returns_empty_when_no_rows() {
        let db = fresh_db();
        let all = get_playback_history(&db, 10).expect("query");
        assert!(all.is_empty());
    }
}
