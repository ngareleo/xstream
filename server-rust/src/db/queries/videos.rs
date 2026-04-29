//! Video + video_streams queries + filter shapes.
//! Mirrors `server/src/db/queries/videos.ts`.

use rusqlite::{params, params_from_iter, OptionalExtension, Row, ToSql};

use crate::db::Db;
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct VideoRow {
    pub id: String,
    pub library_id: String,
    pub path: String,
    pub filename: String,
    pub title: Option<String>,
    pub duration_seconds: f64,
    pub file_size_bytes: i64,
    pub bitrate: i64,
    pub scanned_at: String,
    pub content_fingerprint: String,
}

impl VideoRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            library_id: r.get("library_id")?,
            path: r.get("path")?,
            filename: r.get("filename")?,
            title: r.get("title")?,
            duration_seconds: r.get("duration_seconds")?,
            file_size_bytes: r.get("file_size_bytes")?,
            bitrate: r.get("bitrate")?,
            scanned_at: r.get("scanned_at")?,
            content_fingerprint: r.get("content_fingerprint")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct VideoStreamRow {
    pub id: i64,
    pub video_id: String,
    pub stream_type: String, // "video" | "audio"
    pub codec: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<f64>,
    pub channels: Option<i64>,
    pub sample_rate: Option<i64>,
}

impl VideoStreamRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            video_id: r.get("video_id")?,
            stream_type: r.get("stream_type")?,
            codec: r.get("codec")?,
            width: r.get("width")?,
            height: r.get("height")?,
            fps: r.get("fps")?,
            channels: r.get("channels")?,
            sample_rate: r.get("sample_rate")?,
        })
    }
}

#[derive(Default, Clone, Debug)]
pub struct VideoFilter {
    pub search: Option<String>,
    /// Internal media type: "movies" | "tvShows"
    pub media_type: Option<String>,
}

#[derive(Default, Clone, Debug)]
pub struct VideosFilter {
    pub library_id: Option<String>,
    pub search: Option<String>,
    pub media_type: Option<String>,
}

pub fn get_video_by_id(db: &Db, id: &str) -> DbResult<Option<VideoRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM videos WHERE id = ?1",
                params![id],
                VideoRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn get_videos(db: &Db, limit: i64, filter: VideosFilter) -> DbResult<Vec<VideoRow>> {
    let mut sql = String::from("SELECT v.* FROM videos v");
    let mut clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if let Some(lib) = filter.library_id {
        clauses.push(format!("v.library_id = ?{}", vals.len() + 1));
        vals.push(Box::new(lib));
    }
    if let Some(s) = filter.search {
        clauses.push(format!("v.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if let Some(mt) = filter.media_type {
        clauses.push(format!(
            "EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            vals.len() + 1
        ));
        vals.push(Box::new(mt));
    }
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(&format!(
        " ORDER BY v.title, v.filename LIMIT ?{}",
        vals.len() + 1
    ));
    vals.push(Box::new(limit));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(refs), VideoRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn get_videos_by_library(
    db: &Db,
    library_id: &str,
    limit: i64,
    offset: i64,
    filter: VideoFilter,
) -> DbResult<Vec<VideoRow>> {
    let mut sql = String::from("SELECT v.* FROM videos v WHERE v.library_id = ?1");
    let mut vals: Vec<Box<dyn ToSql>> = vec![Box::new(library_id.to_string())];
    if let Some(s) = filter.search {
        sql.push_str(&format!(" AND v.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if let Some(mt) = filter.media_type {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            vals.len() + 1
        ));
        vals.push(Box::new(mt));
    }
    sql.push_str(&format!(
        " ORDER BY v.title, v.filename LIMIT ?{} OFFSET ?{}",
        vals.len() + 1,
        vals.len() + 2
    ));
    vals.push(Box::new(limit));
    vals.push(Box::new(offset));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(refs), VideoRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn count_videos_by_library(db: &Db, library_id: &str, filter: VideoFilter) -> DbResult<i64> {
    let mut sql = String::from("SELECT COUNT(*) AS c FROM videos v WHERE v.library_id = ?1");
    let mut vals: Vec<Box<dyn ToSql>> = vec![Box::new(library_id.to_string())];
    if let Some(s) = filter.search {
        sql.push_str(&format!(" AND v.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if let Some(mt) = filter.media_type {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = ?{})",
            vals.len() + 1
        ));
        vals.push(Box::new(mt));
    }
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let count = c.query_row(&sql, params_from_iter(refs), |r| r.get::<_, i64>(0))?;
        Ok(count)
    })
}

pub fn sum_file_size_by_library(db: &Db, library_id: &str) -> DbResult<i64> {
    db.with(|c| {
        let total = c.query_row(
            "SELECT COALESCE(SUM(file_size_bytes), 0) FROM videos WHERE library_id = ?1",
            params![library_id],
            |r| r.get::<_, i64>(0),
        )?;
        Ok(total)
    })
}

pub fn get_streams_by_video_id(db: &Db, video_id: &str) -> DbResult<Vec<VideoStreamRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM video_streams WHERE video_id = ?1")?;
        let rows = stmt.query_map(params![video_id], VideoStreamRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Mirrors the read-only subset of `server/src/db/queries/__tests__/videos.test.ts`.
// Bun's tests cover writers (`upsertVideo`, `replaceVideoStreams`); the Rust
// port for Step 1 only needs reads (writes land with the scanner in Step 2),
// so write tests are intentionally skipped — reinstate them when the
// matching write functions are added.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_library(db: &Db, library_id: &str) {
        db.with(|c| {
            c.execute(
                "INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
                 VALUES (?1, ?2, ?3, ?4, ?5, '[]')",
                params![
                    library_id,
                    "Test Lib",
                    format!("/{library_id}"),
                    "movies",
                    "dev"
                ],
            )?;
            Ok(())
        })
        .expect("seed library");
    }

    fn seed_video(db: &Db, library_id: &str, video_id: &str, title: Option<&str>) {
        db.with(|c| {
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES (?1, ?2, ?3, ?4, ?5, 7200, 4000000000, 4000000,
                         '2026-01-01T00:00:00.000Z', '4000000000:abc')",
                params![
                    video_id,
                    library_id,
                    format!("/v/{video_id}.mkv"),
                    format!("{video_id}.mkv"),
                    title,
                ],
            )?;
            Ok(())
        })
        .expect("seed video");
    }

    fn seed_streams(db: &Db, video_id: &str) {
        db.with(|c| {
            c.execute(
                "INSERT INTO video_streams
                 (video_id, stream_type, codec, width, height, fps, channels, sample_rate)
                 VALUES (?1, 'video', 'hevc', 3840, 2160, 24.0, NULL, NULL),
                        (?1, 'audio', 'aac',  NULL, NULL, NULL, 2,    48000)",
                params![video_id],
            )?;
            Ok(())
        })
        .expect("seed streams");
    }

    #[test]
    fn get_video_by_id_returns_none_for_missing_video() {
        let db = fresh_db();
        assert!(get_video_by_id(&db, "no-such-video")
            .expect("query")
            .is_none());
    }

    #[test]
    fn get_video_by_id_round_trips_all_fields() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid-full", Some("Full Test"));
        let row = get_video_by_id(&db, "vid-full")
            .expect("query")
            .expect("video exists");
        assert_eq!(row.title.as_deref(), Some("Full Test"));
        assert_eq!(row.duration_seconds, 7200.0);
        assert_eq!(row.file_size_bytes, 4_000_000_000);
        assert_eq!(row.bitrate, 4_000_000);
        assert_eq!(row.library_id, "lib1");
    }

    #[test]
    fn get_video_by_id_handles_null_title() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid-null", None);
        let row = get_video_by_id(&db, "vid-null")
            .expect("query")
            .expect("video exists");
        assert!(row.title.is_none());
    }

    #[test]
    fn count_videos_by_library_returns_total() {
        let db = fresh_db();
        seed_library(&db, "libtest");
        for i in 1..=6 {
            seed_video(
                &db,
                "libtest",
                &format!("vid{i}"),
                Some(&format!("Movie {i}")),
            );
        }
        let n = count_videos_by_library(&db, "libtest", VideoFilter::default()).expect("count");
        assert_eq!(n, 6);
    }

    #[test]
    fn get_videos_by_library_returns_at_most_limit_rows() {
        let db = fresh_db();
        seed_library(&db, "libtest");
        for i in 1..=6 {
            seed_video(
                &db,
                "libtest",
                &format!("vid{i}"),
                Some(&format!("Movie {i}")),
            );
        }
        let rows =
            get_videos_by_library(&db, "libtest", 3, 0, VideoFilter::default()).expect("query");
        assert_eq!(rows.len(), 3);
    }

    #[test]
    fn get_videos_by_library_offset_skips_first_n_rows() {
        let db = fresh_db();
        seed_library(&db, "libtest");
        for i in 1..=6 {
            seed_video(
                &db,
                "libtest",
                &format!("vid{i}"),
                Some(&format!("Movie {i}")),
            );
        }
        let page1 =
            get_videos_by_library(&db, "libtest", 3, 0, VideoFilter::default()).expect("page1");
        let page2 =
            get_videos_by_library(&db, "libtest", 3, 3, VideoFilter::default()).expect("page2");
        let ids1: Vec<&str> = page1.iter().map(|r| r.id.as_str()).collect();
        let ids2: Vec<&str> = page2.iter().map(|r| r.id.as_str()).collect();
        for id in &ids2 {
            assert!(
                !ids1.contains(id),
                "page2 id {id} leaked into page1 — offset broken"
            );
        }
    }

    #[test]
    fn get_videos_by_library_returns_empty_for_unknown_library() {
        let db = fresh_db();
        let rows = get_videos_by_library(&db, "nonexistent", 10, 0, VideoFilter::default())
            .expect("query");
        assert!(rows.is_empty());
    }

    #[test]
    fn count_videos_by_library_returns_zero_for_unknown_library() {
        let db = fresh_db();
        let n = count_videos_by_library(&db, "nonexistent", VideoFilter::default()).expect("count");
        assert_eq!(n, 0);
    }

    #[test]
    fn sum_file_size_by_library_aggregates_across_videos() {
        let db = fresh_db();
        seed_library(&db, "libtest");
        seed_video(&db, "libtest", "v1", Some("One"));
        seed_video(&db, "libtest", "v2", Some("Two"));
        // Each seeded video has file_size_bytes = 4_000_000_000
        let total = sum_file_size_by_library(&db, "libtest").expect("sum");
        assert_eq!(total, 8_000_000_000);
    }

    #[test]
    fn get_streams_by_video_id_returns_video_and_audio_rows() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid1", Some("Test"));
        seed_streams(&db, "vid1");
        let streams = get_streams_by_video_id(&db, "vid1").expect("query");
        assert_eq!(streams.len(), 2);
        let video = streams
            .iter()
            .find(|s| s.stream_type == "video")
            .expect("video stream");
        let audio = streams
            .iter()
            .find(|s| s.stream_type == "audio")
            .expect("audio stream");
        assert_eq!(video.codec, "hevc");
        assert_eq!(video.width, Some(3840));
        assert_eq!(audio.codec, "aac");
        assert_eq!(audio.channels, Some(2));
    }

    #[test]
    fn get_streams_by_video_id_returns_empty_when_no_streams() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid-no-streams", Some("Streamless"));
        let streams = get_streams_by_video_id(&db, "vid-no-streams").expect("query");
        assert!(streams.is_empty());
    }
}
