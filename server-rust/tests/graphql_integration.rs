//! GraphQL API integration tests.
//!
//! Mirrors `server/src/graphql/__tests__/graphql.integration.test.ts`. Bun's
//! version went through `yoga.fetch(new Request(...))` to exercise the
//! HTTP shape; here we drive `XstreamSchema::execute` directly because the
//! axum handler is a thin wrapper over the schema (the HTTP shape is
//! covered by the e2e Playwright test the user already runs).
//!
//! One Step-1 caveat: `startTranscode` returns `INTERNAL` (the chunker is
//! Step 2), not `VIDEO_NOT_FOUND` like the Bun side — so the typed-error
//! union test asserts the Step-1 contract. When the chunker port lands,
//! this test should be updated to assert `VIDEO_NOT_FOUND` for an unknown
//! video and reinstate the cap-rejection / probe / encode error variants.

use std::path::Path;

use async_graphql::{value, Variables};
use futures_util::StreamExt;
use serde_json::Value;
use xstream_server::db::{create_library, Db};
use xstream_server::relay::to_global_id;

fn fresh_seeded_db() -> Db {
    let db = Db::open(Path::new(":memory:")).expect("open in-memory db");
    create_library(&db, "Test Library", "/tmp/gql-test-library", "movies", &[])
        .expect("seed library");
    // The test library's id is sha1("/tmp/gql-test-library"); we re-derive it
    // below where the test needs the global ID. A test video would need a
    // direct INSERT (no upsert_video in the read-only Step 1 surface) — only
    // tests that need it seed it locally.
    db
}

fn seed_test_video(db: &Db, library_id: &str, video_id: &str, title: &str) {
    use rusqlite::params;
    db.with(|c| {
        c.execute(
            "INSERT INTO videos
             (id, library_id, path, filename, title, duration_seconds,
              file_size_bytes, bitrate, scanned_at, content_fingerprint)
             VALUES (?1, ?2, ?3, ?4, ?5, 120.0, 1024, 5000000,
                     '2026-01-01T00:00:00.000Z', '1024:abc')",
            params![
                video_id,
                library_id,
                format!("/tmp/{video_id}.mp4"),
                format!("{video_id}.mp4"),
                title,
            ],
        )?;
        Ok(())
    })
    .expect("seed video");
}

#[tokio::test]
async fn introspection_responds_with_the_schema() {
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let response = schema.execute("{ __schema { queryType { name } } }").await;
    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    let json: Value = serde_json::to_value(&response.data).expect("data serialises to JSON");
    assert_eq!(json["__schema"]["queryType"]["name"], "Query");
}

#[tokio::test]
async fn libraries_query_includes_seeded_library() {
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let response = schema.execute("{ libraries { id name } }").await;
    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    let json: Value = serde_json::to_value(&response.data).expect("data serialises to JSON");
    let names: Vec<&str> = json["libraries"]
        .as_array()
        .expect("libraries is array")
        .iter()
        .filter_map(|l| l["name"].as_str())
        .collect();
    assert!(names.contains(&"Test Library"));
}

#[tokio::test]
async fn library_id_is_a_valid_relay_global_id() {
    use xstream_server::db::sha1_hex;
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let local_id = sha1_hex("/tmp/gql-test-library");
    let global_id = to_global_id("Library", &local_id);

    let query = r#"query ($id: ID!) { node(id: $id) { id ... on Library { name } } }"#;
    let mut vars = Variables::default();
    vars.insert(async_graphql::Name::new("id"), value!(global_id.as_str()));
    let response = schema
        .execute(async_graphql::Request::new(query).variables(vars))
        .await;
    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    let json: Value = serde_json::to_value(&response.data).expect("data serialises to JSON");
    let returned = json["node"]["id"].as_str().expect("id present");

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let decoded = String::from_utf8(STANDARD.decode(returned).expect("base64")).expect("utf8");
    assert_eq!(decoded, format!("Library:{local_id}"));
}

#[tokio::test]
async fn node_query_resolves_a_library_by_global_id() {
    use xstream_server::db::sha1_hex;
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let local_id = sha1_hex("/tmp/gql-test-library");
    let global_id = to_global_id("Library", &local_id);

    let query = r#"query ($id: ID!) { node(id: $id) { ... on Library { name } } }"#;
    let mut vars = Variables::default();
    vars.insert(async_graphql::Name::new("id"), value!(global_id.as_str()));
    let response = schema
        .execute(async_graphql::Request::new(query).variables(vars))
        .await;
    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    let json: Value = serde_json::to_value(&response.data).expect("data serialises to JSON");
    assert_eq!(json["node"]["name"], "Test Library");
}

#[tokio::test]
async fn video_query_returns_a_video_by_global_id() {
    use xstream_server::db::sha1_hex;
    let db = fresh_seeded_db();
    let library_id = sha1_hex("/tmp/gql-test-library");
    seed_test_video(&db, &library_id, "gql-vid1", "Test Movie");
    let schema = xstream_server::graphql::build_schema_for_tests(db);

    let global_id = to_global_id("Video", "gql-vid1");
    let query = r#"query ($id: ID!) { video(id: $id) { id title durationSeconds } }"#;
    let mut vars = Variables::default();
    vars.insert(async_graphql::Name::new("id"), value!(global_id.as_str()));
    let response = schema
        .execute(async_graphql::Request::new(query).variables(vars))
        .await;
    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);
    let json: Value = serde_json::to_value(&response.data).expect("data serialises to JSON");
    assert_eq!(json["video"]["title"], "Test Movie");
    assert_eq!(json["video"]["durationSeconds"], 120.0);
}

#[tokio::test]
async fn unknown_field_returns_a_descriptive_error() {
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let response = schema.execute("{ nonexistentField }").await;
    assert!(!response.errors.is_empty());
    assert!(
        response.errors[0].message.contains("nonexistentField")
            || response.errors[0]
                .message
                .to_lowercase()
                .contains("nonexistentfield"),
        "expected error to mention nonexistentField, got: {}",
        response.errors[0].message
    );
}

#[tokio::test]
async fn library_scan_updated_emits_initial_state_immediately() {
    // The settings page relies on the initial-state emission to render
    // "scanning: false" on connect without waiting for a transition.
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let mut stream = schema.execute_stream(r#"subscription { libraryScanUpdated { scanning } }"#);
    let first = tokio::time::timeout(std::time::Duration::from_secs(2), stream.next())
        .await
        .expect("first emission arrives within 2s")
        .expect("stream produces at least one item");
    assert!(first.errors.is_empty(), "errors: {:?}", first.errors);
    let json: Value = serde_json::to_value(&first.data).expect("data serialises");
    assert_eq!(json["libraryScanUpdated"]["scanning"], false);
}

#[tokio::test]
async fn create_library_spawns_background_scan_that_flips_scanning_true_then_false() {
    // Mirrors the Bun behaviour at `server/src/graphql/resolvers/mutation.ts:115-118`
    // — `createLibrary` returns immediately AND fires a fire-and-forget
    // scan. The user-visible regression that motivated the port: a freshly
    // added profile must auto-index without the user clicking "Scan All".
    //
    // The for-tests AppContext stubs ffprobe at `/bin/true`, so per-file
    // probes fail and no video rows get written. That's fine for this test
    // — we only assert the scan-state lifecycle (false → true → false).
    use std::fs;
    use tempfile::TempDir;

    let dir = TempDir::new().expect("tempdir");
    fs::write(dir.path().join("a.mkv"), b"fake video data").expect("write fixture");
    let library_path = dir.path().to_str().expect("utf8 path").to_string();

    let schema = xstream_server::graphql::build_schema_for_tests(
        Db::open(Path::new(":memory:")).expect("db"),
    );

    // Subscribe BEFORE the mutation so we don't miss the initial transition.
    let mut sub_stream =
        schema.execute_stream(r#"subscription { libraryScanUpdated { scanning } }"#);
    let initial = tokio::time::timeout(std::time::Duration::from_secs(2), sub_stream.next())
        .await
        .expect("initial emission arrives")
        .expect("stream open");
    let json: Value = serde_json::to_value(&initial.data).expect("data");
    assert_eq!(json["libraryScanUpdated"]["scanning"], false);

    // Fire createLibrary — its tokio::spawn'd scan should flip scanning to
    // true within a few ticks of the runtime, then back to false.
    let mutation = r#"
        mutation ($name: String!, $path: String!, $mediaType: MediaType!, $extensions: [String!]!) {
            createLibrary(name: $name, path: $path, mediaType: $mediaType, extensions: $extensions) {
                id
            }
        }
    "#;
    let mut vars = Variables::default();
    vars.insert(async_graphql::Name::new("name"), value!("Spawned"));
    vars.insert(
        async_graphql::Name::new("path"),
        value!(library_path.as_str()),
    );
    vars.insert(async_graphql::Name::new("mediaType"), value!("MOVIES"));
    let extensions: Vec<async_graphql::Value> = vec![value!(".mkv"), value!(".mp4")];
    vars.insert(
        async_graphql::Name::new("extensions"),
        async_graphql::Value::List(extensions),
    );
    let response = schema
        .execute(async_graphql::Request::new(mutation).variables(vars))
        .await;
    assert!(response.errors.is_empty(), "errors: {:?}", response.errors);

    // Walk the subscription forward, tolerating any number of redundant
    // emissions, until we observe scanning=true and then scanning=false.
    // Bounded total budget so a missed transition surfaces as a failure.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let mut saw_true = false;
    let mut saw_false_after_true = false;
    while std::time::Instant::now() < deadline && !saw_false_after_true {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        match tokio::time::timeout(remaining, sub_stream.next()).await {
            Ok(Some(payload)) => {
                let json: Value = serde_json::to_value(&payload.data).expect("data");
                let scanning = json["libraryScanUpdated"]["scanning"].as_bool();
                if scanning == Some(true) {
                    saw_true = true;
                }
                if saw_true && scanning == Some(false) {
                    saw_false_after_true = true;
                }
            }
            Ok(None) => break,
            Err(_) => break,
        }
    }
    assert!(
        saw_true,
        "scanning never flipped to true after createLibrary"
    );
    assert!(
        saw_false_after_true,
        "scanning never flipped back to false after the scan"
    );
}

#[tokio::test]
async fn start_transcode_returns_video_not_found_for_unknown_id() {
    // Step 2: the chunker is wired. An unknown video id resolves to a
    // typed VIDEO_NOT_FOUND PlaybackError. Capacity-exhausted / probe-
    // failure / encode-failure variants exercise the chunker in the
    // encode-pipeline integration tests (gated on XSTREAM_TEST_MEDIA_DIR).
    let schema = xstream_server::graphql::build_schema_for_tests(fresh_seeded_db());
    let fake_global_id = to_global_id("Video", "does-not-exist");

    let query = r#"
        mutation ($videoId: ID!, $resolution: Resolution!) {
            startTranscode(videoId: $videoId, resolution: $resolution) {
                __typename
                ... on TranscodeJob { id }
                ... on PlaybackError { code message retryable retryAfterMs }
            }
        }
    "#;
    let mut vars = Variables::default();
    vars.insert(
        async_graphql::Name::new("videoId"),
        value!(fake_global_id.as_str()),
    );
    vars.insert(
        async_graphql::Name::new("resolution"),
        value!("RESOLUTION_240P"),
    );

    let response = schema
        .execute(async_graphql::Request::new(query).variables(vars))
        .await;
    assert!(
        response.errors.is_empty(),
        "playback-path mutations must return typed errors via the union, never errors[]: {:?}",
        response.errors
    );
    let json: Value = serde_json::to_value(&response.data).expect("data serialises to JSON");
    assert_eq!(json["startTranscode"]["__typename"], "PlaybackError");
    assert_eq!(json["startTranscode"]["code"], "VIDEO_NOT_FOUND");
    assert_eq!(json["startTranscode"]["retryable"], false);
    assert!(json["startTranscode"]["retryAfterMs"].is_null());
}
