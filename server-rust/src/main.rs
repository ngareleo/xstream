use std::net::SocketAddr;

use xstream_server::error::{AppError, AppResult};
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

    let state = AppState::new(db);
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
