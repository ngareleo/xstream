//! Transcode-job queries — read-only for Step 1. Writes (insert / update /
//! eviction) land with the chunker in Step 2.
//! Mirrors `server/src/db/queries/jobs.ts`.

use rusqlite::{params, OptionalExtension, Row};

use crate::db::Db;

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
