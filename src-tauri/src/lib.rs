//! Tauri shell for xstream.
//!
//! Wraps the Rust server (`xstream-server`) and the React/Relay client
//! (`client/dist/`) into a single desktop binary. The server runs
//! in-process on a free `127.0.0.1:<port>`; the webview reaches it over
//! HTTP — no Tauri IPC in the request path, so the length-prefixed
//! `/stream/:job_id` binary protocol survives unchanged.
//!
//! Layer reference: `docs/migrations/rust-rewrite/08-Tauri-Packaging.md`.
//! Step playbook: `docs/migrations/rust-rewrite/Plan/03-Tauri-Packaging.md`.

mod ffmpeg_path;
mod server_supervisor;

use tauri::Manager;

use crate::server_supervisor::spawn_server;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. Resolve per-OS storage paths from Tauri's path API. The
            //    server stores its DB under `app_local_data_dir` (durable
            //    user state) and segment cache under `app_cache_dir`
            //    (regenerable, OS may evict). See
            //    `08-Tauri-Packaging.md` §3 + `05-Database-Layer.md`.
            let db_path = app_handle
                .path()
                .app_local_data_dir()?
                .join("xstream.db");
            let segment_dir = app_handle.path().app_cache_dir()?.join("segments");
            let resource_dir = app_handle.path().resource_dir()?;

            // 2. Resolve the bundled ffmpeg + ffprobe under
            //    `<resource_dir>/ffmpeg/<platform>/`. Built into the
            //    bundle by `bun run setup-ffmpeg --target=tauri-bundle`.
            let ffmpeg_paths = ffmpeg_path::resolve(&resource_dir).map_err(|e| {
                tracing::error!(error = %e, "failed to resolve bundled ffmpeg");
                e
            })?;

            // 3. Pick a free port, spawn the embedded server.
            let handle = spawn_server(
                db_path,
                segment_dir,
                resource_dir,
                ffmpeg_paths,
            )?;
            let port = handle.port;
            app.manage(handle);

            // 4. Inject the port into every webview window so the React
            //    client's `rustOrigin.ts` can build URLs against it.
            //    Setting it on `window` happens before the React bundle
            //    evaluates because `eval` runs in the renderer at load
            //    time, ahead of `frontendDist`'s `index.html` execution.
            for (_label, webview_window) in app.webview_windows() {
                webview_window
                    .eval(&format!("window.__XSTREAM_SERVER_PORT__ = {port};"))?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
