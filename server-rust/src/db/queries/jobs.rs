//! Transcode-job queries.

use chrono::Utc;
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

/// One completed job's total on-disk byte footprint, for LRU eviction.
#[derive(Clone, Debug)]
pub struct LruJobRow {
    pub job: TranscodeJobRow,
    pub total_size_bytes: i64,
}

/// Optional fields supplied alongside a status transition. `None` keeps the
/// existing column value via `COALESCE($field, field)` on `total_segments`
/// / `completed_segments`.
#[derive(Default)]
pub struct JobStatusUpdate<'a> {
    pub total_segments: Option<i64>,
    pub completed_segments: Option<i64>,
    pub error: Option<&'a str>,
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

/// Upsert (`INSERT OR REPLACE`) — overwrites an existing row with the same id.
/// The deterministic content-addressed `id` makes a strict insert hostile:
/// re-encoding a previously-errored job would conflict.
pub fn insert_job(db: &Db, row: &TranscodeJobRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT OR REPLACE INTO transcode_jobs
                 (id, video_id, resolution, status, segment_dir, total_segments,
                  completed_segments, start_time_seconds, end_time_seconds,
                  created_at, updated_at, error)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
            params![
                row.id,
                row.video_id,
                row.resolution,
                row.status,
                row.segment_dir,
                row.total_segments,
                row.completed_segments,
                row.start_time_seconds,
                row.end_time_seconds,
                row.created_at,
                row.updated_at,
                row.error,
            ],
        )?;
        Ok(())
    })
}

/// Status transition. `total_segments` / `completed_segments` are
/// `COALESCE`-merged so callers can omit them (e.g. status-only flips don't
/// reset the counter). `error` is overwritten unconditionally — pass
/// `Some("")` is not equivalent to `None`; callers passing `None` clear it.
pub fn update_job_status(
    db: &Db,
    id: &str,
    status: &str,
    update: JobStatusUpdate<'_>,
) -> DbResult<()> {
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    db.with(|c| {
        c.execute(
            r#"UPDATE transcode_jobs SET
                 status             = ?1,
                 total_segments     = COALESCE(?2, total_segments),
                 completed_segments = COALESCE(?3, completed_segments),
                 error              = ?4,
                 updated_at         = ?5
               WHERE id = ?6"#,
            params![
                status,
                update.total_segments,
                update.completed_segments,
                update.error,
                now,
                id,
            ],
        )?;
        Ok(())
    })
}

/// All rows currently `status = 'running'`. Surfaced on boot so the restore
/// sweep can mark them as `error` — see `services/job_restore.rs`.
pub fn get_interrupted_jobs(db: &Db) -> DbResult<Vec<TranscodeJobRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM transcode_jobs WHERE status = 'running'")?;
        let rows = stmt.query_map([], TranscodeJobRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn delete_job_by_id(db: &Db, id: &str) -> DbResult<bool> {
    db.with(|c| {
        let n = c.execute("DELETE FROM transcode_jobs WHERE id = ?1", params![id])?;
        Ok(n > 0)
    })
}

/// Completed jobs sorted by `updated_at` ascending (oldest first), with each
/// job's total segment-byte footprint joined in. The chunker's LRU disk
/// eviction loop walks this list from the head.
pub fn get_lru_jobs(db: &Db) -> DbResult<Vec<LruJobRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            r#"SELECT j.*, COALESCE(SUM(s.size_bytes), 0) AS total_size_bytes
               FROM transcode_jobs j
               LEFT JOIN segments s ON s.job_id = j.id
               WHERE j.status = 'complete'
               GROUP BY j.id
               ORDER BY j.updated_at ASC"#,
        )?;
        let rows = stmt.query_map([], |r| {
            let total_size_bytes: i64 = r.get("total_size_bytes")?;
            let job = TranscodeJobRow::from_row(r)?;
            Ok(LruJobRow {
                job,
                total_size_bytes,
            })
        })?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

/// Mark a job as evicted so the next stream request for the same content
/// range triggers a fresh transcode rather than serving missing files.
pub fn mark_job_evicted(db: &Db, id: &str) -> DbResult<()> {
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    db.with(|c| {
        c.execute(
            "UPDATE transcode_jobs SET status = 'error', error = 'evicted', updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Each test seeds the FK-parent rows (libraries → videos) inline so a
// fresh `:memory:` db starts from a known state. Tests cover writes
// (insert / upsert / status transitions) AND read-after-write so a
// constraint regression surfaces immediately.

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

    fn job(id: &str, status: &str) -> TranscodeJobRow {
        TranscodeJobRow {
            id: id.to_string(),
            video_id: "vvvv".to_string(),
            resolution: "1080p".to_string(),
            status: status.to_string(),
            segment_dir: format!("/tmp/{id}"),
            total_segments: None,
            completed_segments: 0,
            start_time_seconds: None,
            end_time_seconds: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            error: None,
        }
    }

    #[test]
    fn insert_job_inserts_a_new_row() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("aaaa", "pending")).expect("insert");
        let row = get_job_by_id(&db, "aaaa")
            .expect("query")
            .expect("job exists");
        assert_eq!(row.status, "pending");
        assert_eq!(row.resolution, "1080p");
        assert_eq!(row.completed_segments, 0);
    }

    #[test]
    fn insert_job_replace_upserts_an_existing_row() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("aaaa", "pending")).expect("insert");
        insert_job(&db, &job("aaaa", "running")).expect("upsert");
        let row = get_job_by_id(&db, "aaaa")
            .expect("query")
            .expect("job exists");
        assert_eq!(row.status, "running");
    }

    #[test]
    fn update_job_status_to_complete_with_counts() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("bbbb", "running")).expect("insert");
        update_job_status(
            &db,
            "bbbb",
            "complete",
            JobStatusUpdate {
                total_segments: Some(100),
                completed_segments: Some(100),
                error: None,
            },
        )
        .expect("update");
        let row = get_job_by_id(&db, "bbbb")
            .expect("query")
            .expect("job exists");
        assert_eq!(row.status, "complete");
        assert_eq!(row.total_segments, Some(100));
        assert_eq!(row.completed_segments, 100);
    }

    #[test]
    fn update_job_status_to_error_with_message() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("cccc", "running")).expect("insert");
        update_job_status(
            &db,
            "cccc",
            "error",
            JobStatusUpdate {
                total_segments: None,
                completed_segments: None,
                error: Some("transcode failed"),
            },
        )
        .expect("update");
        let row = get_job_by_id(&db, "cccc")
            .expect("query")
            .expect("job exists");
        assert_eq!(row.status, "error");
        assert_eq!(row.error.as_deref(), Some("transcode failed"));
    }

    #[test]
    fn update_job_status_coalesces_existing_counts_when_omitted() {
        let db = fresh_db();
        seed_video_with_library(&db);
        let mut row = job("dddd", "running");
        row.completed_segments = 5;
        insert_job(&db, &row).expect("insert");
        update_job_status(&db, "dddd", "running", JobStatusUpdate::default()).expect("update");
        let after = get_job_by_id(&db, "dddd")
            .expect("query")
            .expect("job exists");
        // The COALESCE protects the prior value when the caller omits it.
        assert_eq!(after.completed_segments, 5);
    }

    #[test]
    fn update_job_status_bumps_updated_at() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("eeee", "running")).expect("insert");
        let before = get_job_by_id(&db, "eeee")
            .expect("q")
            .expect("e")
            .updated_at;
        // Sleep just enough for the millisecond resolution to tick.
        std::thread::sleep(std::time::Duration::from_millis(10));
        update_job_status(
            &db,
            "eeee",
            "running",
            JobStatusUpdate {
                total_segments: None,
                completed_segments: Some(1),
                error: None,
            },
        )
        .expect("update");
        let after = get_job_by_id(&db, "eeee")
            .expect("q")
            .expect("e")
            .updated_at;
        assert!(
            after > before,
            "updated_at must monotonically advance on each write — before={before}, after={after}"
        );
    }

    #[test]
    fn get_interrupted_jobs_filters_to_running_only() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("rr1", "running")).expect("insert");
        insert_job(&db, &job("rr2", "running")).expect("insert");
        insert_job(&db, &job("rr3", "complete")).expect("insert");
        insert_job(&db, &job("rr4", "pending")).expect("insert");
        let ids: Vec<String> = get_interrupted_jobs(&db)
            .expect("query")
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert!(ids.contains(&"rr1".to_string()));
        assert!(ids.contains(&"rr2".to_string()));
        assert!(!ids.contains(&"rr3".to_string()));
        assert!(!ids.contains(&"rr4".to_string()));
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
        let row = TranscodeJobRow {
            id: "full1".to_string(),
            video_id: "vvvv".to_string(),
            resolution: "4k".to_string(),
            status: "complete".to_string(),
            segment_dir: "/tmp/full1".to_string(),
            total_segments: Some(42),
            completed_segments: 42,
            start_time_seconds: Some(10.5),
            end_time_seconds: Some(20.0),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            error: None,
        };
        insert_job(&db, &row).expect("insert");
        let read = get_job_by_id(&db, "full1")
            .expect("query")
            .expect("job exists");
        assert_eq!(read.resolution, "4k");
        assert_eq!(read.status, "complete");
        assert_eq!(read.total_segments, Some(42));
        assert_eq!(read.completed_segments, 42);
        assert_eq!(read.start_time_seconds, Some(10.5));
        assert_eq!(read.end_time_seconds, Some(20.0));
    }

    #[test]
    fn delete_job_by_id_returns_true_when_row_existed() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("doomed", "complete")).expect("insert");
        assert!(delete_job_by_id(&db, "doomed").expect("delete"));
        assert!(get_job_by_id(&db, "doomed").expect("query").is_none());
    }

    #[test]
    fn delete_job_by_id_returns_false_when_row_did_not_exist() {
        let db = fresh_db();
        assert!(!delete_job_by_id(&db, "no-such-job").expect("delete"));
    }

    #[test]
    fn mark_job_evicted_sets_error_and_evicted_marker() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("evict1", "complete")).expect("insert");
        mark_job_evicted(&db, "evict1").expect("mark evicted");
        let row = get_job_by_id(&db, "evict1")
            .expect("query")
            .expect("job exists");
        assert_eq!(row.status, "error");
        assert_eq!(row.error.as_deref(), Some("evicted"));
    }

    #[test]
    fn get_lru_jobs_returns_only_complete_jobs_oldest_first() {
        let db = fresh_db();
        seed_video_with_library(&db);
        // Three completed jobs in a known temporal order — `updated_at`
        // monotonicity is the load-bearing assertion (LRU eviction depends
        // on it), so we step it explicitly here.
        let mut a = job("a-old", "complete");
        a.updated_at = "2026-01-01T00:00:00.000Z".to_string();
        let mut b = job("b-mid", "complete");
        b.updated_at = "2026-01-02T00:00:00.000Z".to_string();
        let mut c_row = job("c-new", "complete");
        c_row.updated_at = "2026-01-03T00:00:00.000Z".to_string();
        let mut running = job("running1", "running");
        running.updated_at = "2026-01-04T00:00:00.000Z".to_string();

        insert_job(&db, &a).expect("a");
        insert_job(&db, &b).expect("b");
        insert_job(&db, &c_row).expect("c");
        insert_job(&db, &running).expect("running");

        let lru = get_lru_jobs(&db).expect("query");
        let ids: Vec<String> = lru.iter().map(|r| r.job.id.clone()).collect();
        assert_eq!(ids, vec!["a-old", "b-mid", "c-new"]);
        // Running jobs are excluded from the eviction set.
        assert!(!ids.contains(&"running1".to_string()));
    }

    #[test]
    fn get_lru_jobs_sums_segment_size_per_job() {
        let db = fresh_db();
        seed_video_with_library(&db);
        insert_job(&db, &job("withsize", "complete")).expect("job");
        // Bypass `insert_segment` (defined in segments.rs) so this file's
        // tests stay self-contained — segment SQL is asserted there.
        db.with(|c| {
            c.execute(
                "INSERT INTO segments (job_id, segment_index, path, duration_seconds, size_bytes)
                 VALUES ('withsize', 0, '/tmp/withsize/0.m4s', 2.0, 100)",
                [],
            )?;
            c.execute(
                "INSERT INTO segments (job_id, segment_index, path, duration_seconds, size_bytes)
                 VALUES ('withsize', 1, '/tmp/withsize/1.m4s', 2.0, 250)",
                [],
            )?;
            Ok(())
        })
        .expect("seed segments");
        let lru = get_lru_jobs(&db).expect("query");
        let withsize = lru.iter().find(|r| r.job.id == "withsize").expect("found");
        assert_eq!(withsize.total_size_bytes, 350);
    }
}
