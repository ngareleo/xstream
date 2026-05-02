//! OMDb match metadata.

use rusqlite::{params, OptionalExtension, Row};

use crate::db::Db;
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct VideoMetadataRow {
    pub video_id: String,
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub cast_list: Option<String>, // JSON-encoded string array
    pub rating: Option<f64>,
    pub plot: Option<String>,
    pub poster_url: Option<String>,
    pub matched_at: String,
}

impl VideoMetadataRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            video_id: r.get("video_id")?,
            imdb_id: r.get("imdb_id")?,
            title: r.get("title")?,
            year: r.get("year")?,
            genre: r.get("genre")?,
            director: r.get("director")?,
            cast_list: r.get("cast_list")?,
            rating: r.get("rating")?,
            plot: r.get("plot")?,
            poster_url: r.get("poster_url")?,
            matched_at: r.get("matched_at")?,
        })
    }
}

pub fn get_metadata_by_video_id(db: &Db, video_id: &str) -> DbResult<Option<VideoMetadataRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM video_metadata WHERE video_id = ?1",
                params![video_id],
                VideoMetadataRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn has_video_metadata(db: &Db, video_id: &str) -> DbResult<bool> {
    db.with(|c| {
        let exists: Option<i64> = c
            .query_row(
                "SELECT 1 FROM video_metadata WHERE video_id = ?1 LIMIT 1",
                params![video_id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(exists.is_some())
    })
}

pub fn count_matched_by_library(db: &Db, library_id: &str) -> DbResult<(i64, i64)> {
    db.with(|c| {
        let pair = c.query_row(
            r#"SELECT COUNT(m.video_id) AS matched,
                      COUNT(v.id) - COUNT(m.video_id) AS unmatched
               FROM videos v LEFT JOIN video_metadata m ON v.id = m.video_id
               WHERE v.library_id = ?1"#,
            params![library_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
        )?;
        Ok(pair)
    })
}

pub fn upsert_video_metadata(db: &Db, row: &VideoMetadataRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO video_metadata
                 (video_id, imdb_id, title, year, genre, director, cast_list,
                  rating, plot, poster_url, matched_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
               ON CONFLICT(video_id) DO UPDATE SET
                 imdb_id    = excluded.imdb_id,
                 title      = excluded.title,
                 year       = excluded.year,
                 genre      = excluded.genre,
                 director   = excluded.director,
                 cast_list  = excluded.cast_list,
                 rating     = excluded.rating,
                 plot       = excluded.plot,
                 poster_url = excluded.poster_url,
                 matched_at = excluded.matched_at"#,
            params![
                row.video_id,
                row.imdb_id,
                row.title,
                row.year,
                row.genre,
                row.director,
                row.cast_list,
                row.rating,
                row.plot,
                row.poster_url,
                row.matched_at,
            ],
        )?;
        Ok(())
    })
}

/// Video IDs in `library_id` that have no `video_metadata` row yet. The
/// scanner's auto-match step uses this to feed OMDb only for unmatched
/// videos, so re-runs are idempotent (already-matched videos stay put).
pub fn get_unmatched_video_ids(db: &Db, library_id: &str) -> DbResult<Vec<String>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            r#"SELECT v.id FROM videos v
               LEFT JOIN video_metadata m ON v.id = m.video_id
               WHERE v.library_id = ?1 AND m.video_id IS NULL"#,
        )?;
        let rows = stmt.query_map(params![library_id], |r| r.get::<_, String>(0))?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn delete_video_metadata(db: &Db, video_id: &str) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "DELETE FROM video_metadata WHERE video_id = ?1",
            params![video_id],
        )?;
        Ok(())
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// The ON-CONFLICT upsert and the matched/unmatched aggregation are subtle
// enough to deserve explicit assertions — a wrong-direction merge or a
// regression in the GROUP BY would silently mis-count library-scan stats.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_library_and_videos(db: &Db, library_id: &str, video_ids: &[&str]) {
        db.with(|c| {
            c.execute(
                "INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
                 VALUES (?1, 'Test Lib', ?2, 'movies', 'dev', '[]')",
                params![library_id, format!("/{library_id}")],
            )?;
            for vid in video_ids {
                c.execute(
                    "INSERT INTO videos
                     (id, library_id, path, filename, title, duration_seconds,
                      file_size_bytes, bitrate, scanned_at, content_fingerprint)
                     VALUES (?1, ?2, ?3, ?4, NULL, 100.0, 1024, 5000,
                             '2026-01-01T00:00:00.000Z', '1024:abc')",
                    params![
                        vid,
                        library_id,
                        format!("/v/{vid}.mkv"),
                        format!("{vid}.mkv"),
                    ],
                )?;
            }
            Ok(())
        })
        .expect("seed library + videos");
    }

    fn metadata(video_id: &str, imdb_id: &str, title: &str) -> VideoMetadataRow {
        VideoMetadataRow {
            video_id: video_id.to_string(),
            imdb_id: imdb_id.to_string(),
            title: title.to_string(),
            year: Some(2024),
            genre: Some("Action".to_string()),
            director: Some("Someone".to_string()),
            cast_list: Some(r#"["A","B"]"#.to_string()),
            rating: Some(7.5),
            plot: Some("A plot.".to_string()),
            poster_url: Some("https://example.com/p.jpg".to_string()),
            matched_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn get_metadata_by_video_id_returns_none_when_unmatched() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        assert!(get_metadata_by_video_id(&db, "v1")
            .expect("query")
            .is_none());
    }

    #[test]
    fn upsert_video_metadata_round_trips_all_fields() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "Movie One")).expect("upsert");

        let row = get_metadata_by_video_id(&db, "v1")
            .expect("query")
            .expect("metadata exists");
        assert_eq!(row.imdb_id, "tt0001");
        assert_eq!(row.title, "Movie One");
        assert_eq!(row.year, Some(2024));
        assert_eq!(row.rating, Some(7.5));
        assert_eq!(row.cast_list.as_deref(), Some(r#"["A","B"]"#));
    }

    #[test]
    fn upsert_video_metadata_on_conflict_replaces_fields() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "Original")).expect("first");
        let mut updated = metadata("v1", "tt0002", "Updated");
        updated.year = Some(2025);
        upsert_video_metadata(&db, &updated).expect("second");

        let row = get_metadata_by_video_id(&db, "v1")
            .expect("query")
            .expect("exists");
        assert_eq!(row.imdb_id, "tt0002");
        assert_eq!(row.title, "Updated");
        assert_eq!(row.year, Some(2025));
    }

    #[test]
    fn has_video_metadata_reflects_presence() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        assert!(!has_video_metadata(&db, "v1").expect("absent"));
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "M")).expect("upsert");
        assert!(has_video_metadata(&db, "v1").expect("present"));
    }

    #[test]
    fn delete_video_metadata_removes_the_row() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "M")).expect("upsert");
        delete_video_metadata(&db, "v1").expect("delete");
        assert!(!has_video_metadata(&db, "v1").expect("absent"));
    }

    #[test]
    fn count_matched_by_library_partitions_videos() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1", "v2", "v3"]);
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "M1")).expect("m1");
        upsert_video_metadata(&db, &metadata("v2", "tt0002", "M2")).expect("m2");
        // v3 stays unmatched
        let (matched, unmatched) = count_matched_by_library(&db, "lib1").expect("count");
        assert_eq!(matched, 2);
        assert_eq!(unmatched, 1);
    }

    #[test]
    fn count_matched_by_library_returns_zero_for_empty_library() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &[]);
        let (matched, unmatched) = count_matched_by_library(&db, "lib1").expect("count");
        assert_eq!(matched, 0);
        assert_eq!(unmatched, 0);
    }

    #[test]
    fn get_unmatched_video_ids_returns_only_videos_without_metadata() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1", "v2", "v3"]);
        upsert_video_metadata(&db, &metadata("v2", "tt0002", "M2")).expect("match v2");
        let mut ids = get_unmatched_video_ids(&db, "lib1").expect("query");
        ids.sort();
        assert_eq!(ids, vec!["v1".to_string(), "v3".to_string()]);
    }

    #[test]
    fn get_unmatched_video_ids_empty_when_all_matched() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "M1")).expect("match v1");
        assert!(get_unmatched_video_ids(&db, "lib1")
            .expect("query")
            .is_empty());
    }

    #[test]
    fn get_unmatched_video_ids_does_not_leak_other_libraries() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        seed_library_and_videos(&db, "lib2", &["v2"]);
        // Only lib2's v2 is matched; lib1's v1 stays unmatched.
        upsert_video_metadata(&db, &metadata("v2", "tt0002", "M2")).expect("match v2");
        let lib1 = get_unmatched_video_ids(&db, "lib1").expect("lib1");
        let lib2 = get_unmatched_video_ids(&db, "lib2").expect("lib2");
        assert_eq!(lib1, vec!["v1".to_string()]);
        assert!(lib2.is_empty());
    }

    #[test]
    fn count_matched_by_library_only_sees_videos_in_that_library() {
        let db = fresh_db();
        seed_library_and_videos(&db, "lib1", &["v1"]);
        seed_library_and_videos(&db, "lib2", &["v2"]);
        upsert_video_metadata(&db, &metadata("v1", "tt0001", "M1")).expect("m1");
        upsert_video_metadata(&db, &metadata("v2", "tt0002", "M2")).expect("m2");
        let (m1_matched, m1_unmatched) = count_matched_by_library(&db, "lib1").expect("c1");
        assert_eq!(m1_matched, 1);
        assert_eq!(m1_unmatched, 0);
        let (m2_matched, m2_unmatched) = count_matched_by_library(&db, "lib2").expect("c2");
        assert_eq!(m2_matched, 1);
        assert_eq!(m2_unmatched, 0);
    }
}
