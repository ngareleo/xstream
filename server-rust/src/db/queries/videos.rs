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
