//! OMDb HTTP client with title + IMDb-ID lookup and budget tracking.

use std::sync::{Arc, Mutex};

use serde::de::DeserializeOwned;
use serde::Deserialize;
use tracing::warn;

pub const OMDB_BASE_URL: &str = "https://www.omdbapi.com/";

/// Default daily call budget. OMDb's free tier is 1 000 requests/day per
/// IP; the default leaves 200 calls of headroom for ad-hoc / manual-match
/// flows that share the same key.
pub const DEFAULT_DAILY_BUDGET: u32 = 800;

/// Soft-warn threshold — once the remaining budget drops below this, every
/// further call logs a warn so the operator sees the quota draining in Seq.
const BUDGET_WARN_THRESHOLD: u32 = 50;

/// Normalised OMDb result. The fields the scanner persists into
/// `video_metadata`. `None` slots fall through to the SQLite NULL via
/// `Option<T>` → `params!`.
#[derive(Clone, Debug, PartialEq)]
pub struct OmdbResult {
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub actors: Vec<String>,
    pub plot: Option<String>,
    pub imdb_rating: Option<f64>,
    pub poster_url: Option<String>,
}

/// Series search result from OMDb.
#[derive(Clone, Debug, PartialEq)]
pub struct OmdbSeries {
    pub imdb_id: String,
    pub title: String,
    pub year: Option<i64>,
    pub poster_url: Option<String>,
}

/// Full series metadata with season and episode counts.
#[derive(Clone, Debug, PartialEq)]
pub struct OmdbSeriesDetails {
    pub imdb_id: String,
    pub title: String,
    pub total_seasons: i64,
    pub year: Option<i64>,
    pub genre: Option<String>,
    pub director: Option<String>,
    pub actors: Vec<String>,
    pub plot: Option<String>,
    pub imdb_rating: Option<f64>,
    pub poster_url: Option<String>,
}

/// OMDb episode record for a specific season.
#[derive(Clone, Debug, PartialEq)]
pub struct OmdbEpisode {
    pub episode_number: i64,
    pub title: String,
    pub imdb_id: String,
    pub released: Option<String>,
    pub imdb_rating: Option<f64>,
}

/// Verbatim OMDb response shape — see <https://www.omdbapi.com/>. Field
/// names are PascalCase on the wire so we have to spell them out here.
#[derive(Deserialize)]
struct OmdbApiResponse {
    #[serde(rename = "Response")]
    response: String,
    #[serde(rename = "imdbID", default)]
    imdb_id: Option<String>,
    #[serde(rename = "Title", default)]
    title: Option<String>,
    #[serde(rename = "Year", default)]
    year: Option<String>,
    #[serde(rename = "Genre", default)]
    genre: Option<String>,
    #[serde(rename = "Director", default)]
    director: Option<String>,
    #[serde(rename = "Actors", default)]
    actors: Option<String>,
    #[serde(rename = "Plot", default)]
    plot: Option<String>,
    #[serde(rename = "imdbRating", default)]
    imdb_rating: Option<String>,
    #[serde(rename = "Poster", default)]
    poster: Option<String>,
}

#[derive(Deserialize)]
struct OmdbSearchListResponse {
    #[serde(rename = "Response")]
    response: String,
    #[serde(rename = "Search", default)]
    search: Option<Vec<OmdbSearchListItem>>,
}

#[derive(Deserialize)]
struct OmdbSearchListItem {
    #[serde(rename = "imdbID", default)]
    imdb_id: Option<String>,
    #[serde(rename = "Title", default)]
    title: Option<String>,
    #[serde(rename = "Year", default)]
    year: Option<String>,
    #[serde(rename = "Poster", default)]
    poster: Option<String>,
}

#[derive(Deserialize)]
struct OmdbSeriesDetailsResponse {
    #[serde(rename = "Response")]
    response: String,
    #[serde(rename = "imdbID", default)]
    imdb_id: Option<String>,
    #[serde(rename = "Title", default)]
    title: Option<String>,
    #[serde(rename = "Year", default)]
    year: Option<String>,
    #[serde(rename = "Genre", default)]
    genre: Option<String>,
    #[serde(rename = "Director", default)]
    director: Option<String>,
    #[serde(rename = "Actors", default)]
    actors: Option<String>,
    #[serde(rename = "Plot", default)]
    plot: Option<String>,
    #[serde(rename = "imdbRating", default)]
    imdb_rating: Option<String>,
    #[serde(rename = "Poster", default)]
    poster: Option<String>,
    #[serde(rename = "totalSeasons", default)]
    total_seasons: Option<String>,
}

#[derive(Deserialize)]
struct OmdbSeasonResponse {
    #[serde(rename = "Response")]
    response: String,
    #[serde(rename = "Episodes", default)]
    episodes: Option<Vec<OmdbSeasonEpisodeItem>>,
}

#[derive(Deserialize)]
struct OmdbSeasonEpisodeItem {
    #[serde(rename = "Title", default)]
    title: Option<String>,
    #[serde(rename = "Episode", default)]
    episode: Option<String>,
    #[serde(rename = "imdbID", default)]
    imdb_id: Option<String>,
    #[serde(rename = "Released", default)]
    released: Option<String>,
    #[serde(rename = "imdbRating", default)]
    imdb_rating: Option<String>,
}

/// OMDb HTTP client with shared connection pool and daily-budget tracking.
#[derive(Clone)]
pub struct OmdbClient {
    http: reqwest::Client,
    api_key: String,
    base_url: String,
    budget: Arc<Mutex<BudgetState>>,
}

#[derive(Debug)]
struct BudgetState {
    daily_limit: u32,
    used_today: u32,
    /// UTC date of the most recent reset. When `today != last_reset`, the
    /// counter snaps back to zero on the next request.
    last_reset: chrono::NaiveDate,
}

/// Outcome of a budget check at the start of a request.
#[derive(Debug, PartialEq)]
enum BudgetCheck {
    Allowed { remaining: u32 },
    Exhausted,
}

impl OmdbClient {
    /// Production constructor — points at the live OMDb endpoint.
    pub fn production(http: reqwest::Client, api_key: String, daily_budget: u32) -> Self {
        Self::new(http, api_key, OMDB_BASE_URL.to_string(), daily_budget)
    }

    /// Test constructor — points at an arbitrary HTTP base (e.g. the
    /// `wiremock::MockServer::uri()`). Available behind `cfg(test)` only
    /// to keep production callers honest about which constructor they hit.
    #[cfg(test)]
    pub fn with_base_url(http: reqwest::Client, api_key: String, base_url: String) -> Self {
        Self::new(http, api_key, base_url, DEFAULT_DAILY_BUDGET)
    }

    fn new(http: reqwest::Client, api_key: String, base_url: String, daily_budget: u32) -> Self {
        Self {
            http,
            api_key,
            base_url,
            budget: Arc::new(Mutex::new(BudgetState {
                daily_limit: daily_budget,
                used_today: 0,
                last_reset: chrono::Utc::now().date_naive(),
            })),
        }
    }

    /// Try to spend one call from today's budget. Resets the counter on
    /// day-rollover. Returns `Exhausted` when the cap is hit; the caller
    /// short-circuits and skips the HTTP request.
    fn try_decrement_budget(&self) -> BudgetCheck {
        let mut g = match self.budget.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let today = chrono::Utc::now().date_naive();
        if today != g.last_reset {
            g.used_today = 0;
            g.last_reset = today;
        }
        if g.used_today >= g.daily_limit {
            return BudgetCheck::Exhausted;
        }
        g.used_today += 1;
        BudgetCheck::Allowed {
            remaining: g.daily_limit.saturating_sub(g.used_today),
        }
    }

    /// Snapshot of `(used_today, daily_limit)` for the scanner's
    /// per-progress-event payload. Cheap; locks briefly.
    pub fn budget_snapshot(&self) -> (u32, u32) {
        let g = match self.budget.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        (g.used_today, g.daily_limit)
    }

    /// Look up a movie by title (and optional year). Returns `None` for
    /// any of: missing API key, network error, non-2xx response, JSON
    /// parse failure, OMDb `Response: "False"`, or a result that omits
    /// `imdbID`/`Title`. Every non-`None`-on-success branch logs via
    /// `tracing::warn!` so operators see the failure in Seq.
    pub async fn search(&self, title: &str, year: Option<i32>) -> Option<OmdbResult> {
        let mut query: Vec<(&str, String)> =
            vec![("t", title.to_string()), ("type", "movie".to_string())];
        if let Some(y) = year {
            query.push(("y", y.to_string()));
        }
        let parsed: OmdbApiResponse = self.request_json(&query, title).await?;
        map_response(parsed)
    }

    /// Free-text catalogue search across both movies and series — used
    /// by the GraphQL `searchOmdb` resolver behind the DetailPane edit
    /// picker. Returns up to ~10 candidate hits (whatever OMDb's `?s=`
    /// endpoint surfaces in its `Search` array). Optional `year` narrows
    /// the search to that release year. Same network/error handling
    /// shape as `search` and `search_series`: any failure (network,
    /// non-2xx, malformed JSON, "Response: False") collapses to an
    /// empty Vec.
    pub async fn search_list(&self, query_text: &str, year: Option<i32>) -> Vec<OmdbSeries> {
        let mut query: Vec<(&str, String)> = vec![("s", query_text.to_string())];
        if let Some(y) = year {
            query.push(("y", y.to_string()));
        }
        let parsed: Option<OmdbSearchListResponse> = self.request_json(&query, query_text).await;
        let parsed = match parsed {
            Some(p) => p,
            None => return Vec::new(),
        };
        if parsed.response != "True" {
            return Vec::new();
        }
        let results = parsed.search.unwrap_or_default();
        results
            .into_iter()
            .filter_map(|item| {
                Some(OmdbSeries {
                    imdb_id: item.imdb_id?,
                    title: item.title?,
                    year: parse_year(item.year.as_deref()),
                    poster_url: parse_poster(item.poster.as_deref()),
                })
            })
            .collect()
    }

    /// Search the OMDb series catalogue by free-text title. Returns the
    /// top match (the first entry of the `Search` array). The caller can
    /// then chain `series_details(imdb_id)` to fetch `totalSeasons` and
    /// per-season episode lists. Returns `None` for any failure mode
    /// `search` covers (network, non-2xx, malformed JSON, no results).
    pub async fn search_series(&self, title: &str) -> Option<OmdbSeries> {
        let query: Vec<(&str, String)> =
            vec![("s", title.to_string()), ("type", "series".to_string())];
        let parsed: OmdbSearchListResponse = self.request_json(&query, title).await?;
        if parsed.response != "True" {
            return None;
        }
        let mut results = parsed.search?;
        if results.is_empty() {
            return None;
        }
        let top = results.swap_remove(0);
        Some(OmdbSeries {
            imdb_id: top.imdb_id?,
            title: top.title?,
            year: parse_year(top.year.as_deref()),
            poster_url: parse_poster(top.poster.as_deref()),
        })
    }

    /// Fetch full series-level metadata including `totalSeasons`. Used
    /// after `search_series` to drive the per-season fetch loop. Returns
    /// `None` if OMDb has no record for the id, or the response omits
    /// `totalSeasons` (the field that anchors the season fetch loop).
    pub async fn series_details(&self, imdb_id: &str) -> Option<OmdbSeriesDetails> {
        let query: Vec<(&str, String)> = vec![("i", imdb_id.to_string())];
        let parsed: OmdbSeriesDetailsResponse = self.request_json(&query, imdb_id).await?;
        if parsed.response != "True" {
            return None;
        }
        let total_seasons = parsed
            .total_seasons
            .as_deref()
            .and_then(|s| s.parse::<i64>().ok())?;
        Some(OmdbSeriesDetails {
            imdb_id: parsed.imdb_id?,
            title: parsed.title?,
            total_seasons,
            year: parse_year(parsed.year.as_deref()),
            genre: nullable(parsed.genre),
            director: nullable(parsed.director),
            actors: parse_actors(parsed.actors.as_deref()),
            plot: nullable(parsed.plot),
            imdb_rating: parse_rating(parsed.imdb_rating.as_deref()),
            poster_url: parse_poster(parsed.poster.as_deref()),
        })
    }

    /// Fetch the canonical episode list for one season of a series.
    /// Returns `None` when OMDb has no record (e.g. the season hasn't
    /// aired yet, or the id is wrong). Per-episode metadata is the
    /// minimal `{Title, Episode, Released, imdbID, imdbRating}` set —
    /// fuller details require a separate `?i=<episodeImdbID>` call.
    pub async fn season_episodes(
        &self,
        imdb_id: &str,
        season_number: i64,
    ) -> Option<Vec<OmdbEpisode>> {
        let query: Vec<(&str, String)> = vec![
            ("i", imdb_id.to_string()),
            ("Season", season_number.to_string()),
        ];
        let parsed: OmdbSeasonResponse = self.request_json(&query, imdb_id).await?;
        if parsed.response != "True" {
            return None;
        }
        let raw = parsed.episodes.unwrap_or_default();
        let mut out = Vec::with_capacity(raw.len());
        for e in raw {
            let Some(num) = e.episode.as_deref().and_then(|s| s.parse::<i64>().ok()) else {
                continue;
            };
            let Some(title) = e.title else { continue };
            out.push(OmdbEpisode {
                episode_number: num,
                title,
                imdb_id: e.imdb_id.unwrap_or_default(),
                released: nullable(e.released),
                imdb_rating: parse_rating(e.imdb_rating.as_deref()),
            });
        }
        Some(out)
    }

    /// Spend one budget unit, then issue the GET and deserialise into `T`.
    /// All series + movie fetches go through this so the budget guard,
    /// the `apikey` query param, and the failure-shape contract apply
    /// uniformly.
    async fn request_json<T: DeserializeOwned>(
        &self,
        query: &[(&str, String)],
        ctx: &str,
    ) -> Option<T> {
        match self.try_decrement_budget() {
            BudgetCheck::Exhausted => {
                warn!(
                    ctx = %ctx,
                    "omdb: daily budget exhausted — skipping request"
                );
                return None;
            }
            BudgetCheck::Allowed { remaining } => {
                if remaining < BUDGET_WARN_THRESHOLD {
                    warn!(
                        remaining,
                        ctx = %ctx,
                        "omdb: daily budget nearly exhausted"
                    );
                }
            }
        }

        let mut full_query: Vec<(&str, String)> = query.to_vec();
        full_query.push(("apikey", self.api_key.clone()));

        let request = match self.http.get(&self.base_url).query(&full_query).build() {
            Ok(req) => req,
            Err(err) => {
                warn!(error = %err, ctx = %ctx, "omdb: failed to build request");
                return None;
            }
        };

        let response = match self.http.execute(request).await {
            Ok(r) => r,
            Err(err) => {
                warn!(error = %err, ctx = %ctx, "omdb: network error");
                return None;
            }
        };

        if !response.status().is_success() {
            warn!(
                status = response.status().as_u16(),
                ctx = %ctx,
                "omdb: non-2xx response"
            );
            return None;
        }

        match response.json::<T>().await {
            Ok(p) => Some(p),
            Err(err) => {
                warn!(error = %err, ctx = %ctx, "omdb: malformed JSON response");
                None
            }
        }
    }
}

/// `True` → projected fields; anything else → `None`. Tests can call
/// this directly without standing up an HTTP server.
fn map_response(api: OmdbApiResponse) -> Option<OmdbResult> {
    if api.response != "True" {
        return None;
    }
    let imdb_id = api.imdb_id?;
    let title = api.title?;
    Some(OmdbResult {
        imdb_id,
        title,
        year: parse_year(api.year.as_deref()),
        genre: nullable(api.genre),
        director: nullable(api.director),
        actors: parse_actors(api.actors.as_deref()),
        plot: nullable(api.plot),
        imdb_rating: parse_rating(api.imdb_rating.as_deref()),
        poster_url: parse_poster(api.poster.as_deref()),
    })
}

fn parse_year(raw: Option<&str>) -> Option<i64> {
    let r = raw?;
    // Take the first four chars and parse — handles OMDb's open-ended
    // year ranges for TV shows like "2024–".
    let head: String = r.chars().take(4).collect();
    head.parse::<i64>().ok()
}

fn parse_rating(raw: Option<&str>) -> Option<f64> {
    let r = raw?;
    if r == "N/A" {
        return None;
    }
    r.parse::<f64>().ok()
}

fn parse_poster(raw: Option<&str>) -> Option<String> {
    let r = raw?;
    if r == "N/A" || r.is_empty() {
        return None;
    }
    Some(r.to_string())
}

fn parse_actors(raw: Option<&str>) -> Vec<String> {
    let Some(r) = raw else { return Vec::new() };
    if r == "N/A" {
        return Vec::new();
    }
    r.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Treat `None`, empty string, and the literal `"N/A"` as absent.
fn nullable(raw: Option<String>) -> Option<String> {
    let r = raw?;
    if r == "N/A" || r.is_empty() {
        None
    } else {
        Some(r)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn full_response_json(imdb_id: &str, title: &str, year: &str) -> serde_json::Value {
        serde_json::json!({
            "Response": "True",
            "imdbID": imdb_id,
            "Title": title,
            "Year": year,
            "Genre": "Drama, Sci-Fi",
            "Director": "Some Director",
            "Actors": "Alice, Bob, Carol",
            "Plot": "A plot.",
            "imdbRating": "8.2",
            "Poster": "https://example.com/p.jpg"
        })
    }

    fn make_client(base_url: String) -> OmdbClient {
        OmdbClient::with_base_url(reqwest::Client::new(), "test-key".to_string(), base_url)
    }

    #[test]
    fn parse_year_takes_first_four_digits() {
        assert_eq!(parse_year(Some("2024")), Some(2024));
        assert_eq!(parse_year(Some("2024–")), Some(2024));
        assert_eq!(parse_year(Some("2024–2026")), Some(2024));
        assert_eq!(parse_year(Some("N/A")), None);
        assert_eq!(parse_year(None), None);
    }

    #[test]
    fn parse_rating_handles_na_and_floats() {
        assert_eq!(parse_rating(Some("8.5")), Some(8.5));
        assert_eq!(parse_rating(Some("N/A")), None);
        assert_eq!(parse_rating(None), None);
        assert_eq!(parse_rating(Some("garbage")), None);
    }

    #[test]
    fn parse_poster_drops_na_and_empty() {
        assert_eq!(
            parse_poster(Some("https://x/p.jpg")).as_deref(),
            Some("https://x/p.jpg")
        );
        assert_eq!(parse_poster(Some("N/A")), None);
        assert_eq!(parse_poster(Some("")), None);
        assert_eq!(parse_poster(None), None);
    }

    #[test]
    fn parse_actors_splits_on_comma_and_trims() {
        assert_eq!(
            parse_actors(Some("Alice, Bob,Carol , Dave")),
            vec![
                "Alice".to_string(),
                "Bob".to_string(),
                "Carol".to_string(),
                "Dave".to_string(),
            ]
        );
        assert!(parse_actors(Some("N/A")).is_empty());
        assert!(parse_actors(None).is_empty());
        assert!(parse_actors(Some("")).is_empty());
    }

    #[test]
    fn nullable_treats_na_and_empty_as_none() {
        assert_eq!(
            nullable(Some("Drama".to_string())),
            Some("Drama".to_string())
        );
        assert!(nullable(Some("N/A".to_string())).is_none());
        assert!(nullable(Some("".to_string())).is_none());
        assert!(nullable(None).is_none());
    }

    #[test]
    fn map_response_returns_full_result_on_true_with_all_fields() {
        let api: OmdbApiResponse =
            serde_json::from_value(full_response_json("tt1234567", "Dune", "2021")).expect("json");
        let r = map_response(api).expect("Some");
        assert_eq!(r.imdb_id, "tt1234567");
        assert_eq!(r.title, "Dune");
        assert_eq!(r.year, Some(2021));
        assert_eq!(r.genre.as_deref(), Some("Drama, Sci-Fi"));
        assert_eq!(r.director.as_deref(), Some("Some Director"));
        assert_eq!(r.actors, vec!["Alice", "Bob", "Carol"]);
        assert_eq!(r.imdb_rating, Some(8.2));
        assert_eq!(r.poster_url.as_deref(), Some("https://example.com/p.jpg"));
    }

    #[test]
    fn map_response_returns_none_on_false_response() {
        let api: OmdbApiResponse = serde_json::from_value(
            serde_json::json!({"Response": "False", "Error": "Movie not found!"}),
        )
        .expect("json");
        assert!(map_response(api).is_none());
    }

    #[test]
    fn map_response_returns_none_when_imdb_id_missing() {
        let api: OmdbApiResponse =
            serde_json::from_value(serde_json::json!({"Response": "True", "Title": "X"}))
                .expect("json");
        assert!(map_response(api).is_none());
    }

    #[test]
    fn map_response_treats_na_fields_as_none() {
        let api: OmdbApiResponse = serde_json::from_value(serde_json::json!({
            "Response": "True", "imdbID": "tt1", "Title": "X",
            "Year": "2020", "Genre": "N/A", "Director": "N/A",
            "Actors": "N/A", "Plot": "N/A", "imdbRating": "N/A", "Poster": "N/A"
        }))
        .expect("json");
        let r = map_response(api).expect("Some");
        assert!(r.genre.is_none());
        assert!(r.director.is_none());
        assert!(r.actors.is_empty());
        assert!(r.plot.is_none());
        assert!(r.imdb_rating.is_none());
        assert!(r.poster_url.is_none());
    }

    #[tokio::test]
    async fn search_returns_some_for_true_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("t", "Dune"))
            .and(query_param("apikey", "test-key"))
            .and(query_param("type", "movie"))
            .respond_with(ResponseTemplate::new(200).set_body_json(full_response_json(
                "tt1160419",
                "Dune",
                "2021",
            )))
            .mount(&server)
            .await;

        let client = make_client(server.uri());
        let result = client.search("Dune", None).await.expect("Some");
        assert_eq!(result.imdb_id, "tt1160419");
    }

    #[tokio::test]
    async fn search_passes_year_when_provided() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("y", "2021"))
            .respond_with(ResponseTemplate::new(200).set_body_json(full_response_json(
                "tt1160419",
                "Dune",
                "2021",
            )))
            .expect(1)
            .mount(&server)
            .await;

        let client = make_client(server.uri());
        let _ = client.search("Dune", Some(2021)).await;
        // Mock's `.expect(1)` is asserted on drop — if year was missing the
        // request wouldn't match and the mock would fail.
    }

    #[tokio::test]
    async fn search_returns_none_for_false_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(
                    serde_json::json!({"Response":"False","Error":"Movie not found!"}),
                ),
            )
            .mount(&server)
            .await;

        let client = make_client(server.uri());
        assert!(client.search("Nonexistent", None).await.is_none());
    }

    #[tokio::test]
    async fn search_returns_none_for_non_2xx_status() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(503))
            .mount(&server)
            .await;

        let client = make_client(server.uri());
        // Per §14: failure must be observable. The function returns None;
        // a `tracing::warn!` fires (not asserted here, but exercised — the
        // test would panic if the warn macro called .expect or similar).
        assert!(client.search("Anything", None).await.is_none());
    }

    #[tokio::test]
    async fn search_returns_none_on_malformed_json() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string("not-json"))
            .mount(&server)
            .await;

        let client = make_client(server.uri());
        assert!(client.search("Anything", None).await.is_none());
    }

    #[tokio::test]
    async fn search_returns_none_on_unreachable_host() {
        // Point the client at a port nothing is listening on so the
        // request fails at the connect stage. 127.0.0.1:1 is reserved
        // and nearly always closed.
        let client = make_client("http://127.0.0.1:1".to_string());
        assert!(client.search("Anything", None).await.is_none());
    }

    #[tokio::test]
    async fn search_series_returns_top_match() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("s", "Breaking Bad"))
            .and(query_param("type", "series"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "Search": [
                    {"Title": "Breaking Bad", "Year": "2008–2013", "imdbID": "tt0903747",
                     "Type": "series", "Poster": "https://example.com/bb.jpg"},
                    {"Title": "Breaking Bad: Original Minisodes", "Year": "2009",
                     "imdbID": "tt9999999", "Type": "series", "Poster": "N/A"},
                ],
            })))
            .mount(&server)
            .await;
        let client = make_client(server.uri());
        let result = client.search_series("Breaking Bad").await.expect("Some");
        assert_eq!(result.imdb_id, "tt0903747");
        assert_eq!(result.title, "Breaking Bad");
        assert_eq!(result.year, Some(2008));
        assert_eq!(
            result.poster_url.as_deref(),
            Some("https://example.com/bb.jpg")
        );
    }

    #[tokio::test]
    async fn search_series_returns_none_for_empty_search_array() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"Response": "False", "Error": "Series not found!"}),
            ))
            .mount(&server)
            .await;
        let client = make_client(server.uri());
        assert!(client.search_series("Nonexistent").await.is_none());
    }

    #[tokio::test]
    async fn series_details_parses_total_seasons() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("i", "tt0903747"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "imdbID": "tt0903747",
                "Title": "Breaking Bad",
                "Year": "2008–2013",
                "Genre": "Crime, Drama, Thriller",
                "Director": "N/A",
                "Actors": "Bryan Cranston, Aaron Paul",
                "Plot": "A high school chemistry teacher…",
                "imdbRating": "9.5",
                "Poster": "https://example.com/bb.jpg",
                "totalSeasons": "5"
            })))
            .mount(&server)
            .await;
        let client = make_client(server.uri());
        let r = client.series_details("tt0903747").await.expect("Some");
        assert_eq!(r.total_seasons, 5);
        assert_eq!(r.title, "Breaking Bad");
        assert_eq!(r.year, Some(2008));
        assert_eq!(r.actors, vec!["Bryan Cranston", "Aaron Paul"]);
        assert_eq!(r.imdb_rating, Some(9.5));
        // N/A director should fall through to None.
        assert!(r.director.is_none());
    }

    #[tokio::test]
    async fn series_details_returns_none_when_total_seasons_missing() {
        // OMDb sometimes returns Response=True but no totalSeasons on
        // shows it doesn't fully index. The discovery loop needs that
        // field to drive per-season fetches; without it we treat the
        // call as a miss.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(
                serde_json::json!({"Response": "True", "imdbID": "tt1", "Title": "X"}),
            ))
            .mount(&server)
            .await;
        let client = make_client(server.uri());
        assert!(client.series_details("tt1").await.is_none());
    }

    #[tokio::test]
    async fn season_episodes_returns_canonical_list() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/"))
            .and(query_param("i", "tt0903747"))
            .and(query_param("Season", "1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "Title": "Breaking Bad",
                "Season": "1",
                "totalSeasons": "5",
                "Episodes": [
                    {"Title": "Pilot", "Released": "2008-01-20", "Episode": "1",
                     "imdbRating": "9.0", "imdbID": "tt0959621"},
                    {"Title": "Cat's in the Bag…", "Released": "2008-01-27", "Episode": "2",
                     "imdbRating": "8.7", "imdbID": "tt1054724"},
                ],
            })))
            .mount(&server)
            .await;
        let client = make_client(server.uri());
        let eps = client.season_episodes("tt0903747", 1).await.expect("Some");
        assert_eq!(eps.len(), 2);
        assert_eq!(eps[0].episode_number, 1);
        assert_eq!(eps[0].title, "Pilot");
        assert_eq!(eps[0].imdb_id, "tt0959621");
        assert_eq!(eps[0].imdb_rating, Some(9.0));
        assert_eq!(eps[0].released.as_deref(), Some("2008-01-20"));
    }

    #[tokio::test]
    async fn season_episodes_skips_entries_with_unparseable_episode_number() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Response": "True",
                "Episodes": [
                    {"Title": "Special", "Episode": "garbage", "imdbID": "tt1"},
                    {"Title": "Real", "Episode": "1", "imdbID": "tt2"},
                ],
            })))
            .mount(&server)
            .await;
        let client = make_client(server.uri());
        let eps = client.season_episodes("tt1", 1).await.expect("Some");
        assert_eq!(eps.len(), 1);
        assert_eq!(eps[0].episode_number, 1);
    }

    fn make_client_with_budget(base_url: String, daily_budget: u32) -> OmdbClient {
        OmdbClient::new(
            reqwest::Client::new(),
            "test-key".to_string(),
            base_url,
            daily_budget,
        )
    }

    #[tokio::test]
    async fn budget_decrements_per_call_and_blocks_after_exhaustion() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(full_response_json("tt1", "X", "2020")),
            )
            .mount(&server)
            .await;

        let client = make_client_with_budget(server.uri(), 2);
        // Two allowed calls.
        assert!(client.search("X", None).await.is_some());
        assert!(client.search("X", None).await.is_some());
        // Third blocked by the budget guard — short-circuits before HTTP.
        assert!(client.search("X", None).await.is_none());
        let (used, limit) = client.budget_snapshot();
        assert_eq!(used, 2);
        assert_eq!(limit, 2);
    }

    #[test]
    fn budget_resets_on_day_rollover() {
        // Construct a client with the last_reset stamped to yesterday and
        // used_today already at the cap. The next try_decrement should
        // reset both fields and allow the call through.
        let client = OmdbClient::new(
            reqwest::Client::new(),
            "k".to_string(),
            "http://unused".to_string(),
            5,
        );
        {
            let mut g = client.budget.lock().expect("lock");
            g.used_today = 5;
            g.last_reset = chrono::Utc::now()
                .date_naive()
                .pred_opt()
                .expect("yesterday");
        }
        assert!(matches!(
            client.try_decrement_budget(),
            BudgetCheck::Allowed { remaining: 4 }
        ));
        let (used, limit) = client.budget_snapshot();
        assert_eq!((used, limit), (1, 5));
    }
}
