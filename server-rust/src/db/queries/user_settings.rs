//! Key/value settings (the `user_settings` table backs the client's flag
//! registry persistence). Mirrors `server/src/db/queries/userSettings.ts`.

use rusqlite::{params, OptionalExtension};

use crate::db::Db;

pub fn get_setting(db: &Db, key: &str) -> rusqlite::Result<Option<String>> {
    db.with(|c| {
        c.query_row(
            "SELECT value FROM user_settings WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        )
        .optional()
    })
}

pub fn set_setting(db: &Db, key: &str, value: &str) -> rusqlite::Result<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO user_settings (key, value) VALUES (?1, ?2)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value"#,
            params![key, value],
        )?;
        Ok(())
    })
}
