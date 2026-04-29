//! Library CRUD. Mirrors `server/src/db/queries/libraries.ts`.

use rusqlite::{params, params_from_iter, OptionalExtension, Row, ToSql};

use crate::db::{sha1_hex, Db};

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

pub fn get_all_libraries(db: &Db) -> rusqlite::Result<Vec<LibraryRow>> {
    db.with(|c| {
        let mut stmt = c.prepare("SELECT * FROM libraries")?;
        let rows = stmt.query_map([], LibraryRow::from_row)?;
        rows.collect()
    })
}

pub fn get_library_by_id(db: &Db, id: &str) -> rusqlite::Result<Option<LibraryRow>> {
    db.with(|c| {
        c.query_row(
            "SELECT * FROM libraries WHERE id = ?1",
            params![id],
            LibraryRow::from_row,
        )
        .optional()
    })
}

pub fn create_library(
    db: &Db,
    name: &str,
    path: &str,
    media_type: &str,
    extensions: &[String],
) -> rusqlite::Result<LibraryRow> {
    let id = sha1_hex(path);
    let exts_json = if extensions.is_empty() {
        // Mirror Bun's DEFAULT_VIDEO_EXTENSIONS
        serde_json::to_string(&[".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm", ".ts"])
            .expect("static array serialises")
    } else {
        serde_json::to_string(extensions).expect("string array serialises")
    };
    db.with(|c| -> rusqlite::Result<()> {
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
    Ok(get_library_by_id(db, &id)?.expect("library just inserted must exist"))
}

pub fn delete_library(db: &Db, id: &str) -> rusqlite::Result<bool> {
    db.with(|c| {
        c.execute("DELETE FROM libraries WHERE id = ?1", params![id])
            .map(|n| n > 0)
    })
}

pub fn update_library(
    db: &Db,
    id: &str,
    update: LibraryUpdate<'_>,
) -> rusqlite::Result<Option<LibraryRow>> {
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
        vals.push(Box::new(
            serde_json::to_string(&exts).expect("string vec serialises"),
        ));
    }
    if parts.is_empty() {
        return get_library_by_id(db, id);
    }
    let sql = format!("UPDATE libraries SET {} WHERE id = ?", parts.join(", "));
    vals.push(Box::new(id.to_string()));
    db.with(|c| -> rusqlite::Result<()> {
        let refs: Vec<&dyn ToSql> = vals.iter().map(|b| b.as_ref()).collect();
        c.execute(&sql, params_from_iter(refs))?;
        Ok(())
    })?;
    get_library_by_id(db, id)
}
