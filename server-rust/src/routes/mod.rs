//! HTTP routes — `/stream/:job_id` (Step 2). The GraphQL surface is
//! mounted directly via `async-graphql-axum` and lives in `graphql/`,
//! not here.

pub mod stream;
