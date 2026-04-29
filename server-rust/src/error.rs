//! Typed errors for the server.
//!
//! Two layers:
//! - [`DbError`] — anything the persistence layer can fail on. Includes
//!   underlying SQLite errors, mutex poisoning (another thread crashed
//!   while holding the connection lock), invariant violations (e.g. a row
//!   the caller just inserted is not findable), and malformed-JSON inside
//!   text columns the DB layer otherwise treats as opaque.
//! - [`AppError`] — top-level startup / shutdown / signal-handling errors
//!   that bubble up to `main()`. Telemetry-init and bind/serve failures
//!   live here.
//!
//! Both implement `std::error::Error`, both are `Send + Sync + 'static`,
//! and both have explicit `From` conversions where a downstream module
//! `?`-propagates a different error type. `DbError -> async_graphql::Error`
//! is wired so resolvers stay terse: every `db::…?` call surfaces as a
//! GraphQL error, never a panic.

use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    /// The connection mutex was poisoned by a thread that panicked while
    /// holding the lock. The Connection itself is likely fine (SQLite
    /// statements are atomic), but we surface this so the caller decides
    /// whether to retry or surface as a 5xx — never a panic on the
    /// happy-path thread.
    #[error("connection mutex poisoned (another task panicked while holding it)")]
    PoisonedMutex,

    /// A read-after-write returned no row. Either the write didn't land
    /// (constraint violation? race with a writer?) or the read was wrong.
    /// Surfaces to the caller; do not retry blindly.
    #[error("invariant violated — {0}")]
    Invariant(&'static str),

    /// A TEXT column held malformed JSON. Indicates DB corruption or a
    /// schema-version mismatch.
    #[error("malformed JSON in column `{column}`: {source}")]
    MalformedJson {
        column: &'static str,
        #[source]
        source: serde_json::Error,
    },
}

pub type DbResult<T> = Result<T, DbError>;

// Resolvers `?`-propagate `DbError` into `async_graphql::Error` via the
// blanket `impl<T: Display + Send + Sync + 'static> From<T> for Error` in
// async-graphql. DbError satisfies all four bounds (thiserror generates
// Display; the variants are owned types). No custom impl needed.

/// Top-level application error. Returned from `main()`. Each variant points
/// at exactly one failure surface, no `String`-typed catch-alls — the
/// stack-trace-equivalent is the `#[source]` chain, which `Display`
/// renders as a "caused by" trail.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("opening sqlite database at {path}")]
    DbOpen {
        path: PathBuf,
        #[source]
        source: DbError,
    },

    #[error("invalid bind address {addr:?}")]
    InvalidBindAddr {
        addr: String,
        #[source]
        source: std::net::AddrParseError,
    },

    #[error("binding TCP listener at {addr}")]
    Bind {
        addr: std::net::SocketAddr,
        #[source]
        source: std::io::Error,
    },

    #[error("axum serve loop")]
    Serve(#[source] std::io::Error),

    #[error("initialising tracing / OTLP exporter")]
    Telemetry(#[source] Box<dyn std::error::Error + Send + Sync + 'static>),

    #[error("installing {signal} handler")]
    SignalHandler {
        signal: &'static str,
        #[source]
        source: std::io::Error,
    },

    #[error("constructing CORS layer: {0}")]
    Cors(String),
}

pub type AppResult<T> = Result<T, AppError>;
