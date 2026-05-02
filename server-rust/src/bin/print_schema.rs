//! Emits the GraphQL SDL for the Rust server's schema to stdout.
//!
//! Used by `bun run --filter client relay` to feed `relay-compiler` —
//! the SDL is the authoritative wire contract; the client's relay
//! artefacts are derived from it. Also used in CI to refresh
//! `server-rust/schema.graphql` before the relay step runs.
//!
//! No `AppContext` is required: async-graphql's `Schema::sdl()` only
//! depends on the type structure (Query / Mutation / Subscription),
//! not on the `data` registrations.

use async_graphql::Schema;
use xstream_server::graphql::{Mutation, Query, Subscription};

fn main() {
    let schema = Schema::build(Query, Mutation, Subscription).finish();
    print!("{}", schema.sdl());
}
