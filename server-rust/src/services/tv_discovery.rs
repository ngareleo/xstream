//! TV-show discovery — walks a `tvShows` library and rebuilds the
//! `shows` / `seasons` / `episodes` rows from the canonical
//! `<library>/<Show>/<Season>/<Episode>` layout.
//!
//! Series identity lives in the `shows` table (not in `videos`); episode
//! files are regular `videos` rows linked back to a Show by
//! `(show_id, show_season, show_episode)`. Two libraries indexing the
//! same series fold into one Show; two libraries indexing the same
//! episode file produce two `videos` rows pointing at the same
//! `(show_id, season, episode)` coordinate (axis-2 dedup — the picker
//! shows them as variants).
//!
//! Per-show flow:
//! 1. `resolve_show_for_directory` — Show keyed on parsed_title_key.
//! 2. Walk local files; for each parseable episode, `assign_video_to_show`.
//! 3. OMDb best-effort: `search_series` → `series_details` →
//!    `season_episodes` per season.
//! 4. On match: `link_show_to_imdb` (which may merge into a canonical
//!    show) + `upsert_show_metadata`.
//! 5. Merge local + OMDb episode trees; write seasons + episodes rows.
//!
//! Failure isolation:
//! - OMDb miss → fall back to regex-only persistence (local episodes
//!   still land, no canonical titles).
//! - Per-season fetch failure → log warn, continue.
//! - DB write failure → log error, abort that show, continue.
//!
//! See `docs/architecture/Library-Scan/03-Show-Entity.md` for the
//! architectural picture.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use chrono::Utc;
use sha1::{Digest, Sha1};
use tracing::{info, info_span, warn, Instrument};

use crate::config::AppContext;
use crate::db::{
    assign_video_to_show, get_video_by_id, link_show_to_imdb, resolve_show_for_directory,
    upsert_episode, upsert_season, upsert_show_metadata, EpisodeRow, LibraryRow, ShowMetadataRow,
};
use crate::services::omdb::{OmdbClient, OmdbEpisode, OmdbSeriesDetails};

const PHASE_DISCOVERING_TV: &str = "discovering_tv";
const PHASE_FETCHING_OMDB: &str = "fetching_omdb";

/// Walk every show directory under `library` and run the full discovery
/// flow per show. Per-show failures are logged and isolated.
pub async fn discover_tv_shows(ctx: &AppContext, library: &LibraryRow) {
    let span = info_span!("library.tv_discovery", library_name = %library.name);
    async {
        let library_path = PathBuf::from(&library.path);
        let show_dirs = match list_subdirectories(&library_path) {
            Ok(v) => v,
            Err(err) => {
                warn!(
                    library_id = %library.id,
                    path = %library.path,
                    error = %err,
                    "tv_discovery: failed to list show dirs",
                );
                return;
            }
        };
        let total = show_dirs.len() as u32;
        ctx.scan_state.mark_progress_with_context(
            &library.id,
            0,
            total,
            Some(PHASE_DISCOVERING_TV),
            None,
        );

        let mut completed = 0u32;
        for show_dir in show_dirs {
            let show_name = match show_dir.file_name().and_then(|n| n.to_str()) {
                Some(n) if !n.is_empty() => n.to_string(),
                _ => {
                    completed += 1;
                    continue;
                }
            };
            ctx.scan_state.mark_progress_with_context(
                &library.id,
                completed,
                total,
                Some(PHASE_DISCOVERING_TV),
                Some(&show_name),
            );

            if let Err(err) = discover_one_show(ctx, library, &show_dir, &show_name).await {
                tracing::error!(
                    show = %show_name,
                    error = %err,
                    "tv_discovery: discover_one_show failed",
                );
            }
            completed += 1;
            ctx.scan_state.mark_progress_with_context(
                &library.id,
                completed,
                total,
                Some(PHASE_DISCOVERING_TV),
                Some(&show_name),
            );
        }

        info!(
            library_id = %library.id,
            shows = total,
            "tv_discovery_complete",
        );
    }
    .instrument(span)
    .await;
}

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error("db error: {0}")]
    Db(#[from] crate::error::DbError),
}

async fn discover_one_show(
    ctx: &AppContext,
    library: &LibraryRow,
    show_dir: &Path,
    show_name: &str,
) -> Result<(), DiscoveryError> {
    let local_tree = walk_local_show(show_dir);
    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // 1. Show identity — parsed_title_key fallback only; OMDb stamp lands later.
    let show = resolve_show_for_directory(&ctx.db, show_name, &now)?;
    let mut show_id = show.id.clone();

    // 2. Link every local episode video → (show_id, season, episode).
    //    Done before OMDb so a flaky network still produces a usable tree.
    for (season_n, eps) in &local_tree.seasons {
        for ep in eps {
            let video_id = sha1_path(&ep.file_path);
            // Defensive: only assign if the video row exists. The regular
            // scan should have created it pre-discovery; if not, log and
            // skip rather than tripping FK.
            match get_video_by_id(&ctx.db, &video_id)? {
                Some(_) => {
                    if let Err(err) = assign_video_to_show(
                        &ctx.db,
                        &video_id,
                        &show_id,
                        *season_n,
                        ep.episode_number,
                    ) {
                        warn!(
                            show = %show_name,
                            season = season_n,
                            episode = ep.episode_number,
                            error = %err,
                            "tv_discovery: assign_video_to_show failed",
                        );
                    }
                }
                None => {
                    warn!(
                        show = %show_name,
                        season = season_n,
                        episode = ep.episode_number,
                        file = %ep.file_path.display(),
                        "tv_discovery: episode file has no videos row (probe failed earlier?); skipping link",
                    );
                }
            }
        }
    }

    // 3. OMDb best-effort.
    let omdb_tree = if let Some(omdb) = ctx.omdb.as_ref() {
        fetch_omdb_show_tree(ctx, library, omdb, show_name).await
    } else {
        None
    };

    // 4. Stamp imdb_id (may merge into a canonical show row); upsert metadata.
    if let Some((details, _)) = omdb_tree.as_ref() {
        let canonical = match link_show_to_imdb(&ctx.db, &show_id, &details.imdb_id) {
            Ok(c) => c,
            Err(err) => {
                warn!(
                    show = %show_name,
                    imdb_id = %details.imdb_id,
                    error = %err,
                    "tv_discovery: link_show_to_imdb failed",
                );
                show_id.clone()
            }
        };
        // If link_show_to_imdb merged us into a canonical row, every
        // assignment we just wrote now points at the wrong show_id —
        // re-point.
        if canonical != show_id {
            for (season_n, eps) in &local_tree.seasons {
                for ep in eps {
                    let video_id = sha1_path(&ep.file_path);
                    if let Err(err) = assign_video_to_show(
                        &ctx.db,
                        &video_id,
                        &canonical,
                        *season_n,
                        ep.episode_number,
                    ) {
                        warn!(
                            show = %show_name,
                            error = %err,
                            "tv_discovery: re-assign after merge failed",
                        );
                    }
                }
            }
            show_id = canonical;
        }

        let metadata_row = ShowMetadataRow {
            show_id: show_id.clone(),
            imdb_id: details.imdb_id.clone(),
            title: details.title.clone(),
            year: details.year,
            genre: details.genre.clone(),
            director: details.director.clone(),
            cast_list: serde_json::to_string(&details.actors).ok(),
            rating: details.imdb_rating,
            plot: details.plot.clone(),
            poster_url: details.poster_url.clone(),
            poster_local_path: None,
            matched_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        };
        if let Err(err) = upsert_show_metadata(&ctx.db, &metadata_row) {
            warn!(
                show = %show_name,
                error = %err,
                "tv_discovery: failed to upsert show metadata",
            );
        }
    }

    let merged = merge_trees(&local_tree, omdb_tree.as_ref().map(|(_, eps)| eps));
    persist_merged_tree(&ctx.db, &show_id, &merged)?;

    info!(
        show = %show_name,
        seasons = merged.len(),
        episodes = merged.values().map(|v| v.len()).sum::<usize>(),
        omdb_matched = omdb_tree.is_some(),
        "tv_discovery: show_processed",
    );
    Ok(())
}

#[derive(Debug, Clone, Default)]
pub struct LocalShowTree {
    pub seasons: BTreeMap<i64, Vec<LocalEpisode>>,
}

#[derive(Debug, Clone)]
pub struct LocalEpisode {
    pub episode_number: i64,
    pub file_path: PathBuf,
}

fn walk_local_show(show_dir: &Path) -> LocalShowTree {
    let mut tree = LocalShowTree::default();
    let season_dirs = match list_subdirectories(show_dir) {
        Ok(v) => v,
        Err(err) => {
            warn!(
                show_dir = %show_dir.display(),
                error = %err,
                "tv_discovery: failed to list season dirs",
            );
            return tree;
        }
    };
    for season_dir in season_dirs {
        let dir_name = match season_dir.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let Some(season_number) = parse_season_number(&dir_name) else {
            warn!(
                season_dir = %dir_name,
                "tv_discovery: season dir name has no parseable number, skipping",
            );
            continue;
        };
        let files = match list_files(&season_dir) {
            Ok(v) => v,
            Err(err) => {
                warn!(
                    season_dir = %dir_name,
                    error = %err,
                    "tv_discovery: failed to list episode files",
                );
                continue;
            }
        };
        let mut local_eps: Vec<LocalEpisode> = Vec::new();
        for file in files {
            let filename = match file.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            let Some((file_season, episode_number)) = parse_episode_id(filename) else {
                continue;
            };
            if file_season != season_number {
                warn!(
                    season_dir = %dir_name,
                    file = %filename,
                    file_season,
                    "tv_discovery: filename season disagrees with directory; using directory",
                );
            }
            local_eps.push(LocalEpisode {
                episode_number,
                file_path: file,
            });
        }
        local_eps.sort_by_key(|e| e.episode_number);
        tree.seasons.insert(season_number, local_eps);
    }
    tree
}

async fn fetch_omdb_show_tree(
    ctx: &AppContext,
    library: &LibraryRow,
    omdb: &OmdbClient,
    show_name: &str,
) -> Option<(OmdbSeriesDetails, BTreeMap<i64, Vec<OmdbEpisode>>)> {
    ctx.scan_state.mark_progress_with_context(
        &library.id,
        0,
        0,
        Some(PHASE_FETCHING_OMDB),
        Some(show_name),
    );

    let series = omdb.search_series(show_name).await?;
    let details = omdb.series_details(&series.imdb_id).await?;

    let mut by_season: BTreeMap<i64, Vec<OmdbEpisode>> = BTreeMap::new();
    for season_n in 1..=details.total_seasons {
        let label = format!("{show_name} S{season_n:02}");
        ctx.scan_state.mark_progress_with_context(
            &library.id,
            season_n as u32,
            details.total_seasons as u32,
            Some(PHASE_FETCHING_OMDB),
            Some(&label),
        );
        match omdb.season_episodes(&series.imdb_id, season_n).await {
            Some(eps) => {
                by_season.insert(season_n, eps);
            }
            None => {
                warn!(
                    show = %show_name,
                    season_n,
                    "tv_discovery: omdb season fetch returned no episodes",
                );
            }
        }
    }
    Some((details, by_season))
}

pub fn merge_trees(
    local: &LocalShowTree,
    omdb: Option<&BTreeMap<i64, Vec<OmdbEpisode>>>,
) -> BTreeMap<i64, Vec<MergedEpisode>> {
    let mut local_index: HashMap<(i64, i64), &LocalEpisode> = HashMap::new();
    for (season, eps) in &local.seasons {
        for ep in eps {
            local_index.insert((*season, ep.episode_number), ep);
        }
    }

    let mut merged: BTreeMap<i64, Vec<MergedEpisode>> = BTreeMap::new();
    let mut seen: HashSet<(i64, i64)> = HashSet::new();

    if let Some(by_season) = omdb {
        for (season, eps) in by_season {
            let bucket = merged.entry(*season).or_default();
            for omdb_ep in eps {
                let key = (*season, omdb_ep.episode_number);
                bucket.push(MergedEpisode {
                    season_number: *season,
                    episode_number: omdb_ep.episode_number,
                    title: Some(omdb_ep.title.clone()),
                });
                seen.insert(key);
            }
        }
    }

    for (season, eps) in &local.seasons {
        let bucket = merged.entry(*season).or_default();
        for ep in eps {
            let key = (*season, ep.episode_number);
            if seen.contains(&key) {
                continue;
            }
            bucket.push(MergedEpisode {
                season_number: *season,
                episode_number: ep.episode_number,
                title: None,
            });
            seen.insert(key);
        }
    }

    for bucket in merged.values_mut() {
        bucket.sort_by_key(|e| e.episode_number);
    }
    merged
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergedEpisode {
    pub season_number: i64,
    pub episode_number: i64,
    pub title: Option<String>,
}

fn persist_merged_tree(
    db: &crate::db::Db,
    show_id: &str,
    merged: &BTreeMap<i64, Vec<MergedEpisode>>,
) -> Result<(), DiscoveryError> {
    for (season_number, eps) in merged {
        upsert_season(db, show_id, *season_number)?;
        for ep in eps {
            upsert_episode(
                db,
                &EpisodeRow {
                    show_id: show_id.to_string(),
                    season_number: ep.season_number,
                    episode_number: ep.episode_number,
                    title: ep.title.clone(),
                },
            )?;
        }
    }
    Ok(())
}

// ── Filesystem helpers ───────────────────────────────────────────────────────

fn list_subdirectories(path: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            out.push(entry.path());
        }
    }
    out.sort();
    Ok(out)
}

fn list_files(path: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            out.push(entry.path());
        }
    }
    out.sort();
    Ok(out)
}

fn sha1_path(path: &Path) -> String {
    let mut hasher = Sha1::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hex::encode(hasher.finalize())
}

// ── Parse helpers ────────────────────────────────────────────────────────────

pub fn parse_season_number(dirname: &str) -> Option<i64> {
    let digits: String = dirname
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take_while(|c| c.is_ascii_digit())
        .collect();
    let n: i64 = digits.parse().ok()?;
    if n > 0 {
        Some(n)
    } else {
        None
    }
}

pub fn parse_episode_id(filename: &str) -> Option<(i64, i64)> {
    if let Some(p) = parse_sxxexx(filename) {
        return Some(p);
    }
    parse_nxnn(filename)
}

fn parse_sxxexx(s: &str) -> Option<(i64, i64)> {
    for (idx, c) in s.char_indices() {
        if c != 'S' && c != 's' {
            continue;
        }
        let after_s = &s[idx + c.len_utf8()..];
        let s_digits_end = after_s
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(after_s.len());
        if s_digits_end == 0 {
            continue;
        }
        let season_str = &after_s[..s_digits_end];
        let after_season = &after_s[s_digits_end..];
        let next_char = match after_season.chars().next() {
            Some(c) => c,
            None => continue,
        };
        if next_char != 'E' && next_char != 'e' {
            continue;
        }
        let after_e = &after_season[next_char.len_utf8()..];
        let e_digits_end = after_e
            .find(|c: char| !c.is_ascii_digit())
            .unwrap_or(after_e.len());
        if e_digits_end == 0 {
            continue;
        }
        let episode_str = &after_e[..e_digits_end];
        let season: i64 = season_str.parse().ok()?;
        let episode: i64 = episode_str.parse().ok()?;
        if season > 0 && episode > 0 {
            return Some((season, episode));
        }
    }
    None
}

fn parse_nxnn(s: &str) -> Option<(i64, i64)> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if !bytes[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let n_start = i;
        let mut j = i;
        while j < bytes.len() && bytes[j].is_ascii_digit() {
            j += 1;
        }
        if j < bytes.len() && bytes[j] == b'x' {
            let m_start = j + 1;
            let mut k = m_start;
            while k < bytes.len() && bytes[k].is_ascii_digit() {
                k += 1;
            }
            if k > m_start {
                let season_str = std::str::from_utf8(&bytes[n_start..j]).ok()?;
                let episode_str = std::str::from_utf8(&bytes[m_start..k]).ok()?;
                let season: i64 = season_str.parse().ok()?;
                let episode: i64 = episode_str.parse().ok()?;
                if season > 0 && episode > 0 {
                    return Some((season, episode));
                }
            }
        }
        i = j;
    }
    None
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_season_number ──────────────────────────────────────────────

    #[test]
    fn parse_season_number_handles_common_formats() {
        assert_eq!(parse_season_number("Season 1"), Some(1));
        assert_eq!(parse_season_number("Season 01"), Some(1));
        assert_eq!(parse_season_number("S01"), Some(1));
        assert_eq!(parse_season_number("S1"), Some(1));
        assert_eq!(parse_season_number("1"), Some(1));
        assert_eq!(parse_season_number("Season 12"), Some(12));
    }

    #[test]
    fn parse_season_number_rejects_no_digits_or_zero() {
        assert_eq!(parse_season_number("Specials"), None);
        assert_eq!(parse_season_number(""), None);
        assert_eq!(parse_season_number("Season 0"), None);
    }

    // ── parse_episode_id ─────────────────────────────────────────────────

    #[test]
    fn parse_episode_id_handles_sxxexx_with_dots() {
        assert_eq!(
            parse_episode_id("Breaking.Bad.S01E02.720p.mkv"),
            Some((1, 2))
        );
        assert_eq!(parse_episode_id("Some.Show.S10E15.mkv"), Some((10, 15)));
    }

    #[test]
    fn parse_episode_id_is_case_insensitive() {
        assert_eq!(parse_episode_id("show.s01e02.mkv"), Some((1, 2)));
        assert_eq!(parse_episode_id("Show.S1E2.mkv"), Some((1, 2)));
    }

    #[test]
    fn parse_episode_id_handles_nxnn_pattern() {
        assert_eq!(parse_episode_id("Show 1x02.mkv"), Some((1, 2)));
        assert_eq!(parse_episode_id("Show 10x15.mkv"), Some((10, 15)));
    }

    #[test]
    fn parse_episode_id_returns_none_for_unmatchable_filenames() {
        assert_eq!(parse_episode_id("Movie.2024.mkv"), None);
        assert_eq!(parse_episode_id("Random.mkv"), None);
        assert_eq!(parse_episode_id(""), None);
    }

    #[test]
    fn parse_episode_id_prefers_sxxexx_when_both_patterns_present() {
        let r = parse_episode_id("Show 1x02 S03E04.mkv");
        assert_eq!(r, Some((3, 4)));
    }

    // ── merge_trees ──────────────────────────────────────────────────────

    fn local_with_episodes(spec: &[(i64, i64, &str)]) -> LocalShowTree {
        let mut tree = LocalShowTree::default();
        for (season, episode, fname) in spec {
            tree.seasons.entry(*season).or_default().push(LocalEpisode {
                episode_number: *episode,
                file_path: PathBuf::from(format!("/tv/show/{fname}")),
            });
        }
        tree
    }

    fn omdb_episode(num: i64, title: &str) -> OmdbEpisode {
        OmdbEpisode {
            episode_number: num,
            title: title.to_string(),
            imdb_id: format!("tt{num:07}"),
            released: None,
            imdb_rating: None,
        }
    }

    #[test]
    fn merge_trees_unions_local_and_omdb_episodes() {
        let local = local_with_episodes(&[
            (1, 1, "S01E01.mkv"),
            (1, 2, "S01E02.mkv"),
            (1, 5, "S01E05.mkv"),
        ]);
        let mut omdb = BTreeMap::new();
        omdb.insert(
            1,
            vec![
                omdb_episode(1, "Pilot"),
                omdb_episode(2, "Cat's Bag"),
                omdb_episode(3, "Bag's Cat"),
            ],
        );

        let merged = merge_trees(&local, Some(&omdb));
        let s1 = merged.get(&1).expect("season 1");
        let by_num: HashMap<i64, &MergedEpisode> =
            s1.iter().map(|e| (e.episode_number, e)).collect();

        assert_eq!(by_num.len(), 4);
        assert_eq!(by_num.get(&1).unwrap().title.as_deref(), Some("Pilot"));
        assert_eq!(by_num.get(&3).unwrap().title.as_deref(), Some("Bag's Cat"));
        assert!(by_num.get(&5).unwrap().title.is_none());
    }

    #[test]
    fn merge_trees_with_no_omdb_data_falls_back_to_local_only() {
        let local = local_with_episodes(&[(1, 1, "a"), (1, 2, "b"), (2, 1, "c")]);
        let merged = merge_trees(&local, None);
        let s1 = merged.get(&1).expect("season 1");
        assert_eq!(s1.len(), 2);
        for ep in s1 {
            assert!(ep.title.is_none());
        }
        let s2 = merged.get(&2).expect("season 2");
        assert_eq!(s2.len(), 1);
    }

    #[test]
    fn merge_trees_orders_episodes_within_a_season_ascending() {
        let local = local_with_episodes(&[(1, 5, "e"), (1, 1, "a"), (1, 3, "c")]);
        let merged = merge_trees(&local, None);
        let nums: Vec<i64> = merged
            .get(&1)
            .expect("season 1")
            .iter()
            .map(|e| e.episode_number)
            .collect();
        assert_eq!(nums, vec![1, 3, 5]);
    }

    // ── persist_merged_tree (against in-memory DB) ───────────────────────

    use crate::db::{
        create_library, get_episodes_by_show, get_seasons_by_show, upsert_show, Db, ShowRow,
    };
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
    fn persist_merged_tree_writes_seasons_and_episodes() {
        let db = fresh_db();
        seed_show(&db, "show-aaa");

        let mut merged = BTreeMap::new();
        merged.insert(
            1,
            vec![
                MergedEpisode {
                    season_number: 1,
                    episode_number: 1,
                    title: Some("Pilot".to_string()),
                },
                MergedEpisode {
                    season_number: 1,
                    episode_number: 2,
                    title: Some("Second".to_string()),
                },
            ],
        );

        persist_merged_tree(&db, "show-aaa", &merged).expect("persist");

        let seasons = get_seasons_by_show(&db, "show-aaa").expect("seasons");
        assert_eq!(seasons.len(), 1);
        let eps = get_episodes_by_show(&db, "show-aaa").expect("episodes");
        assert_eq!(eps.len(), 2);
        assert_eq!(eps[0].title.as_deref(), Some("Pilot"));
    }

    // ── End-to-end: tempdir + wiremock OMDb → seasons + episodes ─────────

    use crate::config::AppContext;
    use crate::db::{find_show_by_imdb_id, get_show_metadata, VideoRow};
    use crate::services::omdb::OmdbClient;
    use std::fs;
    use tempfile::TempDir;
    use wiremock::matchers::{method, path as wm_path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn ctx_with_mock_omdb(server_uri: &str, segment_dir: PathBuf) -> AppContext {
        let db = Db::open(Path::new(":memory:")).expect("db");
        let mut ctx = AppContext::for_tests(db, segment_dir);
        ctx.omdb = Some(OmdbClient::with_base_url(
            reqwest::Client::new(),
            "test-key".to_string(),
            server_uri.to_string(),
        ));
        ctx
    }

    fn seed_episode_video(db: &Db, library_id: &str, file_path: &Path) {
        let id = sha1_path(file_path);
        let row = VideoRow {
            id,
            library_id: library_id.to_string(),
            path: file_path.to_str().unwrap_or_default().to_string(),
            filename: file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string(),
            title: None,
            duration_seconds: 1800.0,
            file_size_bytes: 1_000_000,
            bitrate: 5_000_000,
            scanned_at: "2026-01-01T00:00:00.000Z".to_string(),
            content_fingerprint: format!("1000000:{}", file_path.display()),
            native_resolution: Some("1080p".to_string()),
            film_id: None,
            show_id: None,
            show_season: None,
            show_episode: None,
            role: "main".to_string(),
        };
        crate::db::upsert_video(db, &row).expect("upsert episode video");
    }

    #[tokio::test]
    async fn discover_tv_shows_unions_local_files_and_omdb_canonical() {
        let dir = TempDir::new().expect("tempdir");
        let library_path = dir.path().join("library");
        let show_dir = library_path.join("Show A");
        let season_dir = show_dir.join("Season 1");
        fs::create_dir_all(&season_dir).expect("mkdir");
        let ep1 = season_dir.join("Show.A.S01E01.mkv");
        let ep2 = season_dir.join("Show.A.S01E02.mkv");
        fs::write(&ep1, b"").expect("create ep1");
        fs::write(&ep2, b"").expect("create ep2");

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(wm_path("/"))
            .and(query_param("s", "Show A"))
            .and(query_param("type", "series"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "Search": [{"Title": "Show A", "Year": "2024–", "imdbID": "tt7777777",
                            "Type": "series", "Poster": "https://example.com/sa.jpg"}],
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(query_param("i", "tt7777777"))
            .and(query_param_absent("Season"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "imdbID": "tt7777777",
                "Title": "Show A",
                "Year": "2024–",
                "Genre": "Drama",
                "Director": "N/A",
                "Actors": "Alice, Bob",
                "Plot": "A plot.",
                "imdbRating": "8.5",
                "Poster": "https://example.com/sa.jpg",
                "totalSeasons": "1"
            })))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(query_param("i", "tt7777777"))
            .and(query_param("Season", "1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "Episodes": [
                    {"Title": "Pilot", "Episode": "1", "imdbID": "tt0000001",
                     "Released": "2024-01-01", "imdbRating": "9.0"},
                    {"Title": "Second Step", "Episode": "2", "imdbID": "tt0000002",
                     "Released": "2024-01-08", "imdbRating": "8.7"},
                    {"Title": "Third Step", "Episode": "3", "imdbID": "tt0000003",
                     "Released": "2024-01-15", "imdbRating": "8.9"},
                ],
            })))
            .mount(&server)
            .await;

        let ctx = ctx_with_mock_omdb(&server.uri(), dir.path().join("seg")).await;
        let lib = create_library(
            &ctx.db,
            "TV",
            library_path.to_str().unwrap(),
            "tvShows",
            &[],
        )
        .expect("create library");
        seed_episode_video(&ctx.db, &lib.id, &ep1);
        seed_episode_video(&ctx.db, &lib.id, &ep2);

        discover_tv_shows(&ctx, &lib).await;

        // Show row should exist keyed on imdb_id (canonical after the OMDb match).
        let show = find_show_by_imdb_id(&ctx.db, "tt7777777")
            .expect("query")
            .expect("show row exists post-match");
        let show_id = show.id.clone();

        let seasons = get_seasons_by_show(&ctx.db, &show_id).expect("seasons");
        assert_eq!(seasons.len(), 1);
        assert_eq!(seasons[0].season_number, 1);

        let eps = get_episodes_by_show(&ctx.db, &show_id).expect("episodes");
        assert_eq!(eps.len(), 3);

        let by_num: HashMap<i64, &EpisodeRow> = eps.iter().map(|e| (e.episode_number, e)).collect();
        assert_eq!(by_num.get(&1).unwrap().title.as_deref(), Some("Pilot"));
        assert_eq!(
            by_num.get(&2).unwrap().title.as_deref(),
            Some("Second Step")
        );
        assert_eq!(by_num.get(&3).unwrap().title.as_deref(), Some("Third Step"));

        // Episode files now point at the show via show_id/show_season/show_episode.
        let copies =
            crate::db::get_videos_by_show_episode(&ctx.db, &show_id, 1, 1).expect("ep1 copies");
        assert_eq!(copies.len(), 1);
        assert_eq!(copies[0].path, ep1.to_str().unwrap_or_default());

        let show_meta = get_show_metadata(&ctx.db, &show_id)
            .expect("metadata query")
            .expect("metadata exists");
        assert_eq!(show_meta.imdb_id, "tt7777777");
        assert_eq!(show_meta.title, "Show A");
        assert_eq!(
            show_meta.poster_url.as_deref(),
            Some("https://example.com/sa.jpg")
        );
    }

    #[tokio::test]
    async fn discover_tv_shows_falls_back_to_regex_only_when_omdb_misses() {
        let dir = TempDir::new().expect("tempdir");
        let library_path = dir.path().join("library");
        let show_dir = library_path.join("Unknown Show");
        let season_dir = show_dir.join("S01");
        fs::create_dir_all(&season_dir).expect("mkdir");
        let ep = season_dir.join("Unknown.S01E01.mkv");
        fs::write(&ep, b"").expect("create ep");

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(query_param("s", "Unknown Show"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"Response": "False", "Error": "Series not found!"}),
            ))
            .mount(&server)
            .await;

        let ctx = ctx_with_mock_omdb(&server.uri(), dir.path().join("seg")).await;
        let lib = create_library(
            &ctx.db,
            "TV",
            library_path.to_str().unwrap(),
            "tvShows",
            &[],
        )
        .expect("create library");
        seed_episode_video(&ctx.db, &lib.id, &ep);

        discover_tv_shows(&ctx, &lib).await;

        // Show keyed on parsed_title_key (no imdb_id since OMDb didn't match).
        let show = crate::db::find_show_by_parsed_title_key(&ctx.db, "unknown show|")
            .expect("query")
            .expect("show row exists");
        let show_id = show.id.clone();
        let eps = get_episodes_by_show(&ctx.db, &show_id).expect("episodes");
        assert_eq!(eps.len(), 1);
        assert!(eps[0].title.is_none());

        let copies =
            crate::db::get_videos_by_show_episode(&ctx.db, &show_id, 1, 1).expect("copies");
        assert_eq!(copies.len(), 1);

        // No show_metadata — OMDb didn't match.
        let show_meta = get_show_metadata(&ctx.db, &show_id).expect("query");
        assert!(show_meta.is_none());
    }

    fn query_param_absent(key: &'static str) -> AbsentQueryParamMatcher {
        AbsentQueryParamMatcher { key }
    }

    struct AbsentQueryParamMatcher {
        key: &'static str,
    }

    impl wiremock::Match for AbsentQueryParamMatcher {
        fn matches(&self, request: &wiremock::Request) -> bool {
            !request.url.query_pairs().any(|(k, _)| k == self.key)
        }
    }
}
