//! GraphQL schema — async-graphql replacement for the Bun `graphql-yoga`
//! surface in `server/src/graphql/`. SDL parity with `schema.ts` is the
//! Step 1 acceptance gate (see `scripts/check-sdl-parity.ts`).

pub mod mutation;
pub mod query;
pub mod scalars;
pub mod subscription;
pub mod types;

use async_graphql::Schema;

use crate::db::Db;

pub use mutation::Mutation;
pub use query::Query;
pub use subscription::Subscription;

pub type XstreamSchema = Schema<Query, Mutation, Subscription>;

pub fn build_schema(db: Db) -> XstreamSchema {
    Schema::build(Query, Mutation, Subscription)
        .data(db)
        .finish()
}
