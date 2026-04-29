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
