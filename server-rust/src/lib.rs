pub mod config;
pub mod db;
pub mod error;
pub mod graphql;
pub mod relay;
pub mod request_context;
pub mod routes;
pub mod services;
pub mod telemetry;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::{response::IntoResponse, routing::get, Router};

use crate::config::{AppConfig, AppContext};
use crate::error::{AppError, AppResult};
use crate::graphql::{build_schema, XstreamSchema};
use crate::request_context::extract_request_context;
use crate::services::ffmpeg_path::{resolve_ffmpeg_paths, FfmpegPaths};
use crate::services::hw_accel::{resolve_hw_accel, HwAccelMode};

#[derive(Clone)]
pub struct AppState {
    pub ctx: AppContext,
    pub schema: XstreamSchema,
}

impl AppState {
    pub fn new(ctx: AppContext) -> Self {
        let schema = build_schema(ctx.clone());
        Self { ctx, schema }
    }
}

/// Build the axum router. Returns `Err` if any of the static configuration
/// (CORS origins, header names) is malformed — this can only happen via a
/// programmer typo, but propagating it through the type system means we
/// catch it at startup with a clear `AppError::Cors`, not via panic.
pub fn build_router(state: AppState) -> AppResult<Router> {
    use async_graphql_axum::{GraphQL, GraphQLSubscription};
    use axum::routing::MethodRouter;

    // POST /graphql → query/mutation handler
    // GET  /graphql → WebSocket upgrade for subscriptions (graphql-transport-ws)
    let graphql_method: MethodRouter<()> = MethodRouter::new()
        .post_service(GraphQL::new(state.schema.clone()))
        .get_service(GraphQLSubscription::new(state.schema.clone()))
        .options(|| async { axum::http::StatusCode::NO_CONTENT });

    let ctx = state.ctx.clone();
    Ok(Router::new()
        .route("/healthz", get(healthz))
        .route("/graphql", graphql_method)
        .route("/stream/:job_id", get(routes::stream::stream_handler))
        // Pass AppContext via Extension rather than State so we don't have
        // to thread an `S` type parameter through every router builder.
        .layer(axum::Extension(ctx))
        // Single outer middleware: extract W3C traceparent, build RequestContext,
        // create a per-request `http.request` span whose parent is the inbound
        // OTel context. Spans created downstream inherit it via Instrument.
        // We deliberately do NOT use `tower_http::TraceLayer`; its spans don't
        // inherit the W3C-extracted context, which silently breaks distributed
        // tracing across the client → server boundary.
        .layer(axum::middleware::from_fn(extract_request_context))
        .layer(make_cors()?)
        .fallback(|| async { (axum::http::StatusCode::NOT_FOUND, "Not Found") }))
}

fn make_cors() -> AppResult<tower_http::cors::CorsLayer> {
    use http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    use http::{HeaderName, Method};
    use tower_http::cors::{AllowOrigin, CorsLayer};

    // Dev-mode CORS — allows both the Rsbuild dev server origin and the
    // Tauri webview origin (forward constraint for Step 3, see
    // `04-Web-Server-Layer.md` §4.1).
    let origins = AllowOrigin::list([
        "http://localhost:5173"
            .parse()
            .map_err(|_| AppError::Cors("origin literal http://localhost:5173".into()))?,
        "tauri://localhost"
            .parse()
            .map_err(|_| AppError::Cors("origin literal tauri://localhost".into()))?,
    ]);
    let traceparent: HeaderName = "traceparent"
        .parse()
        .map_err(|_| AppError::Cors("header name `traceparent`".into()))?;
    let tracestate: HeaderName = "tracestate"
        .parse()
        .map_err(|_| AppError::Cors("header name `tracestate`".into()))?;

    Ok(CorsLayer::new()
        .allow_origin(origins)
        .allow_credentials(true)
        .allow_headers([CONTENT_TYPE, ACCEPT, AUTHORIZATION, traceparent, tracestate])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS]))
}

async fn healthz() -> impl IntoResponse {
    "ok"
}

/// Server bootstrap configuration. Built by `main.rs` from env in dev mode,
/// or by the Tauri shell (`src-tauri/src/main.rs`) from `app.path()` calls
/// in production. `run()` consumes this and performs the full bootstrap
/// (telemetry, DB, ffmpeg resolve, HW-accel probe, axum serve).
pub struct ServerConfig {
    /// Address the axum listener binds to. Dev: `127.0.0.1:3002`. Tauri:
    /// a free `127.0.0.1:<port>` chosen at startup and injected into the
    /// webview as `window.__XSTREAM_SERVER_PORT__`.
    pub bind_addr: SocketAddr,
    /// SQLite database path. Dev: `tmp/xstream-rust.db`. Tauri:
    /// `app_local_data_dir/xstream.db`.
    pub db_path: PathBuf,
    /// Segment cache root. Dev: `tmp/segments-rust/`. Tauri:
    /// `app_cache_dir/segments/`.
    pub segment_dir: PathBuf,
    /// Used as a fallback root for the ffmpeg manifest probe when
    /// `ffmpeg_override` is `None`. Dev: workspace root. Tauri:
    /// `app.path().resource_dir()`.
    pub project_root: PathBuf,
    /// Optional explicit ffmpeg paths. When `Some`, the manifest probe is
    /// skipped — Tauri uses this so the bundled binary inside
    /// `<resource_dir>/ffmpeg/<platform>/` is the source of truth, not
    /// `scripts/ffmpeg-manifest.json`. Dev leaves this `None` and the
    /// manifest probe runs as before.
    pub ffmpeg_override: Option<FfmpegPaths>,
}

/// Run the xstream Rust server. Initialises telemetry, opens the DB, runs
/// the boot-time job-restore sweep, resolves ffmpeg + HW-accel, builds the
/// axum router, and serves until SIGTERM/SIGINT (or, in Tauri mode, until
/// the Tauri runtime shuts down the spawned task).
///
/// Idempotency: this function is intended to be called exactly once per
/// process. `telemetry::init()` registers a global subscriber and the OTLP
/// exporter; calling `run` twice would re-init both and trip the
/// "global default subscriber already set" guard.
pub async fn run(config: ServerConfig) -> AppResult<()> {
    telemetry::init()?;

    tracing::info!(db_path = %config.db_path.display(), "opening sqlite database");
    let db = db::Db::open(&config.db_path).map_err(|source| AppError::DbOpen {
        path: config.db_path.clone(),
        source,
    })?;

    let restored = services::job_restore::sweep_interrupted(&db)
        .map_err(|source| AppError::JobRestore { source })?;
    if restored > 0 {
        tracing::info!(
            restored,
            "Marked {restored} interrupted transcode jobs as errored on startup"
        );
    }

    let ffmpeg_paths = match config.ffmpeg_override {
        Some(paths) => {
            tracing::info!(
                ffmpeg = %paths.ffmpeg.display(),
                ffprobe = %paths.ffprobe.display(),
                version = %paths.version_string,
                "ffmpeg binaries supplied by host (Tauri-mode override)"
            );
            paths
        }
        None => {
            let manifest_path = config
                .project_root
                .join("scripts")
                .join("ffmpeg-manifest.json");
            let paths = resolve_ffmpeg_paths(&config.project_root, &manifest_path)?;
            tracing::info!(
                ffmpeg = %paths.ffmpeg.display(),
                ffprobe = %paths.ffprobe.display(),
                version = %paths.version_string,
                "ffmpeg binaries resolved from manifest"
            );
            paths
        }
    };

    let hw_mode = HwAccelMode::from_env();
    let hw_accel = resolve_hw_accel(&ffmpeg_paths.ffmpeg, hw_mode).await?;
    tracing::info!(kind = hw_accel.kind_str(), "Hardware acceleration selected");

    let mut app_config = AppConfig::with_paths(config.segment_dir.clone(), config.db_path.clone());
    if let Err(err) = tokio::fs::create_dir_all(&app_config.segment_dir).await {
        tracing::warn!(error = %err, dir = %app_config.segment_dir.display(),
            "could not create segment dir up-front — chunker will retry per-job");
    }

    // OMDb auto-match key resolution. Env wins; the persisted
    // `omdbApiKey` user setting is the fallback. `None` is fine — the
    // scanner skips auto-match silently when no key is configured.
    let omdb_key_from_env = std::env::var("OMDB_API_KEY").ok().filter(|s| !s.is_empty());
    let omdb_key_from_db = match db::get_setting(&db, "omdbApiKey") {
        Ok(opt) => opt.filter(|s| !s.is_empty()),
        Err(err) => {
            tracing::warn!(error = %err, "could not read omdbApiKey from user_settings; env-only");
            None
        }
    };
    app_config.omdb_api_key = omdb_key_from_env.or(omdb_key_from_db);
    if app_config.omdb_api_key.is_some() {
        tracing::info!("OMDb auto-match enabled");
    } else {
        tracing::info!("OMDb auto-match disabled — set OMDB_API_KEY env or omdbApiKey setting");
    }

    let ctx = AppContext::new(db, app_config, Arc::new(ffmpeg_paths), hw_accel);

    // Background re-scan loop ticking every `scan.interval_ms` (default
    // 30 s). Re-entry is guarded inside `scan_libraries` via
    // `ScanState::mark_started`, so two ticks that overlap a long scan
    // don't double-walk.
    services::library_scanner::spawn_periodic_scan(ctx.clone());

    let state = AppState::new(ctx);
    let app = build_router(state)?;

    let listener = tokio::net::TcpListener::bind(config.bind_addr)
        .await
        .map_err(|source| AppError::Bind {
            addr: config.bind_addr,
            source,
        })?;

    tracing::info!(addr = %config.bind_addr, "xstream-server listening");

    let serve = axum::serve(listener, app);
    tokio::select! {
        result = serve => {
            if let Err(err) = result {
                tracing::error!(error = %err, "axum serve loop exited with error");
                telemetry::shutdown();
                return Err(AppError::Serve(err));
            }
        }
        signal = shutdown_signal() => {
            match signal {
                Ok(name) => tracing::info!(signal = name, "shutdown initiated"),
                Err(err) => {
                    tracing::error!(error = %err, "signal handler install failed");
                    telemetry::shutdown();
                    return Err(err);
                }
            }
        }
    }

    telemetry::shutdown();
    Ok(())
}

/// Wait for SIGTERM or SIGINT. Returns the signal name on success, or an
/// `AppError::SignalHandler` if the OS refused to register a handler.
async fn shutdown_signal() -> AppResult<&'static str> {
    use tokio::signal::unix::{signal, SignalKind};
    let mut sigterm =
        signal(SignalKind::terminate()).map_err(|source| AppError::SignalHandler {
            signal: "SIGTERM",
            source,
        })?;
    let mut sigint = signal(SignalKind::interrupt()).map_err(|source| AppError::SignalHandler {
        signal: "SIGINT",
        source,
    })?;
    tokio::select! {
        _ = sigterm.recv() => Ok("SIGTERM"),
        _ = sigint.recv()  => Ok("SIGINT"),
    }
}
