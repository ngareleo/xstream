//! Emits the GraphQL SDL for the Rust server's schema — feeds relay-compiler and CI refresh cycle.

use async_graphql::Schema;
use xstream_server::graphql::{Mutation, Query, Subscription};

fn main() {
    let schema = Schema::build(Query, Mutation, Subscription).finish();
    print!("{}", schema.sdl());
}
