//! Service-issued local session rows — the revocation ledger for the local
//! session tokens minted by `services::local_session`.

use rusqlite::{params, OptionalExtension};

use crate::db::Db;
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct SessionRow {
    pub jti: String,
    pub user_id: String,
    pub email: Option<String>,
    pub issued_at: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
}

pub fn insert_session(db: &Db, row: &SessionRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO sessions (jti, user_id, email, issued_at, expires_at, revoked_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
            params![
                row.jti,
                row.user_id,
                row.email,
                row.issued_at,
                row.expires_at,
                row.revoked_at,
            ],
        )?;
        Ok(())
    })
}

/// A session is active when its row exists and has not been revoked. Token
/// expiry is enforced separately by signature validation (the `exp` claim).
pub fn is_session_active(db: &Db, jti: &str) -> DbResult<bool> {
    db.with(|c| {
        let found: Option<i64> = c
            .query_row(
                "SELECT 1 FROM sessions WHERE jti = ?1 AND revoked_at IS NULL LIMIT 1",
                params![jti],
                |r| r.get(0),
            )
            .optional()?;
        Ok(found.is_some())
    })
}

/// Mark a session revoked. Returns `true` if a non-revoked row was flipped,
/// `false` if it was already revoked or absent (idempotent logout).
pub fn revoke_session(db: &Db, jti: &str, now: &str) -> DbResult<bool> {
    db.with(|c| {
        let n = c.execute(
            "UPDATE sessions SET revoked_at = ?2 WHERE jti = ?1 AND revoked_at IS NULL",
            params![jti, now],
        )?;
        Ok(n > 0)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn row(jti: &str) -> SessionRow {
        SessionRow {
            jti: jti.to_string(),
            user_id: "user-1".to_string(),
            email: Some("a@b.c".to_string()),
            issued_at: "2026-01-01T00:00:00.000Z".to_string(),
            expires_at: "2026-01-31T00:00:00.000Z".to_string(),
            revoked_at: None,
        }
    }

    #[test]
    fn insert_then_active() {
        let db = fresh_db();
        insert_session(&db, &row("j1")).expect("insert");
        assert!(is_session_active(&db, "j1").expect("query"));
    }

    #[test]
    fn absent_session_is_inactive() {
        let db = fresh_db();
        assert!(!is_session_active(&db, "nope").expect("query"));
    }

    #[test]
    fn revoke_flips_active_then_is_idempotent() {
        let db = fresh_db();
        insert_session(&db, &row("j1")).expect("insert");
        assert!(revoke_session(&db, "j1", "2026-01-02T00:00:00.000Z").expect("revoke"));
        assert!(!is_session_active(&db, "j1").expect("query"));
        // Second revoke is a no-op (already revoked).
        assert!(!revoke_session(&db, "j1", "2026-01-03T00:00:00.000Z").expect("revoke"));
    }

    #[test]
    fn revoke_absent_session_returns_false() {
        let db = fresh_db();
        assert!(!revoke_session(&db, "ghost", "2026-01-02T00:00:00.000Z").expect("revoke"));
    }
}
