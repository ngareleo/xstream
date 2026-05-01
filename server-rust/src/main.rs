use std::net::SocketAddr;
use std::path::PathBuf;

use xstream_server::error::{AppError, AppResult};
use xstream_server::{run, ServerConfig};

#[tokio::main]
async fn main() -> AppResult<()> {
    let config = build_config_from_env()?;
    if let Err(err) = run(config).await {
        // Two channels because they have different audiences:
        //   1. tracing::error! → OTLP → Seq, where it joins the broader
        //      trace stream (no TraceId since this is outside any request,
        //      but it still appears under service.name=xstream-server-rust).
        //   2. eprintln! → stderr, where systemd/CI/restart-scripts can
        //      read it without a working OTel pipeline.
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

/// Build a `ServerConfig` from environment variables. The standalone Rust
/// binary keeps the historical defaults (DB at `tmp/xstream-rust.db`,
/// segments at `tmp/segments-rust/`, bind `127.0.0.1:3002`); the Tauri
/// shell calls `xstream_server::run` directly with explicit paths instead.
fn build_config_from_env() -> AppResult<ServerConfig> {
    let project_root = std::env::var("XSTREAM_PROJECT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let db_path = xstream_server::db::default_db_path();
    let segment_dir = project_root.join("tmp").join("segments-rust");

    let bind_addr_str =
        std::env::var("XSTREAM_BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3002".to_string());
    let bind_addr: SocketAddr =
        bind_addr_str
            .parse()
            .map_err(|source| AppError::InvalidBindAddr {
                addr: bind_addr_str.clone(),
                source,
            })?;

    Ok(ServerConfig {
        bind_addr,
        db_path,
        segment_dir,
        project_root,
        ffmpeg_override: None,
    })
}
