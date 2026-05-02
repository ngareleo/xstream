# Resolution Ladder

`RESOLUTION_PROFILES` in `server-rust/src/config.rs` defines 240p → 4K with bitrate targets.

The Resolution enum is mirrored in two places that **change together**:

- `server-rust/src/graphql/scalars.rs` — internal `Resolution` enum + `RESOLUTION_PROFILES` map
- `server-rust/src/graphql/types.rs` — GraphQL enum declaration via async-graphql derives

The single Rust enum is the source of truth for both the internal config map and the GraphQL surface; the async-graphql derive enforces a one-to-one mapping at compile time. Adding a variant to one without the other will not compile.
