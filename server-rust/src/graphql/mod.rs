//! GraphQL schema — async-graphql replacement for the Bun `graphql-yoga`
//! surface in `server/src/graphql/`. SDL parity with `schema.ts` is the
//! Step 1 acceptance gate (see `scripts/check-sdl-parity.ts`).

pub mod error_logger;
pub mod mutation;
pub mod query;
pub mod scalars;
pub mod subscription;
pub mod types;

use async_graphql::Schema;

use crate::db::Db;
use crate::graphql::error_logger::ErrorLogger;

pub use mutation::Mutation;
pub use query::Query;
pub use subscription::Subscription;

pub type XstreamSchema = Schema<Query, Mutation, Subscription>;

pub fn build_schema(db: Db) -> XstreamSchema {
    Schema::build(Query, Mutation, Subscription)
        .data(db)
        // ErrorLogger runs inside the per-request http.request span so any
        // tracing::error! it emits inherits the W3C trace context — the
        // resulting Seq event carries the same TraceId as the request.
        .extension(ErrorLogger)
        .finish()
}
