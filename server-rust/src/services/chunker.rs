//! Transcode chunker — job registration, inflight dedup, three-tier VAAPI
//! cascade as a loop, segment watcher, silent-failure event.
//!
//! The chunker is the only module that owns the lifecycle of a transcode
//! job. The stream route reads the resulting `ActiveJob` (and its segments
//! on disk) but never spawns ffmpeg directly; the GraphQL `start_transcode`
//! resolver calls into this module.
//!
//! Design notes:
//! - The cascade is a plain loop (per `01-Streaming-Layer.md §3.4`). Tier
//!   transitions happen inside one function; the surrounding scope owns
//!   the per-source `VaapiVideoState` cache so a re-encode can skip a
//!   known-failing tier without going through ffmpeg again.
//! - Per-progress span events (`transcode_progress` periodic ticks) are
//!   not emitted today — they require an ffmpeg-stderr line parser that
//!   isn't yet wired. The terminal events (`transcode_started`,
//!   `transcode_complete`, `transcode_killed`, `transcode_silent_failure`)
//!   all fire.
//! - Segment watcher uses `notify::RecommendedWatcher` with per-job
//!   isolation (one watcher per `segment_dir`).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Utc;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use sha1::{Digest, Sha1};
use tokio::sync::mpsc;
use tracing::{error, info, info_span, warn, Instrument};

use crate::config::{profile_for, AppContext, VaapiVideoState};
use crate::db::queries::jobs::{
    insert_job as db_insert_job, update_job_status, JobStatusUpdate, TranscodeJobRow,
};
use crate::db::queries::segments::{insert_segment, NewSegment};
use crate::db::queries::videos::get_video_by_id;
use crate::graphql::scalars::{JobStatus, PlaybackErrorCode, Resolution};
use crate::services::active_job::{job_status_wire, ActiveJob, ActiveJobInner};
use crate::services::cache_index::{self, SegmentCacheKey};
use crate::services::ffmpeg_file::{build_encode_argv, FfmpegFile, HwAccelConfig};
use crate::services::ffmpeg_pool::{ExitOutcome, Reservation};
use crate::services::fmp4_tail_reader;

/// Discriminated result for `start_transcode_job`. The mutation resolver
/// maps `Ok` to `TranscodeJob` and the `Err` variants to `PlaybackError`
/// in the `StartTranscodeResult` GraphQL union.
#[derive(Clone, Debug)]
pub enum StartJobResult {
    Ok(ActiveJob),
    Error {
        code: PlaybackErrorCode,
        message: String,
        retryable: bool,
        retry_after_ms: Option<u64>,
    },
}

/// Compute the deterministic job ID. The `v3|` prefix is part of the hash
/// input — it invalidates segments encoded before `-bsf:v dump_extra=keyframe`
/// became required (Chromium's chunk demuxer needs in-band SPS/PPS to
/// reset across fragment seams). Bumping the prefix is the documented
/// way to force a re-encode after an incompatible pipeline change.
///
/// Two callers asking for byte-identical
/// `(content_fingerprint, resolution, start, end)` get the same id; the
/// `format_seconds` helper guarantees integer-valued floats serialize
/// without a trailing `.0` so the hash stays stable.
pub fn job_id(
    content_fingerprint: &str,
    resolution: Resolution,
    start_time_seconds: Option<f64>,
    end_time_seconds: Option<f64>,
) -> String {
    let mut hasher = Sha1::new();
    hasher.update("v3|");
    hasher.update(content_fingerprint);
    hasher.update("|");
    hasher.update(resolution.to_internal());
    hasher.update("|");
    if let Some(s) = start_time_seconds {
        hasher.update(format_seconds(s));
    }
    hasher.update("|");
    if let Some(e) = end_time_seconds {
        hasher.update(format_seconds(e));
    }
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(40);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(&mut hex, "{byte:02x}");
    }
    hex
}

/// Format a seconds value as a stable string — integer-valued floats
/// emit without the trailing `.0` (`30`, not `30.0`). The output is
/// part of the deterministic `job_id` hash input AND of the ffmpeg
/// `-ss` / `-t` argv, so any drift here moves the job id and may also
/// change ffmpeg's seek behavior.
fn format_seconds(s: f64) -> String {
    if s.fract() == 0.0 && s.is_finite() {
        format!("{}", s as i64)
    } else {
        format!("{s}")
    }
}

/// Public entry — invoked by the GraphQL `start_transcode` resolver. The
/// resolver is responsible for surfacing the `StartJobResult` as either a
/// `TranscodeJob` or a `PlaybackError` per the union spec.
pub async fn start_transcode_job(
    ctx: &AppContext,
    video_id: &str,
    resolution: Resolution,
    start_time_seconds: Option<f64>,
    end_time_seconds: Option<f64>,
) -> StartJobResult {
    let video = match get_video_by_id(&ctx.db, video_id) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return StartJobResult::Error {
                code: PlaybackErrorCode::VideoNotFound,
                message: format!("Video not found: {video_id}"),
                retryable: false,
                retry_after_ms: None,
            };
        }
        Err(err) => {
            error!(error = %err, "DB error looking up video");
            return StartJobResult::Error {
                code: PlaybackErrorCode::Internal,
                message: err.to_string(),
                retryable: false,
                retry_after_ms: None,
            };
        }
    };

    let id = job_id(
        &video.content_fingerprint,
        resolution,
        start_time_seconds,
        end_time_seconds,
    );

    // Cache hit — an existing complete job for the same content tuple.
    if let Some(existing) = ctx.job_store.get(&id) {
        let status = existing.with_inner(|i| i.status);
        if status != JobStatus::Error {
            return StartJobResult::Ok(existing);
        }
    }

    // Inflight dedup — a concurrent caller is already initialising this id.
    if ctx.pool.has_inflight_or_live(&id) {
        let max_polls =
            (ctx.config.transcode.inflight_dedup_timeout_ms / INFLIGHT_DEDUP_POLL_MS).max(1);
        for _ in 0..max_polls {
            tokio::time::sleep(Duration::from_millis(INFLIGHT_DEDUP_POLL_MS)).await;
            if let Some(pending) = ctx.job_store.get(&id) {
                return StartJobResult::Ok(pending);
            }
        }
        warn!(job_id = %id, "Inflight dedup timeout — proceeding");
    }

    // Cap reservation. Synchronous before the first await so a concurrent
    // caller sees the in-flight slot rather than racing for the same
    // capacity.
    let reservation = match ctx.pool.try_reserve_slot(id.clone()) {
        Some(r) => r,
        None => {
            let snap = ctx.pool.snapshot_cap();
            return StartJobResult::Error {
                code: PlaybackErrorCode::CapacityExhausted,
                message: format!(
                    "Too many concurrent streams (limit: {}). Close another player tab and try again.",
                    snap.limit
                ),
                retryable: true,
                retry_after_ms: Some(ctx.pool.capacity_retry_hint_ms()),
            };
        }
    };

    // Cache hit on disk (DB-restored complete job). Look up by structural
    // tuple — content-addressed, decoupled from the in-memory id.
    let cache_key = SegmentCacheKey {
        video_id,
        resolution: resolution.to_internal(),
        start_s: start_time_seconds,
        end_s: end_time_seconds,
    };
    if let Ok(Some(restored)) = cache_index::lookup(&ctx.db, &cache_key) {
        let init_path = PathBuf::from(&restored.segment_dir).join("init.mp4");
        if tokio::fs::metadata(&init_path).await.is_ok() {
            // Init segment exists — restore from DB segments.
            match crate::db::queries::segments::get_segments_by_job(&ctx.db, &restored.id) {
                Ok(seg_rows) if !seg_rows.is_empty() => {
                    let mut segments: Vec<Option<String>> = Vec::new();
                    for row in &seg_rows {
                        let idx = row.segment_index as usize;
                        if segments.len() <= idx {
                            segments.resize(idx + 1, None);
                        }
                        segments[idx] = Some(row.path.clone());
                    }
                    let inner = ActiveJobInner {
                        id: restored.id.clone(),
                        video_id: restored.video_id.clone(),
                        resolution,
                        status: JobStatus::Complete,
                        segment_dir: restored.segment_dir.clone(),
                        total_segments: restored.total_segments,
                        completed_segments: seg_rows.len() as i64,
                        start_time_seconds: restored.start_time_seconds,
                        end_time_seconds: restored.end_time_seconds,
                        created_at: restored.created_at.clone(),
                        updated_at: restored.updated_at.clone(),
                        error: None,
                        segments,
                        init_segment_path: Some(init_path.to_string_lossy().to_string()),
                        connections: 0,
                        error_code: None,
                    };
                    let job = ActiveJob::new(inner);
                    ctx.job_store.insert(job.clone());
                    reservation.release();
                    info!(job_id = %restored.id, "Restored completed job from DB");
                    return StartJobResult::Ok(job);
                }
                _ => {}
            }
        }
    }

    // Fresh transcode. Wipe any stale segment files from a prior errored
    // (or interrupted) run on this same id BEFORE recreating the dir —
    // ffmpeg HLS numbers segments from 0 each run, so a shorter second run
    // overwrites only the prefix and leaves higher-index files from the
    // first run intact. The stream pump reads them sequentially and serves
    // a fresh prefix glued to a stale tail, which Firefox's MP4 parser
    // rejects with "Invalid Top-Level Box". The wipe is what
    // `job_restore::sweep_interrupted` documents as the recovery path.
    let segment_dir = ctx.config.segment_dir.join(&id);
    if let Err(err) = tokio::fs::remove_dir_all(&segment_dir).await {
        if err.kind() != std::io::ErrorKind::NotFound {
            warn!(
                segment_dir = %segment_dir.display(),
                error = %err,
                "could not wipe stale segment dir before re-encode"
            );
        }
    }
    if let Err(err) = tokio::fs::create_dir_all(&segment_dir).await {
        reservation.release();
        return StartJobResult::Error {
            code: PlaybackErrorCode::Internal,
            message: format!("mkdir {segment_dir:?}: {err}"),
            retryable: false,
            retry_after_ms: None,
        };
    }

    let now = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let row = TranscodeJobRow {
        id: id.clone(),
        video_id: video_id.to_string(),
        resolution: resolution.to_internal().to_string(),
        status: "pending".to_string(),
        segment_dir: segment_dir.to_string_lossy().to_string(),
        total_segments: None,
        completed_segments: 0,
        start_time_seconds,
        end_time_seconds,
        created_at: now.clone(),
        updated_at: now.clone(),
        error: None,
    };
    if let Err(err) = db_insert_job(&ctx.db, &row) {
        reservation.release();
        return StartJobResult::Error {
            code: PlaybackErrorCode::Internal,
            message: err.to_string(),
            retryable: false,
            retry_after_ms: None,
        };
    }

    let inner = ActiveJobInner {
        id: id.clone(),
        video_id: video_id.to_string(),
        resolution,
        status: JobStatus::Pending,
        segment_dir: row.segment_dir.clone(),
        total_segments: None,
        completed_segments: 0,
        start_time_seconds,
        end_time_seconds,
        created_at: now.clone(),
        updated_at: now,
        error: None,
        segments: Vec::new(),
        init_segment_path: None,
        connections: 0,
        error_code: None,
    };
    let job = ActiveJob::new(inner);
    ctx.job_store.insert(job.clone());

    // Spawn the encode task. Reservation moves into it; will be consumed
    // by the first `run_to_completion` call inside the cascade loop.
    let ctx_for_task = ctx.clone();
    let job_for_task = job.clone();
    let video_path = PathBuf::from(&video.path);
    let segment_dir_for_task = segment_dir.clone();
    tokio::spawn(async move {
        run_cascade(
            ctx_for_task,
            reservation,
            job_for_task,
            video_path,
            resolution,
            segment_dir_for_task,
            start_time_seconds,
            end_time_seconds,
        )
        .await;
    });

    StartJobResult::Ok(job)
}

const INFLIGHT_DEDUP_POLL_MS: u64 = 100;

/// Stat-poll cadence + budget for `init.mp4` to land with non-zero size
/// after `notify` fires its CREATE event. ffmpeg writes the box header
/// then flushes; the OS's CREATE event arrives before the flush, so we
/// can't trust the file's contents on the first sighting. Budget =
/// `INIT_FLUSH_POLL_ATTEMPTS × INIT_FLUSH_POLL_INTERVAL_MS` (2 s).
const INIT_FLUSH_POLL_ATTEMPTS: u32 = 40;
const INIT_FLUSH_POLL_INTERVAL_MS: u64 = 50;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CascadeTier {
    FastVaapi,
    SwPadVaapi,
    Software,
}

#[allow(clippy::too_many_arguments)]
async fn run_cascade(
    ctx: AppContext,
    initial_reservation: Reservation,
    job: ActiveJob,
    input_path: PathBuf,
    resolution: Resolution,
    segment_dir: PathBuf,
    start_time_seconds: Option<f64>,
    end_time_seconds: Option<f64>,
) {
    let cascade_span = info_span!(
        "transcode.job",
        job.id = %job.with_inner(|i| i.id.clone()),
        job.video_id = %job.with_inner(|i| i.video_id.clone()),
        job.resolution = resolution.to_internal(),
    );
    let _enter = cascade_span.enter();

    job.with_inner_mut(|i| i.status = JobStatus::Running);
    let job_id_owned = job.with_inner(|i| i.id.clone());
    let _ = update_job_status(
        &ctx.db,
        &job_id_owned,
        "running",
        JobStatusUpdate::default(),
    );

    // Probe — cache the metadata once, reuse across cascade tiers.
    let mut file = FfmpegFile::new(&input_path);
    let probe_result = file.probe(&ctx.ffmpeg_paths.ffprobe).await;
    let metadata = match probe_result {
        Ok(m) => m.clone(),
        Err(err) => {
            initial_reservation.release();
            let msg = format!("ffprobe failed: {err}");
            error!(error = %err, "ffprobe failed");
            job.with_inner_mut(|i| {
                i.status = JobStatus::Error;
                i.error = Some(msg.clone());
                i.error_code = Some(PlaybackErrorCode::ProbeFailed);
            });
            let _ = update_job_status(
                &ctx.db,
                &job_id_owned,
                "error",
                JobStatusUpdate {
                    error: Some(&msg),
                    ..Default::default()
                },
            );
            return;
        }
    };

    // Spin up the segment watcher BEFORE the spawn — kernel queues events
    // from the very first file ffmpeg writes (init.mp4 + segment_0000.m4s).
    let watcher_handle = spawn_segment_watcher(ctx.clone(), job.clone(), segment_dir.clone());

    // Cascade tier sequencing. Per-source state cache promotes a known-bad
    // video straight to the right tier on subsequent chunks.
    let video_id = job.with_inner(|i| i.video_id.clone());
    let mut tier = match (ctx.vaapi_state.get(&video_id).map(|r| *r), &ctx.hw_accel) {
        (Some(VaapiVideoState::HwUnsafe), _) | (_, HwAccelConfig::Software) => {
            CascadeTier::Software
        }
        (Some(VaapiVideoState::NeedsSwPad), HwAccelConfig::Vaapi { .. }) => CascadeTier::SwPadVaapi,
        (None, HwAccelConfig::Vaapi { .. }) => CascadeTier::FastVaapi,
        _ => CascadeTier::Software,
    };

    let mut current_reservation = Some(initial_reservation);
    let final_outcome: Option<ExitOutcome> = loop {
        let reservation = match current_reservation.take() {
            Some(r) => r,
            None => match ctx.pool.try_reserve_slot(job_id_owned.clone()) {
                Some(r) => r,
                None => {
                    error!(
                        job_id = %job_id_owned,
                        "Cascade aborted — concurrency cap reached during retry"
                    );
                    job.with_inner_mut(|i| {
                        i.status = JobStatus::Error;
                        i.error = Some("Cascade retry blocked by concurrency cap".to_string());
                        i.error_code = Some(PlaybackErrorCode::EncodeFailed);
                    });
                    break None;
                }
            },
        };

        let hw_for_tier = match (tier, &ctx.hw_accel) {
            (CascadeTier::Software, _) => HwAccelConfig::Software,
            (CascadeTier::FastVaapi | CascadeTier::SwPadVaapi, HwAccelConfig::Vaapi { device }) => {
                HwAccelConfig::Vaapi {
                    device: device.clone(),
                }
            }
            _ => HwAccelConfig::Software,
        };
        let use_sw_pad = matches!(tier, CascadeTier::SwPadVaapi);

        // Direct fmp4 output: ffmpeg writes a single growing
        // `chunk.fmp4`; the tail-reader splits it into init.mp4 +
        // segment_NNNN.m4s so the segment watcher upstream sees the
        // shape it always has.
        let chunk_path = segment_dir.join("chunk.fmp4");
        // Wipe any prior tier's `chunk.fmp4` (and any stale split
        // artifacts) so a retry produces clean files. The notify
        // watcher only fires on Create/Modify so a residual file
        // would not re-trigger handlers — but it would confuse the
        // tail-reader's parser.
        let _ = tokio::fs::remove_file(&chunk_path).await;
        let _ = tokio::fs::remove_file(segment_dir.join("init.mp4")).await;
        let chunk_path_str = chunk_path.to_string_lossy().to_string();
        let profile = profile_for(resolution);
        let argv_struct = build_encode_argv(
            &metadata,
            &hw_for_tier,
            &profile,
            &chunk_path_str,
            use_sw_pad,
        );

        let mut full_args: Vec<std::ffi::OsString> = Vec::new();
        full_args.push("-hide_banner".into());
        full_args.push("-loglevel".into());
        full_args.push("error".into());
        for s in argv_struct.pre_input {
            full_args.push(s.into());
        }
        if let Some(s) = start_time_seconds {
            full_args.push("-ss".into());
            full_args.push(format_seconds(s).into());
        }
        full_args.push("-i".into());
        full_args.push(input_path.as_os_str().to_owned());
        if let (Some(start), Some(end)) = (start_time_seconds, end_time_seconds) {
            full_args.push("-t".into());
            full_args.push(format_seconds(end - start).into());
        }
        for s in argv_struct.post_input {
            full_args.push(s.into());
        }

        info!(
            tier = ?tier,
            hwaccel = hw_for_tier.kind_str(),
            "transcode_started"
        );

        // Spawn the fmp4 tail-reader alongside ffmpeg. It opens the
        // growing `chunk.fmp4`, parses MP4 box headers, and writes
        // split files atomically. The oneshot tells it ffmpeg has
        // exited so it can drain the trailing bytes and return.
        let (tail_done_tx, tail_done_rx) = tokio::sync::oneshot::channel();
        let tail_source = chunk_path.clone();
        let tail_output_dir = segment_dir.clone();
        let tail_handle = tokio::spawn(async move {
            fmp4_tail_reader::run(tail_source, tail_output_dir, tail_done_rx).await
        });

        let outcome = ctx
            .pool
            .run_to_completion(reservation, &ctx.ffmpeg_paths.ffmpeg, &full_args)
            .await;
        // Tell the tail-reader ffmpeg is done, then wait for it to
        // drain. Errors here aren't fatal to the cascade — the
        // segments already written are usable; we just log.
        let _ = tail_done_tx.send(());
        match tail_handle.await {
            Ok(Ok(stats)) => {
                info!(
                    init_bytes = stats.init_bytes,
                    segments = stats.segments_written,
                    total_bytes = stats.total_bytes,
                    "fmp4_tail.complete"
                );
            }
            Ok(Err(err)) => {
                warn!(error = %err, "fmp4_tail.error");
            }
            Err(err) => {
                warn!(error = %err, "fmp4_tail.join_error");
            }
        }
        // Best-effort cleanup of the source file. The split files
        // (init.mp4 + segment_NNNN.m4s) are what the rest of the
        // pipeline needs; chunk.fmp4 has served its purpose.
        let _ = tokio::fs::remove_file(&chunk_path).await;

        let outcome = match outcome {
            Ok(o) => o,
            Err(err) => {
                error!(error = %err, "ffmpeg pool error");
                job.with_inner_mut(|i| {
                    i.status = JobStatus::Error;
                    i.error = Some(err.to_string());
                    i.error_code = Some(PlaybackErrorCode::EncodeFailed);
                });
                break None;
            }
        };

        match outcome {
            ExitOutcome::Complete { .. } => {
                break Some(outcome);
            }
            ExitOutcome::Killed { .. } => {
                break Some(outcome);
            }
            ExitOutcome::Error {
                code,
                ref stderr_tail,
            } => {
                let tail = stderr_tail.clone();
                let code_for_log = code;
                // Decide next tier.
                let next_tier = match (tier, metadata.is_hdr) {
                    (CascadeTier::FastVaapi, false) => {
                        ctx.vaapi_state
                            .insert(video_id.clone(), VaapiVideoState::NeedsSwPad);
                        warn!(
                            ffmpeg_exit_code = ?code_for_log,
                            ffmpeg_stderr = %tail,
                            "Fast VAAPI failed — retrying with sw-pad"
                        );
                        Some(CascadeTier::SwPadVaapi)
                    }
                    (CascadeTier::FastVaapi, true) => {
                        // HDR cascade skips sw-pad — same chain at both tiers.
                        Some(CascadeTier::Software)
                    }
                    (CascadeTier::SwPadVaapi, _) => {
                        ctx.vaapi_state
                            .insert(video_id.clone(), VaapiVideoState::HwUnsafe);
                        warn!(
                            ffmpeg_exit_code = ?code_for_log,
                            ffmpeg_stderr = %tail,
                            "Sw-pad VAAPI failed — falling back to software"
                        );
                        Some(CascadeTier::Software)
                    }
                    (CascadeTier::Software, _) => {
                        // Final tier failed — surface the error.
                        None
                    }
                };

                match next_tier {
                    Some(t) => {
                        tier = t;
                        continue;
                    }
                    None => {
                        error!(
                            ffmpeg_exit_code = ?code_for_log,
                            ffmpeg_stderr = %tail,
                            "Transcode error — final tier failed"
                        );
                        job.with_inner_mut(|i| {
                            i.status = JobStatus::Error;
                            i.error = Some(format!("ffmpeg exited with code {code_for_log:?}"));
                            i.error_code = Some(PlaybackErrorCode::EncodeFailed);
                        });
                        break Some(outcome);
                    }
                }
            }
        }
    };

    // Cancel the segment watcher task. `drop` on a JoinHandle only detaches
    // it — the task keeps running. Inside the watcher, `rx.recv().await`
    // blocks until the inotify channel closes, but the channel's `tx` is
    // owned by the watcher itself (held inside the task's locals), so the
    // task would never exit on its own once the cascade is done. `abort()`
    // wakes the task with a cancellation, dropping its locals — including
    // the `notify::Watcher` that spawned an OS thread — so resources are
    // actually freed instead of leaked per transcode.
    watcher_handle.abort();

    match final_outcome {
        Some(ExitOutcome::Complete { .. }) => {
            let segment_count = job.with_inner(|i| i.completed_count());
            // Silent-failure event — clean exit, zero segments. The HDR 4K
            // VAAPI silent-success class.
            if segment_count == 0 {
                warn!(
                    chunk_start_s = start_time_seconds.unwrap_or(0.0),
                    "transcode_silent_failure: clean exit but zero segments written"
                );
                job.with_inner_mut(|i| {
                    i.status = JobStatus::Error;
                    i.error = Some("Clean exit but zero segments written".to_string());
                    i.error_code = Some(PlaybackErrorCode::EncodeFailed);
                });
                let _ = update_job_status(
                    &ctx.db,
                    &job_id_owned,
                    "error",
                    JobStatusUpdate {
                        error: Some("Clean exit but zero segments written"),
                        ..Default::default()
                    },
                );
            } else {
                info!(segment_count, "transcode_complete");
                job.with_inner_mut(|i| {
                    i.status = JobStatus::Complete;
                    i.total_segments = Some(segment_count);
                });
                let _ = update_job_status(
                    &ctx.db,
                    &job_id_owned,
                    "complete",
                    JobStatusUpdate {
                        total_segments: Some(segment_count),
                        completed_segments: Some(segment_count),
                        error: None,
                    },
                );
            }
        }
        Some(ExitOutcome::Killed { reason, .. }) => {
            info!(kill_reason = reason.as_wire_str(), "transcode_killed");
            let msg = format!("ffmpeg killed — {}", reason.as_wire_str());
            job.with_inner_mut(|i| {
                i.status = JobStatus::Error;
                i.error = Some(msg.clone());
            });
            let _ = update_job_status(
                &ctx.db,
                &job_id_owned,
                "error",
                JobStatusUpdate {
                    error: Some(&msg),
                    ..Default::default()
                },
            );
        }
        Some(ExitOutcome::Error { .. }) | None => {
            // Already updated job state above, but make sure the DB row
            // matches.
            let msg = job
                .with_inner(|i| i.error.clone())
                .unwrap_or_else(|| "Encode failed".to_string());
            let _ = update_job_status(
                &ctx.db,
                &job_id_owned,
                "error",
                JobStatusUpdate {
                    error: Some(&msg),
                    ..Default::default()
                },
            );
        }
    }
}

/// Spawn a notify watcher on `segment_dir`. Fires for `init.mp4` (sets the
/// init path on the job once size > 0) and for `segment_NNNN.m4s` files
/// (records each one in the DB + in-memory `ActiveJob`).
fn spawn_segment_watcher(
    ctx: AppContext,
    job: ActiveJob,
    segment_dir: PathBuf,
) -> tokio::task::JoinHandle<()> {
    let job_id = job.with_inner(|i| i.id.clone());
    let span = info_span!("chunker.watch", job.id = %job_id);
    tokio::spawn(
        async move {
            let (tx, mut rx) = mpsc::unbounded_channel::<Event>();
            let mut watcher =
                match notify::recommended_watcher(move |res: notify::Result<Event>| {
                    if let Ok(event) = res {
                        let _ = tx.send(event);
                    }
                }) {
                    Ok(w) => w,
                    Err(err) => {
                        warn!(error = %err, "could not start segment watcher");
                        return;
                    }
                };
            if let Err(err) = watcher.watch(&segment_dir, RecursiveMode::NonRecursive) {
                warn!(error = %err, "could not watch segment dir");
                return;
            }

            let mut seen: HashMap<String, ()> = HashMap::new();
            while let Some(event) = rx.recv().await {
                let job_status = job.with_inner(|i| i.status);
                if matches!(job_status, JobStatus::Error | JobStatus::Complete) {
                    break;
                }
                if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                    continue;
                }
                for path in event.paths {
                    handle_watcher_path(&ctx, &job, &segment_dir, &path, &mut seen).await;
                }
            }
        }
        .instrument(span),
    )
}

async fn handle_watcher_path(
    ctx: &AppContext,
    job: &ActiveJob,
    segment_dir: &Path,
    path: &Path,
    seen: &mut HashMap<String, ()>,
) {
    let filename = match path.file_name().and_then(|f| f.to_str()) {
        Some(f) => f.to_string(),
        None => return,
    };

    if filename == "init.mp4" {
        let already_set = job.with_inner(|i| i.init_segment_path.is_some());
        if already_set {
            return;
        }
        let init_path = segment_dir.join("init.mp4");
        // Stat-poll until the file has content — `notify` fires on
        // file CREATE before ffmpeg has flushed any bytes, so reading the
        // path immediately would hand a zero-byte file to the stream
        // pump. Budget = INIT_FLUSH_POLL_ATTEMPTS × INIT_FLUSH_POLL_INTERVAL_MS
        // (2 s today). Generous for the typical sub-100 ms flush; if it
        // ever runs out, the warn below makes the cause obvious.
        for _ in 0..INIT_FLUSH_POLL_ATTEMPTS {
            match tokio::fs::metadata(&init_path).await {
                Ok(meta) if meta.len() > 0 => {
                    let path_str = init_path.to_string_lossy().to_string();
                    job.with_inner_mut(|i| {
                        i.init_segment_path = Some(path_str.clone());
                    });
                    info!(size_bytes = meta.len(), "init segment ready");
                    return;
                }
                _ => {
                    tokio::time::sleep(Duration::from_millis(INIT_FLUSH_POLL_INTERVAL_MS)).await;
                }
            }
        }
        warn!("init segment still empty after polling — skipping");
        return;
    }

    if !filename.starts_with("segment_") || !filename.ends_with(".m4s") {
        return;
    }
    if seen.contains_key(&filename) {
        return;
    }
    seen.insert(filename.clone(), ());

    let index_str = filename
        .trim_start_matches("segment_")
        .trim_end_matches(".m4s");
    let index: i64 = match index_str.parse() {
        Ok(n) => n,
        Err(_) => return,
    };
    let full_path = segment_dir.join(&filename);
    let size = tokio::fs::metadata(&full_path)
        .await
        .map(|m| m.len() as i64)
        .ok();

    let path_str = full_path.to_string_lossy().to_string();
    job.with_inner_mut(|i| {
        let idx = index as usize;
        if i.segments.len() <= idx {
            i.segments.resize(idx + 1, None);
        }
        i.segments[idx] = Some(path_str.clone());
        i.completed_segments = i.completed_count();
    });

    let job_id = job.with_inner(|i| i.id.clone());
    let _ = insert_segment(
        &ctx.db,
        &NewSegment {
            job_id: &job_id,
            segment_index: index,
            path: &path_str,
            duration_seconds: None,
            size_bytes: size,
        },
    );
    let completed = job.with_inner(|i| i.completed_segments);
    let status = job.with_inner(|i| job_status_wire(i.status));
    let _ = update_job_status(
        &ctx.db,
        &job_id,
        status,
        JobStatusUpdate {
            completed_segments: Some(completed),
            ..Default::default()
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_id_is_deterministic_for_same_input() {
        let a = job_id("fp1", Resolution::R1080p, Some(0.0), Some(30.0));
        let b = job_id("fp1", Resolution::R1080p, Some(0.0), Some(30.0));
        assert_eq!(a, b);
    }

    #[test]
    fn job_id_differs_for_different_resolution() {
        let a = job_id("fp1", Resolution::R1080p, None, None);
        let b = job_id("fp1", Resolution::R4k, None, None);
        assert_ne!(a, b);
    }

    #[test]
    fn job_id_differs_for_different_fingerprint() {
        let a = job_id("fp1", Resolution::R1080p, None, None);
        let b = job_id("fp2", Resolution::R1080p, None, None);
        assert_ne!(a, b);
    }

    #[test]
    fn job_id_uses_v3_namespace_literal() {
        // Recompute the same SHA-1 inline to assert the input string we
        // hash is literally "v3|<fp>|<res>|<start>|<end>" — proves we
        // didn't accidentally change the prefix or separator.
        let a = job_id("fp", Resolution::R1080p, None, None);
        let expected_hex: String = {
            let mut h = Sha1::new();
            h.update(b"v3|fp|1080p||");
            h.finalize()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
        };
        assert_eq!(a, expected_hex);
    }

    #[test]
    fn format_seconds_omits_decimal_for_integer_values() {
        assert_eq!(format_seconds(30.0), "30");
        assert_eq!(format_seconds(0.0), "0");
    }

    #[test]
    fn format_seconds_keeps_decimal_for_fractional_values() {
        assert_eq!(format_seconds(30.5), "30.5");
    }
}
