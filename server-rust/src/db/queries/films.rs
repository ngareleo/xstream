//! Film queries — logical movie entities owning one or more `videos`
//! file rows. See `docs/architecture/Library-Scan/01-Filename-Conventions.md`
//! for the dedup contract and `docs/server/DB-Schema/` for the table layout.

use rusqlite::{params, params_from_iter, OptionalExtension, Row, ToSql};

use crate::db::{sha1_hex, Db};
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct FilmRow {
    pub id: String,
    pub imdb_id: Option<String>,
    pub parsed_title_key: Option<String>,
    pub title: String,
    pub year: Option<i32>,
    pub created_at: String,
}

impl FilmRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            imdb_id: r.get("imdb_id")?,
            parsed_title_key: r.get("parsed_title_key")?,
            title: r.get("title")?,
            year: r.get("year")?,
            created_at: r.get("created_at")?,
        })
    }
}

/// Build the canonical Film id from its dedup keys. Prefer `imdb_id` when
/// present (canonical), fall back to `parsed_title_key`. The id is stable
/// across re-scans because both inputs are deterministic.
pub fn film_id_for(imdb_id: Option<&str>, parsed_title_key: Option<&str>) -> String {
    let basis = imdb_id.or(parsed_title_key).unwrap_or("");
    sha1_hex(&format!("film:{basis}"))
}

/// Build the parsed-title-key string from a `(title, year)` pair —
/// lowercased, whitespace-collapsed, joined by `|`. Year-less titles still
/// produce a key (the year part is empty).
pub fn build_parsed_title_key(title: &str, year: Option<i32>) -> String {
    let normalised: String = title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    match year {
        Some(y) => format!("{normalised}|{y}"),
        None => format!("{normalised}|"),
    }
}

pub fn get_film_by_id(db: &Db, id: &str) -> DbResult<Option<FilmRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM films WHERE id = ?1",
                params![id],
                FilmRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn find_film_by_imdb_id(db: &Db, imdb_id: &str) -> DbResult<Option<FilmRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM films WHERE imdb_id = ?1",
                params![imdb_id],
                FilmRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn find_film_by_parsed_title_key(db: &Db, key: &str) -> DbResult<Option<FilmRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM films WHERE parsed_title_key = ?1",
                params![key],
                FilmRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

/// Insert-or-update a film row. The id is computed from the dedup keys —
/// upsert by id, then update the secondary key + display fields if the
/// caller learned more (e.g. OMDb match landed after the initial insert).
pub fn upsert_film(db: &Db, row: &FilmRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO films
                 (id, imdb_id, parsed_title_key, title, year, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(id) DO UPDATE SET
                 imdb_id          = COALESCE(excluded.imdb_id, imdb_id),
                 parsed_title_key = COALESCE(excluded.parsed_title_key, parsed_title_key),
                 title            = excluded.title,
                 year             = COALESCE(excluded.year, year)"#,
            params![
                row.id,
                row.imdb_id,
                row.parsed_title_key,
                row.title,
                row.year,
                row.created_at,
            ],
        )?;
        Ok(())
    })
}

/// Set `videos.film_id` (and optionally `videos.role`) for one video. The
/// scanner calls this once a Film has been resolved or created for the
/// containing MovieUnit.
pub fn assign_video_to_film(db: &Db, video_id: &str, film_id: &str, role: &str) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "UPDATE videos SET film_id = ?2, role = ?3 WHERE id = ?1",
            params![video_id, film_id, role],
        )?;
        Ok(())
    })
}

#[derive(Default, Clone, Debug)]
pub struct FilmsFilter {
    pub library_id: Option<String>,
    pub search: Option<String>,
}

pub fn list_films(db: &Db, limit: i64, filter: FilmsFilter) -> DbResult<Vec<FilmRow>> {
    let mut sql = String::from("SELECT DISTINCT f.* FROM films f");
    let mut clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if filter.library_id.is_some() {
        sql.push_str(" JOIN videos v ON v.film_id = f.id");
    }
    if let Some(lib) = filter.library_id {
        clauses.push(format!("v.library_id = ?{}", vals.len() + 1));
        vals.push(Box::new(lib));
    }
    if let Some(s) = filter.search {
        clauses.push(format!("f.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(&format!(
        " ORDER BY f.title, f.year LIMIT ?{}",
        vals.len() + 1
    ));
    vals.push(Box::new(limit));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(refs), FilmRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn count_films(db: &Db, filter: FilmsFilter) -> DbResult<i64> {
    let mut sql = String::from("SELECT COUNT(DISTINCT f.id) FROM films f");
    let mut clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if filter.library_id.is_some() {
        sql.push_str(" JOIN videos v ON v.film_id = f.id");
    }
    if let Some(lib) = filter.library_id {
        clauses.push(format!("v.library_id = ?{}", vals.len() + 1));
        vals.push(Box::new(lib));
    }
    if let Some(s) = filter.search {
        clauses.push(format!("f.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{s}%")));
    }
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let count = c.query_row(&sql, params_from_iter(refs), |r| r.get::<_, i64>(0))?;
        Ok(count)
    })
}

/// Repoint every `videos.film_id` from `from_film_id` to `to_film_id`,
/// then delete the now-empty source film. Used when post-scan OMDb match
/// reveals two films are the same logical movie.
pub fn merge_films(db: &Db, from_film_id: &str, to_film_id: &str) -> DbResult<()> {
    if from_film_id == to_film_id {
        return Ok(());
    }
    db.with(|c| {
        c.execute(
            "UPDATE videos SET film_id = ?2 WHERE film_id = ?1",
            params![from_film_id, to_film_id],
        )?;
        c.execute("DELETE FROM films WHERE id = ?1", params![from_film_id])?;
        Ok(())
    })
}

// ── Tests ────────────────────────────────────────────────────────────────────

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
                 VALUES (?1, 'Test', ?2, 'movies', 'dev', '[]')",
                params![library_id, format!("/{library_id}")],
            )?;
            Ok(())
        })
        .expect("seed library");
    }

    fn seed_video(db: &Db, library_id: &str, video_id: &str) {
        db.with(|c| {
            c.execute(
                "INSERT INTO videos
                 (id, library_id, path, filename, title, duration_seconds,
                  file_size_bytes, bitrate, scanned_at, content_fingerprint)
                 VALUES (?1, ?2, ?3, ?4, NULL, 60, 1000, 1000,
                         '2026-01-01T00:00:00.000Z', '1000:abc')",
                params![
                    video_id,
                    library_id,
                    format!("/v/{video_id}.mkv"),
                    format!("{video_id}.mkv"),
                ],
            )?;
            Ok(())
        })
        .expect("seed video");
    }

    fn fixture_film(id: &str, imdb: Option<&str>, key: Option<&str>, title: &str) -> FilmRow {
        FilmRow {
            id: id.to_string(),
            imdb_id: imdb.map(str::to_string),
            parsed_title_key: key.map(str::to_string),
            title: title.to_string(),
            year: Some(2020),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn film_id_for_prefers_imdb_id_over_parsed_key() {
        let with_imdb = film_id_for(Some("tt1"), Some("ignored|2020"));
        let with_key = film_id_for(None, Some("matrix|1999"));
        assert_ne!(with_imdb, with_key);
        // Same imdb_id always gives the same id, regardless of the parsed key.
        assert_eq!(
            film_id_for(Some("tt1"), Some("a|2020")),
            film_id_for(Some("tt1"), Some("b|2020"))
        );
    }

    #[test]
    fn build_parsed_title_key_normalises_whitespace_and_case() {
        let a = build_parsed_title_key("The   Matrix", Some(1999));
        let b = build_parsed_title_key("the matrix", Some(1999));
        assert_eq!(a, b);
        assert_eq!(a, "the matrix|1999");
    }

    #[test]
    fn build_parsed_title_key_handles_missing_year() {
        let key = build_parsed_title_key("Untitled", None);
        assert_eq!(key, "untitled|");
    }

    #[test]
    fn upsert_and_get_round_trip() {
        let db = fresh_db();
        let film = fixture_film("f1", Some("tt1"), Some("matrix|1999"), "The Matrix");
        upsert_film(&db, &film).expect("upsert");
        let got = get_film_by_id(&db, "f1").expect("get").expect("exists");
        assert_eq!(got.imdb_id.as_deref(), Some("tt1"));
        assert_eq!(got.title, "The Matrix");
    }

    #[test]
    fn upsert_film_keeps_existing_imdb_when_excluded_is_null() {
        // Scanner first creates a Film keyed only by parsed_title_key (no
        // OMDb match yet). Later, OMDb fills in imdb_id. A second
        // unmatched insert (via a re-scan before the OMDb sweep) MUST NOT
        // null out the imdb_id — COALESCE in the upsert protects this.
        let db = fresh_db();
        upsert_film(
            &db,
            &fixture_film("f1", Some("tt1"), Some("matrix|1999"), "The Matrix"),
        )
        .expect("first insert");
        upsert_film(
            &db,
            &fixture_film("f1", None, Some("matrix|1999"), "The Matrix"),
        )
        .expect("re-upsert without imdb");
        let got = get_film_by_id(&db, "f1").expect("get").expect("exists");
        assert_eq!(got.imdb_id.as_deref(), Some("tt1"));
    }

    #[test]
    fn find_by_imdb_returns_none_for_unknown() {
        let db = fresh_db();
        assert!(find_film_by_imdb_id(&db, "tt-nope")
            .expect("query")
            .is_none());
    }

    #[test]
    fn find_by_parsed_title_key_finds_unmatched_film() {
        let db = fresh_db();
        let film = fixture_film("f1", None, Some("inception|2010"), "Inception");
        upsert_film(&db, &film).expect("upsert");
        let got = find_film_by_parsed_title_key(&db, "inception|2010")
            .expect("query")
            .expect("exists");
        assert_eq!(got.id, "f1");
    }

    #[test]
    fn assign_video_to_film_sets_film_id_and_role() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "v1");
        upsert_film(&db, &fixture_film("f1", None, Some("test|2020"), "Test"))
            .expect("upsert film");
        assign_video_to_film(&db, "v1", "f1", "main").expect("assign");
        let got: (Option<String>, String) = db
            .with(|c| {
                Ok(c.query_row(
                    "SELECT film_id, role FROM videos WHERE id = 'v1'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )?)
            })
            .expect("read back");
        assert_eq!(got.0.as_deref(), Some("f1"));
        assert_eq!(got.1, "main");
    }

    #[test]
    fn list_films_orders_by_title_then_year() {
        let db = fresh_db();
        let mut a = fixture_film("a", None, Some("alpha|2020"), "Alpha");
        a.year = Some(2020);
        let mut b = fixture_film("b", None, Some("beta|2019"), "Beta");
        b.year = Some(2019);
        upsert_film(&db, &a).expect("a");
        upsert_film(&db, &b).expect("b");
        let films = list_films(&db, 10, FilmsFilter::default()).expect("list");
        let titles: Vec<&str> = films.iter().map(|f| f.title.as_str()).collect();
        assert_eq!(titles, vec!["Alpha", "Beta"]);
    }

    #[test]
    fn list_films_filters_by_library() {
        let db = fresh_db();
        seed_library(&db, "libA");
        seed_library(&db, "libB");
        seed_video(&db, "libA", "vA");
        seed_video(&db, "libB", "vB");
        upsert_film(&db, &fixture_film("fA", None, Some("a|2020"), "A")).expect("a");
        upsert_film(&db, &fixture_film("fB", None, Some("b|2020"), "B")).expect("b");
        assign_video_to_film(&db, "vA", "fA", "main").expect("assign A");
        assign_video_to_film(&db, "vB", "fB", "main").expect("assign B");
        let films = list_films(
            &db,
            10,
            FilmsFilter {
                library_id: Some("libA".into()),
                ..Default::default()
            },
        )
        .expect("list");
        assert_eq!(films.len(), 1);
        assert_eq!(films[0].id, "fA");
    }

    #[test]
    fn merge_films_basic_two_film_case() {
        let db = fresh_db();
        seed_library(&db, "lib1");
        seed_video(&db, "lib1", "v1");
        seed_video(&db, "lib1", "v2");
        upsert_film(
            &db,
            &fixture_film("f-canonical", Some("tt1"), Some("a|2020"), "A"),
        )
        .expect("canonical");
        upsert_film(&db, &fixture_film("f-dup", None, Some("a-dup|2020"), "A")).expect("dup");
        assign_video_to_film(&db, "v1", "f-canonical", "main").expect("v1");
        assign_video_to_film(&db, "v2", "f-dup", "main").expect("v2");
        merge_films(&db, "f-dup", "f-canonical").expect("merge");
        // f-dup gone.
        assert!(get_film_by_id(&db, "f-dup").expect("query").is_none());
        // v2 now points at f-canonical.
        let got: Option<String> = db
            .with(|c| {
                Ok(
                    c.query_row("SELECT film_id FROM videos WHERE id = 'v2'", [], |r| {
                        r.get::<_, Option<String>>(0)
                    })?,
                )
            })
            .expect("read");
        assert_eq!(got.as_deref(), Some("f-canonical"));
    }

    #[test]
    fn merge_films_noop_when_source_equals_target() {
        let db = fresh_db();
        upsert_film(&db, &fixture_film("f1", None, Some("k|2020"), "F")).expect("upsert");
        merge_films(&db, "f1", "f1").expect("noop merge");
        assert!(get_film_by_id(&db, "f1").expect("get").is_some());
    }

    #[test]
    fn count_films_zero_for_empty_db() {
        let db = fresh_db();
        assert_eq!(count_films(&db, FilmsFilter::default()).expect("count"), 0);
    }
}
