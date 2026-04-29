use std::net::SocketAddr;

use xstream_server::{build_router, db::Db, telemetry, AppState};

#[tokio::main]
async fn main() {
    telemetry::init();

    let db_path = xstream_server::db::default_db_path();
    tracing::info!(?db_path, "opening sqlite database");
    let db = Db::open(&db_path).expect("open sqlite database");

    let state = AppState::new(db);
    let app = build_router(state);

    let addr: SocketAddr = "127.0.0.1:3002".parse().expect("valid bind addr");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind 127.0.0.1:3002 — port collision with another Rust server? Bun stays on its config.port (3001 in dev).");

    tracing::info!(%addr, "xstream-server listening");

    let serve = axum::serve(listener, app);
    tokio::select! {
        result = serve => {
            if let Err(err) = result {
                tracing::error!(error = %err, "axum serve loop exited with error");
            }
        }
        _ = shutdown_signal() => {
            tracing::info!("shutdown signal received");
        }
    }

    telemetry::shutdown();
}

async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut sigterm = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    let mut sigint = signal(SignalKind::interrupt()).expect("install SIGINT handler");
    tokio::select! {
        _ = sigterm.recv() => tracing::info!(signal = "SIGTERM", "shutdown initiated"),
        _ = sigint.recv()  => tracing::info!(signal = "SIGINT",  "shutdown initiated"),
    }
}
