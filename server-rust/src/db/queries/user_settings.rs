//! Key/value settings (the `user_settings` table backs the client's flag
//! registry persistence). Mirrors `server/src/db/queries/userSettings.ts`.

use rusqlite::{params, OptionalExtension};

use crate::db::Db;
use crate::error::DbResult;

pub fn get_setting(db: &Db, key: &str) -> DbResult<Option<String>> {
    db.with(|c| {
        let row = c
            .query_row(
                "SELECT value FROM user_settings WHERE key = ?1",
                params![key],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(row)
    })
}

pub fn set_setting(db: &Db, key: &str, value: &str) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO user_settings (key, value) VALUES (?1, ?2)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
            params![key, value],
        )?;
        Ok(())
    })
}
