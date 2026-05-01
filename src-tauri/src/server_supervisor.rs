//! Embedded Rust server lifecycle.
//!
//! `spawn_server` picks a free port on `127.0.0.1`, then spawns
//! `xstream_server::run` on the Tauri async runtime. The returned
//! `ServerHandle` carries the port (so the lib.rs setup can inject it
//! into the webview via `window.__XSTREAM_SERVER_PORT__`) and the
//! `JoinHandle` (so a future graceful-quit hook can await the task).
//!
//! The brief race between picking and re-binding the port is acceptable
//! for the single-user-loopback case prescribed by `08-Tauri-Packaging.md`
//! §3 — no other process is competing for `127.0.0.1:0`.

use std::net::SocketAddr;
use std::path::PathBuf;

use tauri::async_runtime::JoinHandle;

use xstream_server::services::ffmpeg_path::FfmpegPaths;
use xstream_server::ServerConfig;

#[derive(Debug, thiserror::Error)]
pub enum SpawnError {
    #[error("picking a free 127.0.0.1 port: {0}")]
    PickPort(#[source] std::io::Error),

    #[error("reading local_addr from probe listener: {0}")]
    LocalAddr(#[source] std::io::Error),
}

pub struct ServerHandle {
    pub port: u16,
    pub task: JoinHandle<()>,
}

pub fn spawn_server(
    db_path: PathBuf,
    segment_dir: PathBuf,
    project_root: PathBuf,
    ffmpeg_paths: FfmpegPaths,
) -> Result<ServerHandle, SpawnError> {
    let port = pick_free_port()?;
    let bind_addr: SocketAddr = format!("127.0.0.1:{port}")
        .parse()
        .expect("loopback bind addr always parses");

    tracing::info!(
        port,
        db_path = %db_path.display(),
        segment_dir = %segment_dir.display(),
        "starting embedded xstream server"
    );

    let config = ServerConfig {
        bind_addr,
        db_path,
        segment_dir,
        project_root,
        ffmpeg_override: Some(ffmpeg_paths),
    };

    let task = tauri::async_runtime::spawn(async move {
        if let Err(err) = xstream_server::run(config).await {
            // The Tauri shell can keep running with a broken backend
            // (the webview still loads) but the user won't be able to
            // do anything useful. Surface the failure and let the
            // window stay open so the user can read the error.
            tracing::error!(error = %err, "embedded xstream server exited with error");
        }
    });

    Ok(ServerHandle { port, task })
}

fn pick_free_port() -> Result<u16, SpawnError> {
    let listener =
        std::net::TcpListener::bind("127.0.0.1:0").map_err(SpawnError::PickPort)?;
    let port = listener
        .local_addr()
        .map_err(SpawnError::LocalAddr)?
        .port();
    drop(listener);
    Ok(port)
}
