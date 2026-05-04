//! Show queries — logical TV-series entities owning seasons + episodes,
//! whose episode files live as `videos` rows linked by
//! `(show_id, show_season, show_episode)`.
//!
//! Mirrors `films.rs`. The dedup contract — `imdb_id` canonical with
//! `parsed_title_key` fallback — is identical: see
//! `docs/architecture/Library-Scan/03-Show-Entity.md`.

use rusqlite::{params, params_from_iter, OptionalExtension, Row, ToSql};

use crate::db::queries::films::build_parsed_title_key;
use crate::db::{sha1_hex, Db};
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct ShowRow {
    pub id: String,
    pub imdb_id: Option<String>,
    pub parsed_title_key: Option<String>,
    pub title: String,
    pub year: Option<i32>,
    pub created_at: String,
}

impl ShowRow {
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

/// Build the canonical Show id from its dedup keys. Prefer `imdb_id` when
/// present (canonical), fall back to `parsed_title_key`.
pub fn show_id_for(imdb_id: Option<&str>, parsed_title_key: Option<&str>) -> String {
    let basis = imdb_id.or(parsed_title_key).unwrap_or("");
    sha1_hex(&format!("show:{basis}"))
}

/// Re-export `build_parsed_title_key` from films — both entities share the
/// same normalisation so a film and a show with the same name+year can't
/// silently differ.
pub use crate::db::queries::films::build_parsed_title_key as build_show_parsed_title_key;

pub fn get_show_by_id(db: &Db, id: &str) -> DbResult<Option<ShowRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM shows WHERE id = ?1",
                params![id],
                ShowRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn find_show_by_imdb_id(db: &Db, imdb_id: &str) -> DbResult<Option<ShowRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM shows WHERE imdb_id = ?1",
                params![imdb_id],
                ShowRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn find_show_by_parsed_title_key(db: &Db, key: &str) -> DbResult<Option<ShowRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM shows WHERE parsed_title_key = ?1",
                params![key],
                ShowRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

pub fn upsert_show(db: &Db, row: &ShowRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO shows
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

#[derive(Default, Clone, Debug)]
pub struct ShowsFilter {
    pub library_id: Option<String>,
    pub search: Option<String>,
}

pub fn list_shows(db: &Db, limit: i64, filter: ShowsFilter) -> DbResult<Vec<ShowRow>> {
    let mut sql = String::from("SELECT DISTINCT s.* FROM shows s");
    let mut clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if filter.library_id.is_some() {
        sql.push_str(" JOIN videos v ON v.show_id = s.id");
    }
    if let Some(lib) = filter.library_id {
        clauses.push(format!("v.library_id = ?{}", vals.len() + 1));
        vals.push(Box::new(lib));
    }
    if let Some(q) = filter.search {
        clauses.push(format!("s.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{q}%")));
    }
    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(&format!(
        " ORDER BY s.title, s.year LIMIT ?{}",
        vals.len() + 1
    ));
    vals.push(Box::new(limit));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        let mut stmt = c.prepare(&sql)?;
        let rows = stmt.query_map(params_from_iter(refs), ShowRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn count_shows(db: &Db, filter: ShowsFilter) -> DbResult<i64> {
    let mut sql = String::from("SELECT COUNT(DISTINCT s.id) FROM shows s");
    let mut clauses: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if filter.library_id.is_some() {
        sql.push_str(" JOIN videos v ON v.show_id = s.id");
    }
    if let Some(lib) = filter.library_id {
        clauses.push(format!("v.library_id = ?{}", vals.len() + 1));
        vals.push(Box::new(lib));
    }
    if let Some(q) = filter.search {
        clauses.push(format!("s.title LIKE ?{}", vals.len() + 1));
        vals.push(Box::new(format!("%{q}%")));
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

/// Repoint every dependent row (videos, seasons, episodes, show_metadata)
/// from `from_show_id` to `to_show_id`, then delete the now-empty source
/// show. Used when a post-scan OMDb match reveals two shows are the same
/// logical series — typically because the parsed-title-key entry now
/// matches an existing imdb-keyed entry.
pub fn merge_shows(db: &Db, from_show_id: &str, to_show_id: &str) -> DbResult<()> {
    if from_show_id == to_show_id {
        return Ok(());
    }
    db.with(|c| {
        c.execute(
            "UPDATE videos SET show_id = ?2 WHERE show_id = ?1",
            params![from_show_id, to_show_id],
        )?;
        // Re-key seasons / episodes on the canonical show_id. INSERT OR
        // IGNORE handles the case where both shows happened to have rows
        // for the same season — we just keep the canonical one.
        c.execute(
            "INSERT OR IGNORE INTO seasons (show_id, season_number)
             SELECT ?2, season_number FROM seasons WHERE show_id = ?1",
            params![from_show_id, to_show_id],
        )?;
        c.execute(
            "DELETE FROM seasons WHERE show_id = ?1",
            params![from_show_id],
        )?;
        c.execute(
            "INSERT OR IGNORE INTO episodes (show_id, season_number, episode_number, title)
             SELECT ?2, season_number, episode_number, title
             FROM episodes WHERE show_id = ?1",
            params![from_show_id, to_show_id],
        )?;
        c.execute(
            "DELETE FROM episodes WHERE show_id = ?1",
            params![from_show_id],
        )?;
        // Show metadata: keep canonical's row if present, otherwise move
        // duplicate's row over.
        c.execute(
            "DELETE FROM show_metadata WHERE show_id = ?1
               AND EXISTS (SELECT 1 FROM show_metadata WHERE show_id = ?2)",
            params![from_show_id, to_show_id],
        )?;
        c.execute(
            "UPDATE show_metadata SET show_id = ?2 WHERE show_id = ?1",
            params![from_show_id, to_show_id],
        )?;
        c.execute("DELETE FROM shows WHERE id = ?1", params![from_show_id])?;
        Ok(())
    })
}

/// Stamp a Show with its OMDb `imdb_id` post-match. If another Show
/// already holds that `imdb_id`, merge `show_id` into the canonical row
/// and return the canonical id; otherwise update in place and return
/// `show_id` unchanged.
pub fn link_show_to_imdb(db: &Db, show_id: &str, imdb_id: &str) -> DbResult<String> {
    if let Some(existing) = find_show_by_imdb_id(db, imdb_id)? {
        if existing.id == show_id {
            return Ok(show_id.to_string());
        }
        merge_shows(db, show_id, &existing.id)?;
        // Make sure the canonical row has the imdb_id stamped (it should,
        // since we found it by imdb_id, but defensively re-set it).
        db.with(|c| {
            c.execute(
                "UPDATE shows SET imdb_id = ?2 WHERE id = ?1 AND imdb_id IS NULL",
                params![existing.id, imdb_id],
            )?;
            Ok(())
        })?;
        return Ok(existing.id);
    }
    db.with(|c| {
        c.execute(
            "UPDATE shows SET imdb_id = ?2 WHERE id = ?1",
            params![show_id, imdb_id],
        )?;
        Ok(())
    })?;
    Ok(show_id.to_string())
}

/// Resolve-or-create the Show for a freshly-scanned series directory.
/// Identity flow mirrors the Film resolver: lookup by parsed_title_key,
/// create one keyed only by parsed_title_key when missing. OMDb match
/// (and the imdb-id stamping that follows) lands in `link_show_to_imdb`.
pub fn resolve_show_for_directory(
    db: &Db,
    show_name: &str,
    now_rfc3339: &str,
) -> DbResult<ShowRow> {
    let key = build_parsed_title_key(show_name, None);
    if let Some(existing) = find_show_by_parsed_title_key(db, &key)? {
        return Ok(existing);
    }
    let id = show_id_for(None, Some(&key));
    let row = ShowRow {
        id: id.clone(),
        imdb_id: None,
        parsed_title_key: Some(key),
        title: show_name.to_string(),
        year: None,
        created_at: now_rfc3339.to_string(),
    };
    upsert_show(db, &row)?;
    Ok(row)
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn fixture_show(id: &str, imdb: Option<&str>, key: Option<&str>, title: &str) -> ShowRow {
        ShowRow {
            id: id.to_string(),
            imdb_id: imdb.map(str::to_string),
            parsed_title_key: key.map(str::to_string),
            title: title.to_string(),
            year: Some(2020),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn show_id_for_prefers_imdb_over_key() {
        assert_ne!(
            show_id_for(Some("tt1"), Some("k|2020")),
            show_id_for(None, Some("k|2020"))
        );
        assert_eq!(
            show_id_for(Some("tt1"), Some("a|2020")),
            show_id_for(Some("tt1"), Some("b|2020"))
        );
    }

    #[test]
    fn upsert_and_get_round_trip() {
        let db = fresh_db();
        upsert_show(
            &db,
            &fixture_show("s1", Some("tt1"), Some("k|2020"), "Show"),
        )
        .expect("upsert");
        let got = get_show_by_id(&db, "s1").expect("get").expect("exists");
        assert_eq!(got.imdb_id.as_deref(), Some("tt1"));
        assert_eq!(got.title, "Show");
    }

    #[test]
    fn upsert_show_keeps_existing_imdb_when_excluded_is_null() {
        let db = fresh_db();
        upsert_show(
            &db,
            &fixture_show("s1", Some("tt1"), Some("k|2020"), "Show"),
        )
        .expect("first");
        upsert_show(&db, &fixture_show("s1", None, Some("k|2020"), "Show")).expect("second");
        let got = get_show_by_id(&db, "s1").expect("get").expect("exists");
        assert_eq!(got.imdb_id.as_deref(), Some("tt1"));
    }

    #[test]
    fn resolve_show_for_directory_creates_when_absent_and_returns_existing_when_present() {
        let db = fresh_db();
        let a =
            resolve_show_for_directory(&db, "Breaking Bad", "2026-01-01T00:00:00.000Z").expect("a");
        let b =
            resolve_show_for_directory(&db, "Breaking Bad", "2026-01-01T00:00:00.000Z").expect("b");
        assert_eq!(a.id, b.id);
        assert_eq!(a.parsed_title_key.as_deref(), Some("breaking bad|"));
    }

    #[test]
    fn link_show_to_imdb_merges_into_canonical_when_duplicate_exists() {
        let db = fresh_db();
        upsert_show(
            &db,
            &fixture_show("s-canon", Some("tt1"), Some("a|"), "Canonical"),
        )
        .expect("canonical");
        upsert_show(&db, &fixture_show("s-dup", None, Some("a-dup|"), "Dup")).expect("dup");
        let canonical = link_show_to_imdb(&db, "s-dup", "tt1").expect("link");
        assert_eq!(canonical, "s-canon");
        assert!(get_show_by_id(&db, "s-dup").expect("get").is_none());
    }

    #[test]
    fn link_show_to_imdb_stamps_in_place_when_no_dup() {
        let db = fresh_db();
        upsert_show(&db, &fixture_show("s1", None, Some("a|"), "Show")).expect("upsert");
        let canonical = link_show_to_imdb(&db, "s1", "tt7").expect("link");
        assert_eq!(canonical, "s1");
        let got = get_show_by_id(&db, "s1").expect("get").expect("exists");
        assert_eq!(got.imdb_id.as_deref(), Some("tt7"));
    }

    #[test]
    fn list_shows_orders_by_title() {
        let db = fresh_db();
        upsert_show(&db, &fixture_show("a", None, Some("alpha|"), "Alpha")).expect("a");
        upsert_show(&db, &fixture_show("b", None, Some("beta|"), "Beta")).expect("b");
        let shows = list_shows(&db, 10, ShowsFilter::default()).expect("list");
        let titles: Vec<&str> = shows.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, vec!["Alpha", "Beta"]);
    }
}
