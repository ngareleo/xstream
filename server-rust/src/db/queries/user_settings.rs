//! Key/value settings (the `user_settings` table backs the client's flag
//! registry persistence).

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

// ── Tests ────────────────────────────────────────────────────────────────────
//
// This table backs the client's localStorage-mirrored flag registry, so
// silent ON-CONFLICT breakage would corrupt every flag write — the tests
// pin both the round-trip and the upsert-on-conflict semantic explicitly.

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    #[test]
    fn get_setting_returns_none_for_unknown_key() {
        let db = fresh_db();
        assert!(get_setting(&db, "no.such.key").expect("query").is_none());
    }

    #[test]
    fn set_then_get_round_trips_the_value() {
        let db = fresh_db();
        set_setting(&db, "flag.experimentalBuffer", "1").expect("set");
        assert_eq!(
            get_setting(&db, "flag.experimentalBuffer").expect("get"),
            Some("1".to_string())
        );
    }

    #[test]
    fn set_setting_overwrites_on_conflict() {
        let db = fresh_db();
        set_setting(&db, "k", "first").expect("first");
        set_setting(&db, "k", "second").expect("second");
        assert_eq!(get_setting(&db, "k").expect("get"), Some("second".into()));
    }

    #[test]
    fn set_setting_handles_empty_value() {
        // NOT NULL on `value`, but empty string should be allowed.
        let db = fresh_db();
        set_setting(&db, "k", "").expect("set empty");
        assert_eq!(get_setting(&db, "k").expect("get"), Some("".to_string()));
    }
}
