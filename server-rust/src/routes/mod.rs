//! HTTP routes — `/stream/:job_id`, `/poster/:basename`, and the
//! POST /graphql handler that bridges axum extensions into
//! async-graphql Data. Schema lives in `graphql/`.

pub mod graphql_http;
pub mod poster;
pub mod stream;
