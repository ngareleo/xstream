//! `GET /stream/:job_id` — length-prefixed binary fMP4 stream. See docs/architecture/Streaming/00-Protocol.md.

use std::convert::Infallible;
use std::path::PathBuf;
use std::time::Duration;

use axum::{
    body::Body,
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Extension,
};
use bytes::Bytes;
use tokio::sync::mpsc;
use tokio::time::{sleep, timeout};
use tokio_stream::wrappers::ReceiverStream;
use tracing::{info, info_span, warn, Instrument};

use crate::config::AppContext;
use crate::graphql::scalars::JobStatus;
use crate::services::active_job::ActiveJob;

/// Per-connection backpressure window. 16 segments at ~6 MB each = ~96 MB
/// worst case per consumer. With the §5.2 design budget of 10+ concurrent
/// consumers per job, this caps memory at ~1 GB worst case and amortises
/// far below that in normal flow.
const BACKPRESSURE_BUFFER: usize = 16;

/// Per-poll cadence for waiting on the next segment to land on disk.
const ENCODER_POLL_MS: u64 = 100;

/// Total budget for `init.mp4` to appear (slow ffprobe on large HEVC).
const INIT_WAIT_BUDGET_MS: u64 = 60_000;

pub async fn stream_handler(
    Path(job_id): Path<String>,
    Extension(ctx): Extension<AppContext>,
) -> Response {
    let span = info_span!("stream.request", job.id = %job_id);

    let Some(job) = ctx.job_store.get(&job_id) else {
        return (StatusCode::NOT_FOUND, "Job not found").into_response();
    };

    // Bump the connection counter for orphan-kill bookkeeping. The pump
    // task decrements it on its way out.
    job.with_inner_mut(|i| {
        i.connections = i.connections.saturating_add(1);
    });

    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(BACKPRESSURE_BUFFER);

    let ctx_for_pump = ctx.clone();
    let job_for_pump = job.clone();
    let job_id_for_pump = job_id.clone();
    tokio::spawn(
        async move {
            stream_pump(ctx_for_pump, job_for_pump, job_id_for_pump, tx).await;
        }
        .instrument(span),
    );

    let body = Body::from_stream(ReceiverStream::new(rx));
    Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CACHE_CONTROL, "no-store")
        .body(body)
        .map(IntoResponse::into_response)
        .unwrap_or_else(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("response build failed: {err}"),
            )
                .into_response()
        })
}

async fn stream_pump(
    ctx: AppContext,
    job: ActiveJob,
    job_id: String,
    tx: mpsc::Sender<Result<Bytes, Infallible>>,
) {
    info!("stream_started");

    // Init phase. Wait up to INIT_WAIT_BUDGET_MS for `init.mp4` to land.
    let init_path = match wait_for_init_segment(&job).await {
        Some(p) => p,
        None => {
            warn!("init_timeout");
            decrement_connection(&ctx, &job, &job_id);
            return;
        }
    };

    let init_bytes = match tokio::fs::read(&init_path).await {
        Ok(b) => Bytes::from(b),
        Err(err) => {
            warn!(error = %err, "could not read init segment");
            decrement_connection(&ctx, &job, &job_id);
            return;
        }
    };
    let init_len = init_bytes.len();
    if !send_length_prefixed(&tx, init_bytes).await {
        decrement_connection(&ctx, &job, &job_id);
        return;
    }
    info!(bytes = init_len, "init_sent");

    // Media phase. Pull the next segment file off disk on demand,
    // sleeping ENCODER_POLL_MS between attempts when the file isn't
    // there yet. Idle-timeout via `connection_idle_timeout_ms`.
    let idle_timeout = Duration::from_millis(ctx.config.stream.connection_idle_timeout_ms);
    let mut segments_sent: u64 = 0;
    let mut total_bytes_sent: u64 = init_len as u64;
    let mut index: i64 = 0;
    let mut last_progress = std::time::Instant::now();

    loop {
        let path = match next_segment_path(&job, index).await {
            NextSegment::Ready(p) => p,
            NextSegment::Done => break,
            NextSegment::Wait => {
                if last_progress.elapsed() > idle_timeout {
                    warn!(segments_sent, "idle_timeout");
                    break;
                }
                tokio::select! {
                    _ = job.notify.notified() => {}
                    _ = sleep(Duration::from_millis(ENCODER_POLL_MS)) => {}
                }
                continue;
            }
        };

        let bytes = match tokio::fs::read(&path).await {
            Ok(b) => Bytes::from(b),
            Err(err) => {
                // File may not yet be fully written; back off briefly.
                warn!(error = %err, segment_index = index, "read failed; retrying");
                sleep(Duration::from_millis(ENCODER_POLL_MS)).await;
                continue;
            }
        };
        let len = bytes.len() as u64;
        if !send_length_prefixed(&tx, bytes).await {
            // Consumer disconnected.
            info!(segments_sent, "client_disconnected");
            decrement_connection(&ctx, &job, &job_id);
            return;
        }
        segments_sent += 1;
        total_bytes_sent += len;
        index += 1;
        last_progress = std::time::Instant::now();
    }

    info!(segments_sent, total_bytes_sent, "stream_complete");
    decrement_connection(&ctx, &job, &job_id);
}

/// Wait for `init_segment_path` to appear on the job (set by the chunker's
/// segment watcher). Returns `Some(path)` when it lands, or `None` after
/// the budget elapses.
async fn wait_for_init_segment(job: &ActiveJob) -> Option<PathBuf> {
    let already = job.with_inner(|i| i.init_segment_path.clone());
    if let Some(p) = already {
        return Some(PathBuf::from(p));
    }
    let total_budget = Duration::from_millis(INIT_WAIT_BUDGET_MS);
    let deadline = tokio::time::Instant::now() + total_budget;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return None;
        }
        // Wait for either a notify wake or the remaining budget.
        let _ = timeout(remaining, job.notify.notified()).await;
        if let Some(p) = job.with_inner(|i| i.init_segment_path.clone()) {
            return Some(PathBuf::from(p));
        }
        // Defensive: if the job errored or completed without an init,
        // give up rather than spin to the deadline.
        let status = job.with_inner(|i| i.status);
        if matches!(status, JobStatus::Error) {
            return None;
        }
    }
}

enum NextSegment {
    Ready(PathBuf),
    Wait,
    Done,
}

/// Look at the job state and decide what to do for `index`:
/// - `Ready(path)` if the segment file is registered.
/// - `Done` if the job is `Complete` and `index` is past the last segment.
/// - `Wait` otherwise (encoding still in progress).
async fn next_segment_path(job: &ActiveJob, index: i64) -> NextSegment {
    job.with_inner(|i| {
        let idx = index as usize;
        if let Some(Some(p)) = i.segments.get(idx) {
            return NextSegment::Ready(PathBuf::from(p));
        }
        if matches!(i.status, JobStatus::Complete) {
            return NextSegment::Done;
        }
        if matches!(i.status, JobStatus::Error) {
            return NextSegment::Done;
        }
        NextSegment::Wait
    })
}

async fn send_length_prefixed(tx: &mpsc::Sender<Result<Bytes, Infallible>>, bytes: Bytes) -> bool {
    let mut header = [0u8; 4];
    let len = bytes.len() as u32;
    header[0] = (len >> 24) as u8;
    header[1] = (len >> 16) as u8;
    header[2] = (len >> 8) as u8;
    header[3] = len as u8;
    if tx.send(Ok(Bytes::copy_from_slice(&header))).await.is_err() {
        return false;
    }
    if tx.send(Ok(bytes)).await.is_err() {
        return false;
    }
    true
}

fn decrement_connection(ctx: &AppContext, job: &ActiveJob, job_id: &str) {
    let still_running = job.with_inner_mut(|i| {
        i.connections = i.connections.saturating_sub(1);
        i.connections == 0 && matches!(i.status, JobStatus::Running | JobStatus::Pending)
    });
    if still_running {
        ctx.pool.kill_job(
            job_id,
            crate::services::kill_reason::KillReason::ClientDisconnected,
        );
    }
}
