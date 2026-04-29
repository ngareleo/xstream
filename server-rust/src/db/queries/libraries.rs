//! Library CRUD. Mirrors `server/src/db/queries/libraries.ts`.

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
