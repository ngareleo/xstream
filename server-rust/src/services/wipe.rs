//! Dev-only state wipes — DB, poster cache, segment cache. Surfaced via the Settings → Danger tab.

use std::path::Path;

use tracing::{info, warn};

use crate::config::AppContext;
use crate::db::wipe_content;
use crate::error::DbError;

/// Errors a wipe can surface to the caller. Intentionally narrow — the
/// callers (mutation resolvers) only need a string for the GraphQL
/// error message; deeper diagnostics go to the log.
#[derive(Debug, thiserror::Error)]
pub enum WipeError {
    #[error("a transcode job is currently active — cancel it first")]
    JobActive,
    #[error("a library scan is currently in progress — wait for it to finish")]
    ScanActive,
    #[error("database error: {0}")]
    Db(#[from] DbError),
}

pub type WipeResult<T> = Result<T, WipeError>;

/// Refuse to wipe while in-flight work could trip over the rug. Used by
/// individual wipes (`wipe_db`, `wipe_segment_cache`, `wipe_poster_cache`).
/// `wipe_all` calls `pool.kill_all_jobs()` first, so it only checks the
/// scan gate.
fn check_idle(ctx: &AppContext) -> WipeResult<()> {
    if !ctx.job_store.is_empty() {
        return Err(WipeError::JobActive);
    }
    if ctx.scan_state.is_scanning() {
        return Err(WipeError::ScanActive);
    }
    Ok(())
}

/// Wipe all content rows. Preserves `user_settings`. Gated behind
/// "no active jobs / no in-flight scan".
pub async fn wipe_db(ctx: &AppContext) -> WipeResult<()> {
    check_idle(ctx)?;
    info!("wipe_db: deleting all content rows");
    wipe_content(&ctx.db)?;
    Ok(())
}

/// Wipe the on-disk poster cache and null out `poster_local_path` so the
/// background worker re-fetches every poster on its next 15s cycle.
pub async fn wipe_poster_cache(ctx: &AppContext) -> WipeResult<()> {
    check_idle(ctx)?;
    info!(dir = %ctx.config.poster_dir.display(), "wipe_poster_cache: deleting cache directory contents");
    delete_dir_contents(&ctx.config.poster_dir).await;
    // SQL: drop the local-path pointers so the worker treats every row
    // as "needing download" again. Wrap in a single statement per
    // table; both are idempotent.
    let db = ctx.db.clone();
    db.with(|c| {
        c.execute("UPDATE video_metadata SET poster_local_path = NULL", [])?;
        c.execute("UPDATE show_metadata  SET poster_local_path = NULL", [])?;
        Ok(())
    })?;
    Ok(())
}

/// Wipe the on-disk segment cache and clear the in-memory job store.
/// Requires no jobs to be active (gate above), so the in-memory clear
/// is safe.
pub async fn wipe_segment_cache(ctx: &AppContext) -> WipeResult<()> {
    check_idle(ctx)?;
    info!(dir = %ctx.config.segment_dir.display(), "wipe_segment_cache: deleting cache directory contents");
    delete_dir_contents(&ctx.config.segment_dir).await;
    let db = ctx.db.clone();
    db.with(|c| {
        // segments rows cascade from transcode_jobs, but be explicit so
        // a future schema break doesn't leave orphaned rows.
        c.execute("DELETE FROM segments", [])?;
        c.execute("DELETE FROM transcode_jobs", [])?;
        Ok(())
    })?;
    ctx.job_store.clear();
    Ok(())
}

/// Wipe everything. Kills any in-flight transcode jobs first, then runs
/// the three wipes in DB → segments → posters order so referential
/// state stays consistent throughout.
pub async fn wipe_all(ctx: &AppContext) -> WipeResult<()> {
    if ctx.scan_state.is_scanning() {
        return Err(WipeError::ScanActive);
    }
    info!("wipe_all: killing active transcode jobs");
    ctx.pool.kill_all_jobs().await;
    // After kill_all_jobs the store should be empty; clear defensively
    // in case an in-flight insert raced the kill loop.
    ctx.job_store.clear();

    info!("wipe_all: wiping DB");
    wipe_content(&ctx.db)?;
    info!(dir = %ctx.config.segment_dir.display(), "wipe_all: wiping segment cache");
    delete_dir_contents(&ctx.config.segment_dir).await;
    info!(dir = %ctx.config.poster_dir.display(), "wipe_all: wiping poster cache");
    delete_dir_contents(&ctx.config.poster_dir).await;
    Ok(())
}

/// Best-effort recursive contents-delete: the directory itself stays
/// (so subsequent writes don't have to recreate it). Failures are
/// logged at warn — a wipe is allowed to leave stragglers; the next
/// invocation will retry.
async fn delete_dir_contents(dir: &Path) {
    let mut iter = match tokio::fs::read_dir(dir).await {
        Ok(it) => it,
        Err(err) => {
            // ENOENT on a missing dir is fine — nothing to wipe.
            if err.kind() != std::io::ErrorKind::NotFound {
                warn!(dir = %dir.display(), error = %err, "read_dir failed");
            }
            return;
        }
    };
    loop {
        let entry = match iter.next_entry().await {
            Ok(Some(e)) => e,
            Ok(None) => break,
            Err(err) => {
                warn!(dir = %dir.display(), error = %err, "next_entry failed; aborting wipe of this dir");
                return;
            }
        };
        let path = entry.path();
        let result = match entry.file_type().await {
            Ok(ft) if ft.is_dir() => tokio::fs::remove_dir_all(&path).await,
            Ok(_) => tokio::fs::remove_file(&path).await,
            Err(err) => {
                warn!(path = %path.display(), error = %err, "file_type failed; skipping");
                continue;
            }
        };
        if let Err(err) = result {
            warn!(path = %path.display(), error = %err, "delete failed; continuing");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    async fn write(path: PathBuf, contents: &[u8]) {
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await.expect("mkdir");
        }
        tokio::fs::write(&path, contents).await.expect("write");
    }

    #[tokio::test]
    async fn delete_dir_contents_removes_files_and_subdirs_but_keeps_root() {
        let tmp = TempDir::new().expect("tempdir");
        let root = tmp.path().to_path_buf();
        write(root.join("a.jpg"), b"a").await;
        write(root.join("nested/b.jpg"), b"b").await;

        delete_dir_contents(&root).await;

        let mut entries = tokio::fs::read_dir(&root).await.expect("read_dir");
        assert!(
            entries.next_entry().await.expect("next").is_none(),
            "root should be empty"
        );
        assert!(root.exists(), "root dir itself must remain");
    }

    #[tokio::test]
    async fn delete_dir_contents_silently_handles_missing_dir() {
        // ENOENT is the common case before the worker has run — the
        // wipe must not error out.
        let tmp = TempDir::new().expect("tempdir");
        let missing = tmp.path().join("never-created");
        delete_dir_contents(&missing).await;
        // No assertion — the call must just complete without panicking.
    }
}
