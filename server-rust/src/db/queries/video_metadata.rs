//! OMDb match metadata. Mirrors `server/src/db/queries/videoMetadata.ts`.

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

pub fn delete_video_metadata(db: &Db, video_id: &str) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "DELETE FROM video_metadata WHERE video_id = ?1",
            params![video_id],
        )?;
        Ok(())
    })
}
