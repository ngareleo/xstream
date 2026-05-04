//! OMDb match metadata for a logical Show. Mirrors `video_metadata.rs` (keyed on `show_id`).

use rusqlite::{params, OptionalExtension, Row};

use crate::db::Db;
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct ShowMetadataRow {
    pub show_id: String,
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub cast_list: Option<String>,
    pub rating: Option<f64>,
    pub plot: Option<String>,
    pub poster_url: Option<String>,
    /// Basename (e.g. `abc123…ef.jpg`) of the locally cached copy of
    /// `poster_url`. See `VideoMetadataRow::poster_local_path` for the
    /// full contract. Set by `services::poster_cache`.
    pub poster_local_path: Option<String>,
    pub matched_at: String,
}

impl ShowMetadataRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            show_id: r.get("show_id")?,
            imdb_id: r.get("imdb_id")?,
            title: r.get("title")?,
            year: r.get("year")?,
            genre: r.get("genre")?,
            director: r.get("director")?,
            cast_list: r.get("cast_list")?,
            rating: r.get("rating")?,
            plot: r.get("plot")?,
            poster_url: r.get("poster_url")?,
            poster_local_path: r.get("poster_local_path")?,
            matched_at: r.get("matched_at")?,
        })
    }
}

pub fn get_show_metadata(db: &Db, show_id: &str) -> DbResult<Option<ShowMetadataRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM show_metadata WHERE show_id = ?1",
                params![show_id],
                ShowMetadataRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn upsert_show_metadata(db: &Db, row: &ShowMetadataRow) -> DbResult<()> {
    db.with(|c| {
        // `poster_local_path` is preserved on conflict; see the matching
        // note in `video_metadata::upsert_video_metadata`.
        c.execute(
            r#"INSERT INTO show_metadata
                 (show_id, imdb_id, title, year, genre, director, cast_list,
                  rating, plot, poster_url, matched_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
               ON CONFLICT(show_id) DO UPDATE SET
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
                row.show_id,
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

/// Set `show_metadata.poster_local_path` after a successful download.
pub fn set_show_poster_local_path(db: &Db, show_id: &str, basename: &str) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "UPDATE show_metadata SET poster_local_path = ?2 WHERE show_id = ?1",
            params![show_id, basename],
        )?;
        Ok(())
    })
}

/// Pending-download list: show metadata rows where the OMDb URL is
/// known but the local cache has nothing.
pub fn list_shows_needing_poster_download(db: &Db) -> DbResult<Vec<(String, String)>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            r#"SELECT show_id, poster_url FROM show_metadata
                 WHERE poster_url IS NOT NULL
                   AND poster_url <> ''
                   AND (poster_local_path IS NULL OR poster_local_path = '')"#,
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries::shows::{upsert_show, ShowRow};
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_show(db: &Db, id: &str) {
        upsert_show(
            db,
            &ShowRow {
                id: id.to_string(),
                imdb_id: None,
                parsed_title_key: Some(format!("{id}|")),
                title: id.to_string(),
                year: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .expect("seed show");
    }

    fn fixture(show_id: &str) -> ShowMetadataRow {
        ShowMetadataRow {
            show_id: show_id.to_string(),
            imdb_id: "tt1".to_string(),
            title: "Show".to_string(),
            year: Some(2024),
            genre: Some("Drama".to_string()),
            director: None,
            cast_list: None,
            rating: Some(8.0),
            plot: Some("A plot.".to_string()),
            poster_url: Some("https://example.com/p.jpg".to_string()),
            poster_local_path: None,
            matched_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_and_get_round_trip() {
        let db = fresh_db();
        seed_show(&db, "s1");
        upsert_show_metadata(&db, &fixture("s1")).expect("upsert");
        let got = get_show_metadata(&db, "s1").expect("get").expect("exists");
        assert_eq!(got.imdb_id, "tt1");
        assert_eq!(got.title, "Show");
        assert_eq!(got.rating, Some(8.0));
    }

    #[test]
    fn upsert_on_conflict_replaces_fields() {
        let db = fresh_db();
        seed_show(&db, "s1");
        upsert_show_metadata(&db, &fixture("s1")).expect("first");
        let mut updated = fixture("s1");
        updated.title = "Updated".to_string();
        updated.rating = Some(9.5);
        upsert_show_metadata(&db, &updated).expect("second");
        let got = get_show_metadata(&db, "s1").expect("get").expect("exists");
        assert_eq!(got.title, "Updated");
        assert_eq!(got.rating, Some(9.5));
    }
}
