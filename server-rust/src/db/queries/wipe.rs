//! Bulk content wipe — used by the dev "wipe DB" mutation. Preserves `user_settings`.

use crate::db::{Db, DbResult};

/// Delete every content row in a single transaction. Preserves
/// `user_settings` (OMDb key, feature flags) and the schema.
///
/// Relies on FK cascades configured in `db/migrate.rs`:
/// - `libraries` → `videos` → `video_metadata`, `video_streams`,
///   `transcode_jobs` → `segments`.
/// - `films` → `watchlist_items`.
/// - `shows` → `seasons`, `episodes`, `show_metadata`.
///
/// `playback_history` carries no FK back to videos, so it gets its own
/// explicit DELETE — but only when the dev-features build keeps reads/writes
/// to that table alive. Prod artifacts skip the row entirely (the table
/// migration still runs, but nothing inserts into it).
pub fn wipe_content(db: &Db) -> DbResult<()> {
    db.with(|conn| {
        let tx = conn.unchecked_transaction()?;
        let stmts: &[&str] = &[
            #[cfg(feature = "dev-features")]
            "DELETE FROM playback_history",
            "DELETE FROM libraries",
            "DELETE FROM films",
            "DELETE FROM shows",
        ];
        for stmt in stmts {
            tx.execute(stmt, [])?;
        }
        tx.commit()?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    use crate::db::{create_library, set_setting, upsert_video, upsert_video_metadata, VideoRow};

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn now() -> String {
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
    }

    #[test]
    fn wipe_removes_libraries_and_cascaded_videos() {
        let db = fresh_db();
        let lib = create_library(&db, "lib1", "/tmp/lib1", "movies", &["mkv".into()])
            .expect("create lib");
        let video = VideoRow {
            id: "vid1".into(),
            library_id: lib.id.clone(),
            path: "/tmp/lib1/a.mkv".into(),
            filename: "a.mkv".into(),
            title: Some("A".into()),
            duration_seconds: 60.0,
            file_size_bytes: 1000,
            bitrate: 1000,
            scanned_at: now(),
            content_fingerprint: "fp".into(),
            native_resolution: None,
            film_id: None,
            show_id: None,
            show_season: None,
            show_episode: None,
            role: "main".into(),
        };
        upsert_video(&db, &video).expect("upsert video");

        wipe_content(&db).expect("wipe");

        let lib_count: i64 = db
            .with(|c| {
                c.query_row("SELECT COUNT(*) FROM libraries", [], |r| r.get(0))
                    .map_err(Into::into)
            })
            .expect("count libs");
        let video_count: i64 = db
            .with(|c| {
                c.query_row("SELECT COUNT(*) FROM videos", [], |r| r.get(0))
                    .map_err(Into::into)
            })
            .expect("count videos");
        assert_eq!(lib_count, 0);
        assert_eq!(video_count, 0, "FK cascade should have deleted the video");
    }

    #[test]
    fn wipe_preserves_user_settings() {
        let db = fresh_db();
        set_setting(&db, "omdbApiKey", "secret-key-do-not-touch").expect("set setting");

        wipe_content(&db).expect("wipe");

        let value: Option<String> = db
            .with(|c| {
                c.query_row(
                    "SELECT value FROM user_settings WHERE key = 'omdbApiKey'",
                    [],
                    |r| r.get(0),
                )
                .map_err(Into::into)
            })
            .ok();
        assert_eq!(value.as_deref(), Some("secret-key-do-not-touch"));
    }

    #[test]
    fn wipe_is_idempotent_on_an_empty_db() {
        let db = fresh_db();
        wipe_content(&db).expect("first wipe");
        wipe_content(&db).expect("second wipe must also succeed");
    }

    #[test]
    fn wipe_clears_metadata_via_cascade() {
        let db = fresh_db();
        let lib = create_library(&db, "lib1", "/tmp/lib1", "movies", &["mkv".into()])
            .expect("create lib");
        let video = VideoRow {
            id: "vid1".into(),
            library_id: lib.id.clone(),
            path: "/tmp/lib1/a.mkv".into(),
            filename: "a.mkv".into(),
            title: Some("A".into()),
            duration_seconds: 60.0,
            file_size_bytes: 1000,
            bitrate: 1000,
            scanned_at: now(),
            content_fingerprint: "fp".into(),
            native_resolution: None,
            film_id: None,
            show_id: None,
            show_season: None,
            show_episode: None,
            role: "main".into(),
        };
        upsert_video(&db, &video).expect("upsert video");
        upsert_video_metadata(
            &db,
            &crate::db::VideoMetadataRow {
                video_id: "vid1".into(),
                imdb_id: "tt0001".into(),
                title: "A".into(),
                year: None,
                genre: None,
                director: None,
                cast_list: None,
                rating: None,
                plot: None,
                poster_url: None,
                poster_local_path: None,
                matched_at: now(),
            },
        )
        .expect("upsert metadata");

        wipe_content(&db).expect("wipe");

        let meta_count: i64 = db
            .with(|c| {
                c.query_row("SELECT COUNT(*) FROM video_metadata", [], |r| r.get(0))
                    .map_err(Into::into)
            })
            .expect("count metadata");
        assert_eq!(meta_count, 0);
    }
}
