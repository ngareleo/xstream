# Resolution Ladder

`RESOLUTION_PROFILES` in `server-rust/src/config.rs` defines 240p → 4K with bitrate targets, keyed by the `Resolution` enum.

The `Resolution` enum is the single source of truth for both the internal config map and the GraphQL surface:

- The enum itself + the `#[derive(async_graphql::Enum)]` GraphQL declaration live in `server-rust/src/graphql/scalars.rs`.
- The `RESOLUTION_PROFILES` keyed lookup lives in `server-rust/src/config.rs`.

Because the same enum drives both, the GraphQL surface and the internal lookup cannot drift. Adding a variant requires extending both `Resolution::from_str` / `as_str` (in `scalars.rs`) and the `RESOLUTION_PROFILES` table (in `config.rs`); the compiler does not force this — the test in `scalars.rs` does (round-trip every variant through `from_str`/`as_str`).
