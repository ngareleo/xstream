use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use xstream_server::config::{AppConfig, AppContext};
use xstream_server::error::{AppError, AppResult};
use xstream_server::services::ffmpeg_path::resolve_ffmpeg_paths;
use xstream_server::services::hw_accel::{resolve_hw_accel, HwAccelMode};
use xstream_server::{build_router, db::Db, telemetry, AppState};

#[tokio::main]
async fn main() -> AppResult<()> {
    if let Err(err) = run().await {
        // Two channels because they have different audiences:
        //   1. tracing::error! → OTLP → Seq, where it joins the broader
        //      trace stream (no TraceId since this is outside any request,
        //      but it still appears under service.name=xstream-server-rust).
        //   2. eprintln! → stderr, where systemd/CI/restart-scripts can
        //      read it without a working OTel pipeline.
        // The full `#[source]` chain is rendered inline so an operator
        // diagnosing a startup failure doesn't need RUST_BACKTRACE.
        let chain = error_chain(&err);
        tracing::error!(error = %err, chain = %chain, "xstream-server fatal");
        eprintln!("xstream-server fatal: {err}");
        let mut source = std::error::Error::source(&err);
        while let Some(s) = source {
            eprintln!("  caused by: {s}");
            source = s.source();
        }
        return Err(err);
    }
    Ok(())
}

fn error_chain(err: &dyn std::error::Error) -> String {
    let mut out = err.to_string();
    let mut source = err.source();
    while let Some(s) = source {
        out.push_str(" → ");
        out.push_str(&s.to_string());
        source = s.source();
    }
    out
}

async fn run() -> AppResult<()> {
    telemetry::init()?;

    let db_path = xstream_server::db::default_db_path();
    tracing::info!(?db_path, "opening sqlite database");
    let db = Db::open(&db_path).map_err(|source| AppError::DbOpen {
        path: db_path.clone(),
        source,
    })?;

    let restored = xstream_server::services::job_restore::sweep_interrupted(&db)
        .map_err(|source| AppError::JobRestore { source })?;
    if restored > 0 {
        tracing::info!(
            restored,
            "Marked {restored} interrupted transcode jobs as errored on startup"
        );
    }

    // Resolve the manifest-pinned ffmpeg + ffprobe binaries. Step 2 wires
    // these into AppContext so the chunker + ffmpeg_pool see them without
    // a module global.
    let project_root = std::env::var("XSTREAM_PROJECT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            // Default: walk up from the running binary to find a sibling
            // `scripts/ffmpeg-manifest.json`. In dev this is the workspace
            // root; in Tauri it'll be replaced by app_resource_dir().
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
        });
    let manifest_path = project_root.join("scripts").join("ffmpeg-manifest.json");
    let ffmpeg_paths = resolve_ffmpeg_paths(&project_root, &manifest_path).map_err(|err| {
        AppError::Telemetry(Box::new(std::io::Error::other(format!(
            "ffmpeg path resolution failed: {err}"
        ))))
    })?;
    tracing::info!(
        ffmpeg = %ffmpeg_paths.ffmpeg.display(),
        ffprobe = %ffmpeg_paths.ffprobe.display(),
        version = %ffmpeg_paths.version_string,
        "ffmpeg binaries resolved"
    );

    let hw_mode = HwAccelMode::from_env();
    let hw_accel = resolve_hw_accel(&ffmpeg_paths.ffmpeg, hw_mode).await.map_err(|err| {
        AppError::Telemetry(Box::new(std::io::Error::other(format!(
            "HW accel resolution failed: {err}"
        ))))
    })?;
    tracing::info!(kind = hw_accel.kind_str(), "Hardware acceleration selected");

    let app_config = AppConfig::dev_defaults(&project_root);
    // Make sure the segment dir exists before any chunker work.
    if let Err(err) = tokio::fs::create_dir_all(&app_config.segment_dir).await {
        tracing::warn!(error = %err, dir = %app_config.segment_dir.display(),
            "could not create segment dir up-front — chunker will retry per-job");
    }

    let ctx = AppContext::new(db, app_config, Arc::new(ffmpeg_paths), hw_accel);
    let state = AppState::new(ctx);
    let app = build_router(state)?;

    let addr_str = "127.0.0.1:3002";
    let addr: SocketAddr = addr_str
        .parse()
        .map_err(|source| AppError::InvalidBindAddr {
            addr: addr_str.to_string(),
            source,
        })?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|source| AppError::Bind { addr, source })?;

    tracing::info!(%addr, "xstream-server listening");

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
                    // We failed to *install* a signal handler. The server is
                    // still up; surface the failure rather than continuing
                    // with no graceful-shutdown path.
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
/// `AppError::SignalHandler` if the OS refused to register a handler (which
/// would mean the process can't shut down gracefully — a real failure, not
/// something to swallow).
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
