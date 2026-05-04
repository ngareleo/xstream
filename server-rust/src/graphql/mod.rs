//! GraphQL schema — async-graphql. SDL is the wire contract (enforced by `scripts/check-sdl-parity.ts`).

pub mod error_logger;
pub mod mutation;
pub mod query;
pub mod scalars;
pub mod subscription;
pub mod types;

use async_graphql::Schema;

use crate::config::AppContext;
use crate::db::Db;
use crate::graphql::error_logger::ErrorLogger;

pub use mutation::Mutation;
pub use query::Query;
pub use subscription::Subscription;

pub type XstreamSchema = Schema<Query, Mutation, Subscription>;

/// Build the GraphQL schema. Holds the DB handle (every resolver reads
/// it) AND the full `AppContext` (used by `start_transcode` to spawn
/// chunker work). Both are cheaply-cloneable handles, so registering
/// twice is no overhead.
pub fn build_schema(app_ctx: AppContext) -> XstreamSchema {
    Schema::build(Query, Mutation, Subscription)
        .data(app_ctx.db.clone())
        .data(app_ctx)
        // ErrorLogger runs inside the per-request http.request span so any
        // tracing::error! it emits inherits the W3C trace context — the
        // resulting Seq event carries the same TraceId as the request.
        .extension(ErrorLogger)
        .finish()
}

// Re-export so callers can `build_schema_from_db` without depending on
// `Db` directly. Used by the integration tests.
#[doc(hidden)]
pub fn build_schema_for_tests(db: Db) -> XstreamSchema {
    let ctx = AppContext::for_tests(db, std::env::temp_dir().join("xstream-rust-test-segments"));
    build_schema(ctx)
}
