//! Video + video_streams queries + filter shapes.

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
    /// Native resolution rung as the internal lowercase string ("240p", "1080p", "4k").
    /// Null for rows scanned before the column existed and for synthetic show rows.
    /// The scanner derives this from the first video-stream height via
    /// `Resolution::from_height`; the GraphQL boundary maps it via `Resolution::from_internal`.
    pub native_resolution: Option<String>,
    /// Logical Film this video belongs to. Set for movie file rows by the
    /// scanner (after MovieUnit resolution + OMDb match). NULL for TV show
    /// parent rows, episode file rows, and unmatched movie rows.
    pub film_id: Option<String>,
    /// `'main'` (the canonical movie file in its folder) or `'extra'`
    /// (trailers, deleted scenes, behind-the-scenes living alongside).
    /// Defaults to `'main'`. Only meaningful when `film_id` is set.
    pub role: String,
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
            native_resolution: r.get("native_resolution")?,
            film_id: r.get("film_id")?,
            role: r.get("role")?,
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

/// Stream row shape for the scanner's `replace_video_streams`. The
/// `id` column is auto-assigned by SQLite on insert, so the new-row
/// shape omits it.
#[derive(Clone, Debug)]
pub struct NewVideoStream {
    pub video_id: String,
    pub stream_type: String,
    pub codec: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub fps: Option<f64>,
    pub channels: Option<i64>,
    pub sample_rate: Option<i64>,
}

/// Insert-or-update a video row keyed by `path`. The library scanner
/// calls this once per discovered file.
pub fn upsert_video(db: &Db, row: &VideoRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint,
                  native_resolution)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
               ON CONFLICT(path) DO UPDATE SET
                 library_id          = excluded.library_id,
                 filename            = excluded.filename,
                 title               = excluded.title,
                 duration_seconds    = excluded.duration_seconds,
                 file_size_bytes     = excluded.file_size_bytes,
                 bitrate             = excluded.bitrate,
                 scanned_at          = excluded.scanned_at,
                 content_fingerprint = excluded.content_fingerprint,
                 native_resolution   = COALESCE(excluded.native_resolution, native_resolution)"#,
            params![
                row.id,
                row.library_id,
                row.path,
                row.filename,
                row.title,
                row.duration_seconds,
                row.file_size_bytes,
                row.bitrate,
                row.scanned_at,
                row.content_fingerprint,
                row.native_resolution,
            ],
        )?;
        Ok(())
    })
}

/// Replace every stream row for `video_id` with the supplied list. The
/// scanner calls this once per file after a successful ffprobe — the
/// delete-then-insert means a re-probe overwrites stale streams cleanly.
pub fn replace_video_streams(db: &Db, video_id: &str, streams: &[NewVideoStream]) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "DELETE FROM video_streams WHERE video_id = ?1",
            params![video_id],
        )?;
        for s in streams {
            c.execute(
                r#"INSERT INTO video_streams
                     (video_id, stream_type, codec, width, height, fps,
                      channels, sample_rate)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
                params![
                    s.video_id,
                    s.stream_type,
                    s.codec,
                    s.width,
                    s.height,
                    s.fps,
                    s.channels,
                    s.sample_rate,
                ],
            )?;
        }
        Ok(())
    })
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

/// Fetch every `videos` row tied to a Film, regardless of role. The Film
/// type's `copies` resolver filters to `role='main'`; `extras` filters to
/// `role='extra'`. Order is: main first, then by resolution desc, then by
/// bitrate desc — same as the `bestCopy` heuristic.
pub fn get_videos_by_film_id(db: &Db, film_id: &str) -> DbResult<Vec<VideoRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            r#"SELECT v.* FROM videos v
                 WHERE v.film_id = ?1
                 ORDER BY
                   CASE v.role WHEN 'main' THEN 0 ELSE 1 END,
                   CASE v.native_resolution
                     WHEN '4k'   THEN 0
                     WHEN '1080p' THEN 1
                     WHEN '720p' THEN 2
                     WHEN '480p' THEN 3
                     WHEN '360p' THEN 4
                     WHEN '240p' THEN 5
                     ELSE 6
                   END,
                   v.bitrate DESC"#,
        )?;
        let rows = stmt.query_map(params![film_id], VideoRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
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
// Read-only coverage of the get/count helpers, plus write coverage for the
// scanner's upsert + replace-streams helpers.

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

    fn fixture_video(library_id: &str, video_id: &str, path: &str) -> VideoRow {
        VideoRow {
            id: video_id.to_string(),
            library_id: library_id.to_string(),
            path: path.to_string(),
            filename: "fixture.mkv".to_string(),
            title: Some("Fixture".to_string()),
            duration_seconds: 60.0,
            file_size_bytes: 1_000,
            bitrate: 100_000,
            scanned_at: "2026-01-01T00:00:00.000Z".to_string(),
            content_fingerprint: "1000:abc".to_string(),
            native_resolution: None,
            film_id: None,
            role: "main".to_string(),
        }
    }

    #[test]
    fn upsert_video_inserts_a_new_row() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        let row = fixture_video("lib1", "vid-new", "/v/new.mkv");
        upsert_video(&db, &row).expect("upsert");
        let fetched = get_video_by_id(&db, "vid-new")
            .expect("query")
            .expect("row exists");
        assert_eq!(fetched.path, "/v/new.mkv");
        assert_eq!(fetched.title.as_deref(), Some("Fixture"));
        assert_eq!(fetched.file_size_bytes, 1_000);
    }

    #[test]
    fn upsert_video_on_path_conflict_updates_mutable_fields() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        let mut first = fixture_video("lib1", "vid-A", "/v/same.mkv");
        first.title = Some("Original".to_string());
        upsert_video(&db, &first).expect("first insert");

        // Same path, different id and title — ON CONFLICT(path) wins.
        let mut second = fixture_video("lib1", "vid-A", "/v/same.mkv");
        second.title = Some("Updated".to_string());
        second.file_size_bytes = 9_999;
        upsert_video(&db, &second).expect("conflict update");

        let fetched = get_video_by_id(&db, "vid-A")
            .expect("query")
            .expect("row exists");
        assert_eq!(fetched.title.as_deref(), Some("Updated"));
        assert_eq!(fetched.file_size_bytes, 9_999);
    }

    #[test]
    fn upsert_video_on_path_conflict_overwrites_library_id() {
        // Edge case: a file is moved between libraries (rare, but the
        // path-keyed upsert must follow library_id like every other
        // mutable column — anything else would leave the row pointing at
        // the wrong library after a re-scan.
        let db = fresh_db();
        seed_library(&db, "lib-A");
        seed_library(&db, "lib-B");

        let mut row = fixture_video("lib-A", "vid-mover", "/v/shared.mkv");
        upsert_video(&db, &row).expect("first insert under lib-A");

        // Same path, but row now claims lib-B.
        row.library_id = "lib-B".to_string();
        upsert_video(&db, &row).expect("conflict update to lib-B");

        let fetched = get_video_by_id(&db, "vid-mover")
            .expect("query")
            .expect("row exists");
        assert_eq!(
            fetched.library_id, "lib-B",
            "upsert_video must follow library_id on ON CONFLICT(path)"
        );
    }

    #[test]
    fn upsert_video_propagates_fk_violation_when_library_missing() {
        // FK protection: scanner must not create orphaned video rows.
        let db = fresh_db();
        let row = fixture_video("no-such-lib", "vid-orphan", "/v/orphan.mkv");
        let result = upsert_video(&db, &row);
        assert!(
            result.is_err(),
            "FK violation must propagate when library_id is missing"
        );
    }

    fn new_stream(video_id: &str, kind: &str, codec: &str) -> NewVideoStream {
        NewVideoStream {
            video_id: video_id.to_string(),
            stream_type: kind.to_string(),
            codec: codec.to_string(),
            width: if kind == "video" { Some(1920) } else { None },
            height: if kind == "video" { Some(1080) } else { None },
            fps: if kind == "video" { Some(24.0) } else { None },
            channels: if kind == "audio" { Some(2) } else { None },
            sample_rate: if kind == "audio" { Some(48000) } else { None },
        }
    }

    #[test]
    fn replace_video_streams_inserts_each_stream() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid-streams", Some("Streamy"));
        replace_video_streams(
            &db,
            "vid-streams",
            &[
                new_stream("vid-streams", "video", "hevc"),
                new_stream("vid-streams", "audio", "aac"),
            ],
        )
        .expect("replace");
        let streams = get_streams_by_video_id(&db, "vid-streams").expect("query");
        assert_eq!(streams.len(), 2);
    }

    #[test]
    fn replace_video_streams_drops_old_rows_before_inserting() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid-x", Some("X"));
        // Initial: two streams via the seed helper.
        seed_streams(&db, "vid-x");
        assert_eq!(get_streams_by_video_id(&db, "vid-x").expect("q").len(), 2);

        // Replace with a single stream — old rows must be gone, only the
        // new one survives.
        replace_video_streams(&db, "vid-x", &[new_stream("vid-x", "video", "av1")])
            .expect("replace");
        let streams = get_streams_by_video_id(&db, "vid-x").expect("query");
        assert_eq!(streams.len(), 1);
        assert_eq!(streams[0].codec, "av1");
    }

    #[test]
    fn replace_video_streams_with_empty_slice_clears_existing_rows() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "vid-empty", Some("Empty"));
        seed_streams(&db, "vid-empty");
        replace_video_streams(&db, "vid-empty", &[]).expect("clear");
        assert!(get_streams_by_video_id(&db, "vid-empty")
            .expect("query")
            .is_empty());
    }
}
