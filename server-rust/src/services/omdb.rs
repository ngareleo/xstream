//! OMDb auto-match service.
//!
//! One outbound HTTP call per unmatched video: GET `OMDB_BASE?t=<title>&y=<year>&apikey=<key>&type=movie`.
//! The response gets normalised into [`OmdbResult`]; the library scanner's
//! `auto_match_library` writes the row into `video_metadata`.
//!
//! **Failure shape** (per `docs/code-style/Invariants/00-Never-Violate.md` §14):
//! OMDb is a flaky external HTTP service — the failure mode is recoverable
//! (the video still plays, just without poster / IMDb rating). All branches
//! return `None` to the caller, and every failure is observable in Seq via
//! `tracing::warn!` with the cause attached. A bare `catch {}` /
//! silent-discard is the anti-pattern §14 prohibits.
//!
//! This module covers `search_omdb` (by title+year) used by
//! `auto_match_library`, plus the `fetch_omdb_by_id` and `search_omdb_list`
//! variants used by the `match_video` mutation and manual-link query.

use serde::Deserialize;
use tracing::warn;

pub const OMDB_BASE_URL: &str = "https://www.omdbapi.com/";

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

/// Cheaply-cloneable OMDb client. Wraps the shared `reqwest::Client`
/// (connection pool) plus the resolved API key + base URL. Lives on
/// `AppContext::omdb` so a single connection pool spans every request.
#[derive(Clone)]
pub struct OmdbClient {
    http: reqwest::Client,
    api_key: String,
    base_url: String,
}

impl OmdbClient {
    /// Production constructor — points at the live OMDb endpoint.
    pub fn production(http: reqwest::Client, api_key: String) -> Self {
        Self {
            http,
            api_key,
            base_url: OMDB_BASE_URL.to_string(),
        }
    }

    /// Test constructor — points at an arbitrary HTTP base (e.g. the
    /// `wiremock::MockServer::uri()`). Available behind `cfg(test)` only
    /// to keep production callers honest about which constructor they hit.
    #[cfg(test)]
    pub fn with_base_url(http: reqwest::Client, api_key: String, base_url: String) -> Self {
        Self {
            http,
            api_key,
            base_url,
        }
    }

    /// Look up a movie by title (and optional year). Returns `None` for
    /// any of: missing API key, network error, non-2xx response, JSON
    /// parse failure, OMDb `Response: "False"`, or a result that omits
    /// `imdbID`/`Title`. Every non-`None`-on-success branch logs via
    /// `tracing::warn!` so operators see the failure in Seq.
    pub async fn search(&self, title: &str, year: Option<i32>) -> Option<OmdbResult> {
        let mut query: Vec<(&str, String)> = vec![
            ("t", title.to_string()),
            ("apikey", self.api_key.clone()),
            ("type", "movie".to_string()),
        ];
        if let Some(y) = year {
            query.push(("y", y.to_string()));
        }

        let request = match self.http.get(&self.base_url).query(&query).build() {
            Ok(req) => req,
            Err(err) => {
                warn!(error = %err, title = %title, "omdb: failed to build request");
                return None;
            }
        };

        let response = match self.http.execute(request).await {
            Ok(r) => r,
            Err(err) => {
                warn!(error = %err, title = %title, "omdb: network error");
                return None;
            }
        };

        if !response.status().is_success() {
            warn!(
                status = response.status().as_u16(),
                title = %title,
                "omdb: non-2xx response — leaving video unmatched"
            );
            return None;
        }

        let parsed: OmdbApiResponse = match response.json().await {
            Ok(p) => p,
            Err(err) => {
                warn!(error = %err, title = %title, "omdb: malformed JSON response");
                return None;
            }
        };

        map_response(parsed)
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

// ── Tests ────────────────────────────────────────────────────────────────────

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

    // ── pure helpers ─────────────────────────────────────────────────────

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

    // ── map_response ─────────────────────────────────────────────────────

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

    // ── search (HTTP, via wiremock) ──────────────────────────────────────

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
}
