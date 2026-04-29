//! Transcode-job queries — read-only for Step 1. Writes (insert / update /
//! eviction) land with the chunker in Step 2.
//! Mirrors `server/src/db/queries/jobs.ts`.

use rusqlite::{params, OptionalExtension, Row};

use crate::db::Db;
use crate::error::DbResult;

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

pub fn get_job_by_id(db: &Db, id: &str) -> DbResult<Option<TranscodeJobRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM transcode_jobs WHERE id = ?1",
                params![id],
                TranscodeJobRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Mirrors the read-only subset of `server/src/db/queries/__tests__/jobs.test.ts`.
// `insertJob`, `updateJobStatus`, `getInterruptedJobs`, `getLruJobs`,
// `markJobEvicted`, and `deleteJobById` are write helpers that ship with the
// chunker in Step 2 — their tests will land there. For now we cover only
// `get_job_by_id`.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_video_with_library(db: &Db) {
        db.with(|c| {
            c.execute(
                "INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
                 VALUES ('libtest', 'Test Lib', '/test', 'movies', 'dev', '[]')",
                [],
            )?;
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES ('vvvv', 'libtest', '/test/v.mp4', 'v.mp4', 'Test Video',
                         3600, 1000000, 5000000, '2026-01-01T00:00:00.000Z',
                         '1000000:aabbccdd')",
                [],
            )?;
            Ok(())
        })
        .expect("seed library + video");
    }

    fn seed_job(db: &Db, id: &str, status: &str) {
        db.with(|c| {
            c.execute(
                "INSERT INTO transcode_jobs
                 (id, video_id, resolution, status, segment_dir, total_segments,
                  completed_segments, start_time_seconds, end_time_seconds,
                  created_at, updated_at, error)
                 VALUES (?1, 'vvvv', '1080p', ?2, ?3, NULL, 0, NULL, NULL,
                         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)",
                params![id, status, format!("/tmp/{id}")],
            )?;
            Ok(())
        })
        .expect("seed job");
    }

    #[test]
    fn get_job_by_id_returns_none_for_missing_job() {
        let db = fresh_db();
        assert!(get_job_by_id(&db, "no-such-job").expect("query").is_none());
    }

    #[test]
    fn get_job_by_id_round_trips_all_fields() {
        let db = fresh_db();
        seed_video_with_library(&db);
        // Bypass insertJob (chunker territory) and seed the row directly to
        // assert the read shape; once writers land in Step 2 this test should
        // call the writer and then re-read.
        db.with(|c| {
            c.execute(
                "INSERT INTO transcode_jobs
                 (id, video_id, resolution, status, segment_dir, total_segments,
                  completed_segments, start_time_seconds, end_time_seconds,
                  created_at, updated_at, error)
                 VALUES ('full1', 'vvvv', '4k', 'complete', '/tmp/full1',
                         42, 42, 10.5, 20.0,
                         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)",
                [],
            )?;
            Ok(())
        })
        .expect("seed full job");

        let row = get_job_by_id(&db, "full1")
            .expect("query")
            .expect("job exists");
        assert_eq!(row.resolution, "4k");
        assert_eq!(row.status, "complete");
        assert_eq!(row.total_segments, Some(42));
        assert_eq!(row.completed_segments, 42);
        assert_eq!(row.start_time_seconds, Some(10.5));
        assert_eq!(row.end_time_seconds, Some(20.0));
    }

    #[test]
    fn get_job_by_id_returns_status_distinct_per_row() {
        let db = fresh_db();
        seed_video_with_library(&db);
        seed_job(&db, "rr1", "running");
        seed_job(&db, "rr3", "complete");

        let r1 = get_job_by_id(&db, "rr1").expect("q1").expect("rr1 exists");
        let r3 = get_job_by_id(&db, "rr3").expect("q3").expect("rr3 exists");
        assert_eq!(r1.status, "running");
        assert_eq!(r3.status, "complete");
    }
}
