//! Boot-time sweep: mark interrupted `running` jobs as `error` to trigger re-encode.

use tracing::info;

use crate::db::queries::jobs::{get_interrupted_jobs, update_job_status, JobStatusUpdate};
use crate::db::Db;
use crate::error::DbResult;

const RESTORE_ERROR_MESSAGE: &str =
    "Server restarted during transcode — will re-encode on next request";

/// Returns the number of rows that were transitioned `running` → `error`.
/// Used by the boot path for one structured log line, and by tests for
/// assertion.
pub fn sweep_interrupted(db: &Db) -> DbResult<usize> {
    let interrupted = get_interrupted_jobs(db)?;
    let count = interrupted.len();
    for job in &interrupted {
        update_job_status(
            db,
            &job.id,
            "error",
            JobStatusUpdate {
                total_segments: None,
                completed_segments: None,
                error: Some(RESTORE_ERROR_MESSAGE),
            },
        )?;
        info!(
            job_id = %job.id,
            video_id = %job.video_id,
            "Interrupted job marked as error — will re-encode on next request"
        );
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries::jobs::{get_job_by_id, insert_job, TranscodeJobRow};
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_video(db: &Db) {
        db.with(|c| {
            c.execute(
                "INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
                 VALUES ('libtest', 'Test', '/t', 'movies', 'dev', '[]')",
                [],
            )?;
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES ('vvvv', 'libtest', '/t/v.mp4', 'v.mp4', 'V', 10, 1, 1,
                         '2026-01-01T00:00:00.000Z', 'fp1')",
                [],
            )?;
            Ok(())
        })
        .expect("seed");
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
    fn sweep_marks_running_jobs_as_error() {
        let db = fresh_db();
        seed_video(&db);
        insert_job(&db, &job("r1", "running")).expect("r1");
        insert_job(&db, &job("r2", "running")).expect("r2");

        let n = sweep_interrupted(&db).expect("sweep");
        assert_eq!(n, 2);

        for id in ["r1", "r2"] {
            let row = get_job_by_id(&db, id).expect("query").expect("row exists");
            assert_eq!(row.status, "error");
            assert_eq!(row.error.as_deref(), Some(RESTORE_ERROR_MESSAGE));
        }
    }

    #[test]
    fn sweep_leaves_complete_and_pending_jobs_untouched() {
        let db = fresh_db();
        seed_video(&db);
        insert_job(&db, &job("c1", "complete")).expect("c1");
        insert_job(&db, &job("p1", "pending")).expect("p1");
        insert_job(&db, &job("e1", "error")).expect("e1");

        let n = sweep_interrupted(&db).expect("sweep");
        assert_eq!(n, 0);

        assert_eq!(
            get_job_by_id(&db, "c1").unwrap().unwrap().status,
            "complete"
        );
        assert_eq!(get_job_by_id(&db, "p1").unwrap().unwrap().status, "pending");
        assert_eq!(get_job_by_id(&db, "e1").unwrap().unwrap().status, "error");
    }

    #[test]
    fn sweep_is_idempotent() {
        let db = fresh_db();
        seed_video(&db);
        insert_job(&db, &job("r1", "running")).expect("r1");

        let n1 = sweep_interrupted(&db).expect("first sweep");
        let n2 = sweep_interrupted(&db).expect("second sweep");
        assert_eq!(n1, 1);
        // After the first sweep the row is `error`, so the second sweep finds
        // nothing to do — no double-write, no error.
        assert_eq!(n2, 0);
    }

    #[test]
    fn sweep_returns_zero_on_empty_db() {
        let db = fresh_db();
        let n = sweep_interrupted(&db).expect("sweep");
        assert_eq!(n, 0);
    }
}
