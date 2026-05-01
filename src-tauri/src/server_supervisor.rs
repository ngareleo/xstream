//! Embedded Rust server lifecycle.
//!
//! `spawn_server` picks a free port on `127.0.0.1`, then spawns
//! `xstream_server::run` on the Tauri async runtime. The returned
//! `ServerHandle` carries the port so the lib.rs setup can inject it
//! into the webview via `window.__XSTREAM_SERVER_PORT__`.
//!
//! The brief race between picking and re-binding the port is acceptable
//! for the single-user-loopback case prescribed by `08-Tauri-Packaging.md`
//! §3 — no other process is competing for `127.0.0.1:0`.

use std::net::SocketAddr;
use std::path::PathBuf;

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

    tauri::async_runtime::spawn(async move {
        if let Err(err) = xstream_server::run(config).await {
            // The Tauri shell can keep running with a broken backend
            // (the webview still loads) but the user won't be able to
            // do anything useful. Surface the failure with the full
            // `#[source]` chain so the operator doesn't need a backtrace.
            let mut chain = err.to_string();
            let mut source = std::error::Error::source(&err);
            while let Some(s) = source {
                chain.push_str(" → ");
                chain.push_str(&s.to_string());
                source = s.source();
            }
            tracing::error!(error = %err, chain = %chain, "embedded xstream server exited with error");
        }
    });

    Ok(ServerHandle { port })
}

fn pick_free_port() -> Result<u16, SpawnError> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(SpawnError::PickPort)?;
    let port = listener.local_addr().map_err(SpawnError::LocalAddr)?.port();
    drop(listener);
    Ok(port)
}
