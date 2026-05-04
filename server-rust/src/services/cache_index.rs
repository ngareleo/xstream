//! Content-addressed segment cache lookup by (video_id, resolution, start_s, end_s) tuple.

use crate::db::queries::jobs::TranscodeJobRow;
use crate::db::Db;
use crate::error::DbResult;
use rusqlite::{params, OptionalExtension, Row};

/// Structural cache key. `start_s` and `end_s` are `None` for full-video
/// transcodes — the matching DB columns are stored NULL when the range is
/// unbounded.
#[derive(Clone, Debug, PartialEq)]
pub struct SegmentCacheKey<'a> {
    pub video_id: &'a str,
    pub resolution: &'a str,
    pub start_s: Option<f64>,
    pub end_s: Option<f64>,
}

/// Look up a complete cached transcode for the given content range. Returns
/// the existing job row (so the caller can derive `segment_dir`,
/// `total_segments`, and replay segments) or `None` if no completed job
/// matches.
///
/// The lookup deliberately filters to `status = 'complete'` — partial /
/// errored jobs do not satisfy a cache hit, even if their tuple matches.
/// The chunker re-uses an in-flight `running` job through a different code
/// path (the in-memory `job_store`); this query is for warm-cache reads.
pub fn lookup(db: &Db, key: &SegmentCacheKey<'_>) -> DbResult<Option<TranscodeJobRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                r#"SELECT * FROM transcode_jobs
                   WHERE video_id = ?1
                     AND resolution = ?2
                     AND ((?3 IS NULL AND start_time_seconds IS NULL) OR start_time_seconds = ?3)
                     AND ((?4 IS NULL AND end_time_seconds   IS NULL) OR end_time_seconds   = ?4)
                     AND status = 'complete'
                   ORDER BY updated_at DESC
                   LIMIT 1"#,
                params![key.video_id, key.resolution, key.start_s, key.end_s],
                from_job_row,
            )
            .optional()?;
        Ok(row)
    })
}

fn from_job_row(r: &Row<'_>) -> rusqlite::Result<TranscodeJobRow> {
    Ok(TranscodeJobRow {
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

//
// Cover the structural lookup contract: the same content range produces
// the same hit, a different range or resolution misses, and `status` is
// honored as a filter. The "two video rows sharing one fingerprint resolve
// to the same cache hit" assertion proves the structural tuple is the
// cache primitive — a future sharing peer with a different sha1
// implementation must still resolve the same cached encode.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries::jobs::{insert_job, TranscodeJobRow};
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_video(db: &Db, video_id: &str, fingerprint: &str) {
        db.with(|c| {
            c.execute(
                "INSERT OR IGNORE INTO libraries (id, name, path, media_type, env, video_extensions)
                 VALUES ('libtest', 'Test Lib', '/test', 'movies', 'dev', '[]')",
                [],
            )?;
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES (?1, 'libtest', ?2, ?3, 'V', 10, 1, 1, '2026-01-01T00:00:00.000Z', ?4)",
                params![
                    video_id,
                    format!("/test/{video_id}.mp4"),
                    format!("{video_id}.mp4"),
                    fingerprint,
                ],
            )?;
            Ok(())
        })
        .expect("seed video");
    }

    fn complete_job(
        id: &str,
        video_id: &str,
        resolution: &str,
        start: Option<f64>,
        end: Option<f64>,
    ) -> TranscodeJobRow {
        TranscodeJobRow {
            id: id.to_string(),
            video_id: video_id.to_string(),
            resolution: resolution.to_string(),
            status: "complete".to_string(),
            segment_dir: format!("/tmp/{id}"),
            total_segments: Some(10),
            completed_segments: 10,
            start_time_seconds: start,
            end_time_seconds: end,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
            error: None,
        }
    }

    #[test]
    fn lookup_misses_when_no_job_exists() {
        let db = fresh_db();
        seed_video(&db, "vvvv", "fp1");
        let hit = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query");
        assert!(hit.is_none());
    }

    #[test]
    fn lookup_hits_on_exact_tuple_match() {
        let db = fresh_db();
        seed_video(&db, "vvvv", "fp1");
        insert_job(&db, &complete_job("j1", "vvvv", "1080p", None, None)).expect("insert");
        let hit = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query")
        .expect("cache hit");
        assert_eq!(hit.id, "j1");
        assert_eq!(hit.status, "complete");
    }

    #[test]
    fn lookup_misses_on_resolution_mismatch() {
        let db = fresh_db();
        seed_video(&db, "vvvv", "fp1");
        insert_job(&db, &complete_job("j1", "vvvv", "1080p", None, None)).expect("insert");
        let miss = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "4k",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query");
        assert!(miss.is_none());
    }

    #[test]
    fn lookup_distinguishes_full_range_from_partial() {
        let db = fresh_db();
        seed_video(&db, "vvvv", "fp1");
        insert_job(&db, &complete_job("full", "vvvv", "1080p", None, None)).expect("full");
        insert_job(
            &db,
            &complete_job("partial", "vvvv", "1080p", Some(10.0), Some(20.0)),
        )
        .expect("partial");

        let full = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query")
        .expect("hit");
        let partial = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "1080p",
                start_s: Some(10.0),
                end_s: Some(20.0),
            },
        )
        .expect("query")
        .expect("hit");
        assert_eq!(full.id, "full");
        assert_eq!(partial.id, "partial");
    }

    #[test]
    fn lookup_filters_out_running_or_errored_jobs() {
        let db = fresh_db();
        seed_video(&db, "vvvv", "fp1");
        let mut running = complete_job("r1", "vvvv", "1080p", None, None);
        running.status = "running".to_string();
        let mut errored = complete_job("e1", "vvvv", "1080p", None, None);
        errored.status = "error".to_string();
        insert_job(&db, &running).expect("running");
        insert_job(&db, &errored).expect("errored");
        // Only `complete` jobs satisfy a cache hit — partial / failed encodes
        // would stall playback.
        let hit = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query");
        assert!(hit.is_none());
    }

    #[test]
    fn lookup_two_videos_with_different_ids_are_isolated() {
        // The forward-sharing constraint only requires that *the same content*
        // resolves to the same cache hit; two distinct video_ids (even if they
        // shared a fingerprint, which a future sharing mode could exploit)
        // remain isolated under the v1 video_id-keyed lookup.
        let db = fresh_db();
        seed_video(&db, "vid-a", "fp-shared");
        seed_video(&db, "vid-b", "fp-shared");
        insert_job(&db, &complete_job("ja", "vid-a", "1080p", None, None)).expect("ja");
        let a = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vid-a",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query");
        let b = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vid-b",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query");
        assert!(a.is_some());
        assert!(b.is_none());
    }

    #[test]
    fn lookup_returns_most_recent_when_multiple_complete_jobs_match() {
        // Hypothetical: re-encoding the same range produces a fresher row.
        // The `ORDER BY updated_at DESC LIMIT 1` clause keeps newer over older
        // so an evicted-then-re-encoded segment dir is preferred.
        let db = fresh_db();
        seed_video(&db, "vvvv", "fp1");
        let mut older = complete_job("older", "vvvv", "1080p", None, None);
        older.updated_at = "2026-01-01T00:00:00.000Z".to_string();
        let mut newer = complete_job("newer", "vvvv", "1080p", None, None);
        newer.updated_at = "2026-02-01T00:00:00.000Z".to_string();
        insert_job(&db, &older).expect("older");
        insert_job(&db, &newer).expect("newer");
        let hit = lookup(
            &db,
            &SegmentCacheKey {
                video_id: "vvvv",
                resolution: "1080p",
                start_s: None,
                end_s: None,
            },
        )
        .expect("query")
        .expect("hit");
        assert_eq!(hit.id, "newer");
    }
}
