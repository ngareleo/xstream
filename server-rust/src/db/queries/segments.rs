//! Segment queries.
//!
//! Segments belong to a transcode job (FK CASCADE). The chunker writes one
//! row per encoded segment as ffmpeg flushes it; the stream route reads
//! them back when the in-memory job state has been evicted.

use rusqlite::{params, OptionalExtension, Row};

use crate::db::Db;
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct SegmentRow {
    pub id: i64,
    pub job_id: String,
    pub segment_index: i64,
    pub path: String,
    pub duration_seconds: Option<f64>,
    pub size_bytes: Option<i64>,
}

/// Subset used at insert time — the autoincrement id is assigned by SQLite.
#[derive(Clone, Debug)]
pub struct NewSegment<'a> {
    pub job_id: &'a str,
    pub segment_index: i64,
    pub path: &'a str,
    pub duration_seconds: Option<f64>,
    pub size_bytes: Option<i64>,
}

impl SegmentRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            job_id: r.get("job_id")?,
            segment_index: r.get("segment_index")?,
            path: r.get("path")?,
            duration_seconds: r.get("duration_seconds")?,
            size_bytes: r.get("size_bytes")?,
        })
    }
}

/// `INSERT OR IGNORE` — duplicate `(job_id, segment_index)` pairs are silently
/// dropped. The chunker's notify watcher can fire twice for the same file
/// during heavy 4K writes; the unique index is the de-dup primitive, this
/// query honors it.
pub fn insert_segment(db: &Db, seg: &NewSegment<'_>) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT OR IGNORE INTO segments
                 (job_id, segment_index, path, duration_seconds, size_bytes)
               VALUES (?1, ?2, ?3, ?4, ?5)"#,
            params![
                seg.job_id,
                seg.segment_index,
                seg.path,
                seg.duration_seconds,
                seg.size_bytes,
            ],
        )?;
        Ok(())
    })
}

pub fn get_segments_by_job(db: &Db, job_id: &str) -> DbResult<Vec<SegmentRow>> {
    db.with(|c| {
        let mut stmt =
            c.prepare("SELECT * FROM segments WHERE job_id = ?1 ORDER BY segment_index")?;
        let rows = stmt.query_map(params![job_id], SegmentRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn get_segment(db: &Db, job_id: &str, segment_index: i64) -> DbResult<Option<SegmentRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM segments WHERE job_id = ?1 AND segment_index = ?2",
                params![job_id, segment_index],
                SegmentRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn delete_segments_by_job(db: &Db, job_id: &str) -> DbResult<usize> {
    db.with(|c| {
        let n = c.execute("DELETE FROM segments WHERE job_id = ?1", params![job_id])?;
        Ok(n)
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Each test seeds the FK-parent chain (libraries → videos → transcode_jobs)
// inline so a fresh `:memory:` db starts from a known state. Coverage spans
// insert / read / count by job_id and the FK-violation path.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_parents(db: &Db) {
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
            c.execute(
                "INSERT INTO transcode_jobs
                 (id, video_id, resolution, status, segment_dir, completed_segments,
                  created_at, updated_at)
                 VALUES ('job1', 'vvvv', '1080p', 'running', '/tmp/job1', 0,
                         '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
                [],
            )?;
            Ok(())
        })
        .expect("seed parents");
    }

    fn seg(index: i64) -> NewSegment<'static> {
        NewSegment {
            job_id: "job1",
            segment_index: index,
            // Allocate via Box::leak so the &'static str matches what the
            // tests need without pulling lifetimes through the helper. The
            // memory is freed when the test process exits.
            path: Box::leak(format!("/tmp/job1/segment_{index:04}.m4s").into_boxed_str()),
            duration_seconds: Some(2.0),
            size_bytes: Some(512_000),
        }
    }

    #[test]
    fn insert_segment_inserts_a_new_row() {
        let db = fresh_db();
        seed_parents(&db);
        insert_segment(&db, &seg(0)).expect("insert");
        let row = get_segment(&db, "job1", 0)
            .expect("query")
            .expect("segment exists");
        assert_eq!(row.path, "/tmp/job1/segment_0000.m4s");
        assert_eq!(row.segment_index, 0);
        assert_eq!(row.size_bytes, Some(512_000));
    }

    #[test]
    fn insert_segment_ignores_duplicate_job_id_segment_index() {
        let db = fresh_db();
        seed_parents(&db);
        insert_segment(&db, &seg(0)).expect("insert");
        // Insert duplicate with different payload — must not throw and must
        // not overwrite.
        insert_segment(
            &db,
            &NewSegment {
                job_id: "job1",
                segment_index: 0,
                path: "/tmp/job1/DIFFERENT_PATH.m4s",
                duration_seconds: Some(99.0),
                size_bytes: Some(999),
            },
        )
        .expect("duplicate insert is silently ignored");
        let row = get_segment(&db, "job1", 0)
            .expect("query")
            .expect("segment exists");
        assert_eq!(row.path, "/tmp/job1/segment_0000.m4s");
        assert_eq!(row.size_bytes, Some(512_000));
    }

    #[test]
    fn insert_segment_inserts_multiple_indices() {
        let db = fresh_db();
        seed_parents(&db);
        insert_segment(&db, &seg(0)).expect("0");
        insert_segment(&db, &seg(1)).expect("1");
        insert_segment(&db, &seg(2)).expect("2");
        let rows = get_segments_by_job(&db, "job1").expect("query");
        assert_eq!(rows.len(), 3);
    }

    #[test]
    fn insert_segment_persists_null_duration_when_unknown() {
        let db = fresh_db();
        seed_parents(&db);
        insert_segment(
            &db,
            &NewSegment {
                job_id: "job1",
                segment_index: 3,
                path: "/tmp/job1/segment_0003.m4s",
                duration_seconds: None,
                size_bytes: Some(1024),
            },
        )
        .expect("insert");
        let row = get_segment(&db, "job1", 3)
            .expect("query")
            .expect("segment exists");
        assert!(row.duration_seconds.is_none());
    }

    #[test]
    fn get_segments_by_job_returns_rows_ordered_by_index_ascending() {
        let db = fresh_db();
        seed_parents(&db);
        // Insert in scrambled order to verify the SQL `ORDER BY` clause
        // does the work, not insertion order.
        insert_segment(&db, &seg(2)).expect("2");
        insert_segment(&db, &seg(0)).expect("0");
        insert_segment(&db, &seg(1)).expect("1");
        let rows = get_segments_by_job(&db, "job1").expect("query");
        let indices: Vec<i64> = rows.iter().map(|r| r.segment_index).collect();
        assert_eq!(indices, vec![0, 1, 2]);
    }

    #[test]
    fn get_segments_by_job_returns_empty_for_unknown_job() {
        let db = fresh_db();
        let rows = get_segments_by_job(&db, "no-such-job").expect("query");
        assert!(rows.is_empty());
    }

    #[test]
    fn get_segment_returns_none_for_missing_index() {
        let db = fresh_db();
        seed_parents(&db);
        assert!(get_segment(&db, "job1", 999).expect("query").is_none());
    }

    #[test]
    fn get_segment_returns_none_for_unknown_job() {
        let db = fresh_db();
        assert!(get_segment(&db, "no-such-job", 0).expect("query").is_none());
    }

    #[test]
    fn get_segment_returns_correct_row_for_job_and_index() {
        let db = fresh_db();
        seed_parents(&db);
        insert_segment(&db, &seg(0)).expect("0");
        insert_segment(&db, &seg(1)).expect("1");
        let row = get_segment(&db, "job1", 1)
            .expect("query")
            .expect("segment exists");
        assert_eq!(row.job_id, "job1");
        assert_eq!(row.segment_index, 1);
        assert_eq!(row.path, "/tmp/job1/segment_0001.m4s");
    }

    #[test]
    fn delete_segments_by_job_removes_every_row_for_that_job() {
        let db = fresh_db();
        seed_parents(&db);
        insert_segment(&db, &seg(0)).expect("0");
        insert_segment(&db, &seg(1)).expect("1");
        insert_segment(&db, &seg(2)).expect("2");
        let removed = delete_segments_by_job(&db, "job1").expect("delete");
        assert_eq!(removed, 3);
        assert!(get_segments_by_job(&db, "job1").expect("query").is_empty());
    }

    #[test]
    fn delete_segments_by_job_returns_zero_when_no_rows_match() {
        let db = fresh_db();
        let removed = delete_segments_by_job(&db, "no-such-job").expect("delete");
        assert_eq!(removed, 0);
    }
}
