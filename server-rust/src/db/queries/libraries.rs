//! Library CRUD.

use rusqlite::{params, params_from_iter, OptionalExtension, Row, ToSql};

use crate::db::{sha1_hex, Db};
use crate::error::{DbError, DbResult};

#[derive(Clone, Debug)]
pub struct LibraryRow {
    pub id: String,
    pub name: String,
    pub path: String,
    pub media_type: String, // internal: "movies" | "tvShows"
    pub env: String,
    pub video_extensions: String, // JSON-encoded string array
    /// Reachability status set by the profile-availability probe.
    /// `'online' | 'offline' | 'unknown'`. Defaults to `'unknown'` for
    /// fresh rows; the probe upgrades within one cycle (~30s).
    pub status: String,
    /// ISO-8601 timestamp of the last successful probe (online or
    /// offline — both update this). Null until first probe.
    pub last_seen_at: Option<String>,
}

impl LibraryRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: r.get("id")?,
            name: r.get("name")?,
            path: r.get("path")?,
            media_type: r.get("media_type")?,
            env: r.get("env")?,
            video_extensions: r.get("video_extensions")?,
            status: r.get("status")?,
            last_seen_at: r.get("last_seen_at")?,
        })
    }
}

pub struct LibraryUpdate<'a> {
    pub name: Option<&'a str>,
    pub path: Option<&'a str>,
    pub media_type: Option<&'a str>,
    pub extensions: Option<Vec<String>>,
}

const DEFAULT_VIDEO_EXTENSIONS: &[&str] = &[".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm", ".ts"];

pub fn get_all_libraries(db: &Db) -> DbResult<Vec<LibraryRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM libraries")?;
        let rows = stmt.query_map([], LibraryRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn get_library_by_id(db: &Db, id: &str) -> DbResult<Option<LibraryRow>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT * FROM libraries WHERE id = ?1",
                params![id],
                LibraryRow::from_row,
            )
            .optional()?;
        Ok(row)
    })
}

/// Insert-or-update a library row keyed by `path`. The scanner calls
/// this from inside `scan_libraries` for every library before walking
/// it, so a row already created via `create_library` survives unchanged
/// while still letting the scanner refresh `name`/`media_type`/`env`/
/// `video_extensions` if a config update happened.
pub fn upsert_library(db: &Db, row: &LibraryRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO libraries
                 (id, name, path, media_type, env, video_extensions)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(path) DO UPDATE SET
                 name             = excluded.name,
                 media_type       = excluded.media_type,
                 env              = excluded.env,
                 video_extensions = excluded.video_extensions"#,
            params![
                row.id,
                row.name,
                row.path,
                row.media_type,
                row.env,
                row.video_extensions,
            ],
        )?;
        Ok(())
    })
}

pub fn create_library(
    db: &Db,
    name: &str,
    path: &str,
    media_type: &str,
    extensions: &[String],
) -> DbResult<LibraryRow> {
    let id = sha1_hex(path);
    let exts_json = serde_json_extensions(extensions)?;
    db.with(|c| {
        c.execute(
            r#"INSERT INTO libraries (id, name, path, media_type, env, video_extensions)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT(path) DO UPDATE SET
                 name = excluded.name,
                 media_type = excluded.media_type,
                 env = excluded.env,
                 video_extensions = excluded.video_extensions"#,
            params![id, name, path, media_type, "user", exts_json],
        )?;
        Ok(())
    })?;
    get_library_by_id(db, &id)?.ok_or(DbError::Invariant(
        "library row missing immediately after INSERT … ON CONFLICT — race or trigger",
    ))
}

fn serde_json_extensions(extensions: &[String]) -> DbResult<String> {
    let payload: Vec<&str> = if extensions.is_empty() {
        DEFAULT_VIDEO_EXTENSIONS.to_vec()
    } else {
        extensions.iter().map(|s| s.as_str()).collect()
    };
    serde_json::to_string(&payload).map_err(|source| DbError::MalformedJson {
        column: "libraries.video_extensions",
        source,
    })
}

pub fn delete_library(db: &Db, id: &str) -> DbResult<bool> {
    db.with(|c| {
        let n = c.execute("DELETE FROM libraries WHERE id = ?1", params![id])?;
        Ok(n > 0)
    })
}

/// Set `libraries.status` and `libraries.last_seen_at` for one library.
/// Used by `services::profile_availability` after each probe cycle.
pub fn update_library_status(db: &Db, id: &str, status: &str, last_seen_at: &str) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "UPDATE libraries SET status = ?2, last_seen_at = ?3 WHERE id = ?1",
            params![id, status, last_seen_at],
        )?;
        Ok(())
    })
}

pub fn update_library(
    db: &Db,
    id: &str,
    update: LibraryUpdate<'_>,
) -> DbResult<Option<LibraryRow>> {
    let mut parts: Vec<&str> = Vec::new();
    let mut vals: Vec<Box<dyn ToSql>> = Vec::new();
    if let Some(n) = update.name {
        parts.push("name = ?");
        vals.push(Box::new(n.to_string()));
    }
    if let Some(p) = update.path {
        parts.push("path = ?");
        vals.push(Box::new(p.to_string()));
    }
    if let Some(mt) = update.media_type {
        parts.push("media_type = ?");
        vals.push(Box::new(mt.to_string()));
    }
    if let Some(exts) = update.extensions {
        parts.push("video_extensions = ?");
        let serialised = serde_json::to_string(&exts).map_err(|source| DbError::MalformedJson {
            column: "libraries.video_extensions",
            source,
        })?;
        vals.push(Box::new(serialised));
    }
    if parts.is_empty() {
        return get_library_by_id(db, id);
    }
    let sql = format!("UPDATE libraries SET {} WHERE id = ?", parts.join(", "));
    vals.push(Box::new(id.to_string()));
    db.with(|c| {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        c.execute(&sql, params_from_iter(refs))?;
        Ok(())
    })?;
    get_library_by_id(db, id)
}

// ── Tests ────────────────────────────────────────────────────────────────────
//
// Cover the `create_library` write surface plus the round-trip through
// `get_library_by_id`. The assertions exercise ON-CONFLICT (insert-or-update)
// semantics, multi-row coexistence, and missing-row behaviour — every
// branch the production callers can hit.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        // `:memory:` gives each test its own isolated in-memory SQLite — no
        // tempdir cleanup, no test interference.
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    #[test]
    fn create_library_inserts_a_new_row() {
        let db = fresh_db();
        let row = create_library(&db, "My Videos", "/home/user/Videos", "movies", &[])
            .expect("create_library succeeds on a fresh db");
        assert_eq!(row.name, "My Videos");
        assert_eq!(row.path, "/home/user/Videos");
        assert_eq!(row.media_type, "movies");
        assert_eq!(row.env, "user");
    }

    #[test]
    fn upsert_library_inserts_a_new_row() {
        let db = fresh_db();
        let row = LibraryRow {
            id: "lib-up".to_string(),
            name: "Upserted".to_string(),
            path: "/lib/upserted".to_string(),
            media_type: "movies".to_string(),
            env: "user".to_string(),
            video_extensions: r#"[".mkv"]"#.to_string(),
            status: "unknown".to_string(),
            last_seen_at: None,
        };
        upsert_library(&db, &row).expect("upsert");
        let fetched = get_library_by_id(&db, "lib-up")
            .expect("query")
            .expect("row exists");
        assert_eq!(fetched.name, "Upserted");
        assert_eq!(fetched.path, "/lib/upserted");
    }

    #[test]
    fn upsert_library_on_path_conflict_replaces_mutable_fields() {
        let db = fresh_db();
        let first = LibraryRow {
            id: "id-original".to_string(),
            name: "Before".to_string(),
            path: "/lib/same".to_string(),
            media_type: "movies".to_string(),
            env: "dev".to_string(),
            video_extensions: r#"[".mkv"]"#.to_string(),
            status: "unknown".to_string(),
            last_seen_at: None,
        };
        upsert_library(&db, &first).expect("first");

        // Same path but every other field changed — name, media_type,
        // env, extensions all should be overwritten by the conflict.
        let second = LibraryRow {
            id: "id-new-but-ignored".to_string(),
            name: "After".to_string(),
            path: "/lib/same".to_string(),
            media_type: "tvShows".to_string(),
            env: "user".to_string(),
            video_extensions: r#"[".mp4"]"#.to_string(),
            status: "unknown".to_string(),
            last_seen_at: None,
        };
        upsert_library(&db, &second).expect("conflict update");

        let fetched = get_library_by_id(&db, "id-original")
            .expect("query")
            .expect("original id still wins");
        assert_eq!(fetched.name, "After");
        assert_eq!(fetched.media_type, "tvShows");
        assert_eq!(fetched.env, "user");
        assert_eq!(fetched.video_extensions, r#"[".mp4"]"#);
    }

    #[test]
    fn create_library_on_conflict_updates_name_and_media_type() {
        let db = fresh_db();
        let first =
            create_library(&db, "Original", "/mnt/lib", "movies", &[]).expect("first insert");
        let second =
            create_library(&db, "Updated", "/mnt/lib", "tvShows", &[]).expect("conflict update");
        // path is the unique key; id (sha1(path)) is stable across the conflict
        assert_eq!(first.id, second.id);
        assert_eq!(first.path, second.path);
        // name and media_type were overwritten by the conflict
        assert_eq!(second.name, "Updated");
        assert_eq!(second.media_type, "tvShows");
    }

    #[test]
    fn two_libraries_with_different_paths_coexist() {
        let db = fresh_db();
        create_library(&db, "Movies", "/mnt/movies", "movies", &[]).expect("a");
        create_library(&db, "TV", "/mnt/tv", "tvShows", &[]).expect("b");
        let all = get_all_libraries(&db).expect("get_all_libraries");
        let paths: Vec<&str> = all.iter().map(|r| r.path.as_str()).collect();
        assert!(paths.contains(&"/mnt/movies"));
        assert!(paths.contains(&"/mnt/tv"));
    }

    #[test]
    fn get_all_libraries_returns_every_row_with_required_fields() {
        let db = fresh_db();
        create_library(&db, "A", "/a", "movies", &[]).expect("a");
        create_library(&db, "B", "/b", "movies", &[]).expect("b");
        let all = get_all_libraries(&db).expect("get_all_libraries");
        assert!(all.len() >= 2);
        for row in &all {
            assert!(!row.id.is_empty());
            assert!(!row.name.is_empty());
            assert!(!row.path.is_empty());
            assert!(!row.media_type.is_empty());
            assert!(!row.env.is_empty());
        }
    }

    #[test]
    fn get_library_by_id_returns_none_for_unknown_id() {
        let db = fresh_db();
        let row = get_library_by_id(&db, "no-such-lib").expect("query succeeds");
        assert!(row.is_none());
    }

    #[test]
    fn get_library_by_id_returns_the_correct_row() {
        let db = fresh_db();
        let inserted =
            create_library(&db, "Exact", "/exact/path", "movies", &[]).expect("create_library");
        let row = get_library_by_id(&db, &inserted.id)
            .expect("query succeeds")
            .expect("library exists");
        assert_eq!(row.id, inserted.id);
        assert_eq!(row.name, "Exact");
    }

    #[test]
    fn create_library_uses_default_extensions_when_none_passed() {
        let db = fresh_db();
        let row = create_library(&db, "Defaults", "/defaults", "movies", &[]).expect("create");
        let exts: Vec<String> = serde_json::from_str(&row.video_extensions).expect("valid json");
        // Default video extensions cover the common containers the scanner
        // recognises today — `.mp4` is the canary; the full set is in
        // `services/library_scanner.rs::DEFAULT_VIDEO_EXTENSIONS`.
        assert!(exts.contains(&".mp4".to_string()));
        assert!(exts.contains(&".mkv".to_string()));
    }

    #[test]
    fn create_library_persists_explicit_extensions() {
        let db = fresh_db();
        let row = create_library(
            &db,
            "Custom",
            "/custom",
            "movies",
            &[".webm".to_string(), ".mov".to_string()],
        )
        .expect("create");
        let exts: Vec<String> = serde_json::from_str(&row.video_extensions).expect("valid json");
        assert_eq!(exts, vec![".webm".to_string(), ".mov".to_string()]);
    }

    #[test]
    fn delete_library_returns_true_when_row_existed() {
        let db = fresh_db();
        let row = create_library(&db, "Doomed", "/doomed", "movies", &[]).expect("create");
        let removed = delete_library(&db, &row.id).expect("delete");
        assert!(removed);
        assert!(get_library_by_id(&db, &row.id).expect("query").is_none());
    }

    #[test]
    fn delete_library_returns_false_when_row_did_not_exist() {
        let db = fresh_db();
        let removed = delete_library(&db, "no-such-lib").expect("delete");
        assert!(!removed);
    }

    #[test]
    fn update_library_changes_only_provided_fields() {
        let db = fresh_db();
        let row = create_library(&db, "Before", "/lib", "movies", &[]).expect("create");
        let updated = update_library(
            &db,
            &row.id,
            LibraryUpdate {
                name: Some("After"),
                path: None,
                media_type: None,
                extensions: None,
            },
        )
        .expect("update")
        .expect("library exists");
        assert_eq!(updated.name, "After");
        assert_eq!(updated.media_type, "movies"); // unchanged
        assert_eq!(updated.path, "/lib"); // unchanged
    }

    #[test]
    fn update_library_with_no_fields_returns_existing_row() {
        let db = fresh_db();
        let row = create_library(&db, "Stable", "/stable", "movies", &[]).expect("create");
        let same = update_library(
            &db,
            &row.id,
            LibraryUpdate {
                name: None,
                path: None,
                media_type: None,
                extensions: None,
            },
        )
        .expect("update")
        .expect("library exists");
        assert_eq!(same.id, row.id);
        assert_eq!(same.name, "Stable");
    }
}
