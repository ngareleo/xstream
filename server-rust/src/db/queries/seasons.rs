//! Seasons + episodes for the logical Show entity. See docs/architecture/Library-Scan/03-Show-Entity.md.

use rusqlite::{params, Row};

use crate::db::Db;
use crate::error::DbResult;

#[derive(Clone, Debug)]
pub struct SeasonRow {
    pub show_id: String,
    pub season_number: i64,
}

impl SeasonRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            show_id: r.get("show_id")?,
            season_number: r.get("season_number")?,
        })
    }
}

#[derive(Clone, Debug)]
pub struct EpisodeRow {
    pub show_id: String,
    pub season_number: i64,
    pub episode_number: i64,
    pub title: Option<String>,
}

impl EpisodeRow {
    fn from_row(r: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            show_id: r.get("show_id")?,
            season_number: r.get("season_number")?,
            episode_number: r.get("episode_number")?,
            title: r.get("title")?,
        })
    }
}

pub fn get_seasons_by_show(db: &Db, show_id: &str) -> DbResult<Vec<SeasonRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT show_id, season_number
             FROM seasons
             WHERE show_id = ?1
             ORDER BY season_number ASC",
        )?;
        let rows = stmt.query_map(params![show_id], SeasonRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn get_episodes_by_show(db: &Db, show_id: &str) -> DbResult<Vec<EpisodeRow>> {
    db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT show_id, season_number, episode_number, title
             FROM episodes
             WHERE show_id = ?1
             ORDER BY season_number ASC, episode_number ASC",
        )?;
        let rows = stmt.query_map(params![show_id], EpisodeRow::from_row)?;
        let collected: rusqlite::Result<Vec<_>> = rows.collect();
        Ok(collected?)
    })
}

pub fn upsert_season(db: &Db, show_id: &str, season_number: i64) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            "INSERT INTO seasons (show_id, season_number)
             VALUES (?1, ?2)
             ON CONFLICT(show_id, season_number) DO NOTHING",
            params![show_id, season_number],
        )?;
        Ok(())
    })
}

pub fn upsert_episode(db: &Db, row: &EpisodeRow) -> DbResult<()> {
    db.with(|c| {
        c.execute(
            r#"INSERT INTO episodes
                 (show_id, season_number, episode_number, title)
               VALUES (?1, ?2, ?3, ?4)
               ON CONFLICT(show_id, season_number, episode_number) DO UPDATE SET
                 title = excluded.title"#,
            params![
                row.show_id,
                row.season_number,
                row.episode_number,
                row.title,
            ],
        )?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::queries::shows::{upsert_show, ShowRow};
    use std::path::Path;

    fn fresh_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    fn seed_show(db: &Db, id: &str) {
        upsert_show(
            db,
            &ShowRow {
                id: id.to_string(),
                imdb_id: None,
                parsed_title_key: Some(format!("{id}|")),
                title: id.to_string(),
                year: None,
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            },
        )
        .expect("seed show");
    }

    #[test]
    fn upsert_season_is_idempotent() {
        let db = fresh_db();
        seed_show(&db, "show-aaa");
        upsert_season(&db, "show-aaa", 1).expect("first upsert");
        upsert_season(&db, "show-aaa", 1).expect("second upsert");
        let seasons = get_seasons_by_show(&db, "show-aaa").expect("list seasons");
        assert_eq!(seasons.len(), 1);
        assert_eq!(seasons[0].season_number, 1);
    }

    #[test]
    fn upsert_episode_updates_title_in_place() {
        let db = fresh_db();
        seed_show(&db, "show-aaa");
        upsert_season(&db, "show-aaa", 1).expect("upsert season");
        upsert_episode(
            &db,
            &EpisodeRow {
                show_id: "show-aaa".to_string(),
                season_number: 1,
                episode_number: 1,
                title: Some("Pilot".to_string()),
            },
        )
        .expect("first upsert");
        upsert_episode(
            &db,
            &EpisodeRow {
                show_id: "show-aaa".to_string(),
                season_number: 1,
                episode_number: 1,
                title: Some("Pilot (Director's Cut)".to_string()),
            },
        )
        .expect("second upsert");
        let eps = get_episodes_by_show(&db, "show-aaa").expect("list episodes");
        let s1e1: Vec<_> = eps
            .iter()
            .filter(|e| e.season_number == 1 && e.episode_number == 1)
            .collect();
        assert_eq!(s1e1.len(), 1);
        assert_eq!(s1e1[0].title.as_deref(), Some("Pilot (Director's Cut)"));
    }

    #[test]
    fn get_episodes_by_show_returns_them_grouped_in_ascending_order() {
        let db = fresh_db();
        seed_show(&db, "show-aaa");
        upsert_season(&db, "show-aaa", 1).expect("season 1");
        upsert_season(&db, "show-aaa", 2).expect("season 2");
        for (sn, en) in [(2, 1), (1, 2), (1, 1)] {
            upsert_episode(
                &db,
                &EpisodeRow {
                    show_id: "show-aaa".to_string(),
                    season_number: sn,
                    episode_number: en,
                    title: None,
                },
            )
            .expect("upsert episode");
        }
        let eps = get_episodes_by_show(&db, "show-aaa").expect("list");
        let keys: Vec<String> = eps
            .iter()
            .map(|e| format!("S{}E{}", e.season_number, e.episode_number))
            .collect();
        assert_eq!(keys, vec!["S1E1", "S1E2", "S2E1"]);
    }

    #[test]
    fn get_seasons_by_show_returns_seasons_in_ascending_order() {
        let db = fresh_db();
        seed_show(&db, "show-aaa");
        upsert_season(&db, "show-aaa", 2).expect("season 2");
        upsert_season(&db, "show-aaa", 1).expect("season 1");
        let seasons = get_seasons_by_show(&db, "show-aaa").expect("list");
        let nums: Vec<i64> = seasons.iter().map(|s| s.season_number).collect();
        assert_eq!(nums, vec![1, 2]);
    }

    #[test]
    fn queries_scoped_by_show_id_return_empty_for_unknown_show() {
        let db = fresh_db();
        seed_show(&db, "show-aaa");
        assert!(get_seasons_by_show(&db, "nonexistent")
            .expect("empty seasons")
            .is_empty());
        assert!(get_episodes_by_show(&db, "nonexistent")
            .expect("empty episodes")
            .is_empty());
    }
}
