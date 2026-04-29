//! ffmpeg subprocess pool — `Arc<Semaphore>` cap, dying-set bookkeeping,
//! SIGTERM-then-SIGKILL escalation, server-shutdown sweep. Mirrors
//! `server/src/services/ffmpegPool.ts`.
//!
//! The pool's job is one and only one thing: enforce the concurrent-encode
//! cap and own subprocess lifecycle. The chunker decides what to encode and
//! how to react to exits; the pool only knows how to start, kill, and
//! report.
//!
//! Concurrency model:
//! - `Arc<Semaphore::new(max_concurrent_jobs)>` — every reservation holds
//!   an `OwnedSemaphorePermit`. Killed processes drop the permit
//!   immediately so a slow-to-exit ffmpeg can't starve the next request.
//! - `dying: DashSet<String>` records which jobs were killed
//!   deliberately, so the exit handler can distinguish a planned kill
//!   from a self-exit and emit the right `kill_reason`.
//! - `live: DashMap<String, LivePid>` keeps the OS pid (for `kill(2)`)
//!   alongside the `force_kill` token (a `Notify` the escalation task
//!   waits on so it can short-circuit if the process exits cleanly within
//!   the SIGTERM grace).

use std::collections::HashMap;
use std::ffi::OsString;
use std::path::Path;
use std::process::ExitStatus;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use dashmap::{DashMap, DashSet};
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore};
use tokio::time::sleep;
use tracing::{info, warn};

use crate::config::TranscodeConfig;
use crate::services::kill_reason::KillReason;

#[derive(Debug, Error)]
pub enum PoolError {
    #[error("spawning ffmpeg at {ffmpeg}: {source}")]
    Spawn {
        ffmpeg: std::path::PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("waiting on ffmpeg child for job {job_id}: {source}")]
    Wait {
        job_id: String,
        #[source]
        source: std::io::Error,
    },

    #[error("attempted to spawn but reservation was lost")]
    LostReservation,
}

/// Outcome of a single `run_to_completion` call.
#[derive(Debug)]
pub enum ExitOutcome {
    Complete { stderr_tail: String },
    Killed {
        reason: KillReason,
        stderr_tail: String,
    },
    Error {
        code: Option<i32>,
        stderr_tail: String,
    },
}

/// Token returned by `try_reserve_slot`. Holds the semaphore permit so
/// the slot stays claimed until the reservation is consumed (handed to
/// `run_to_completion`) or dropped (releases the permit).
pub struct Reservation {
    job_id: String,
    permit: Option<OwnedSemaphorePermit>,
}

impl Reservation {
    pub fn job_id(&self) -> &str {
        &self.job_id
    }

    /// Drop the permit explicitly. The chunker calls this on the
    /// non-spawn paths (DB-restored cached job, probe failure) where the
    /// reservation is never handed to `run_to_completion`.
    pub fn release(mut self) {
        let _ = self.permit.take();
    }
}

/// Snapshot for the chunker's `concurrency_cap_reached` telemetry.
#[derive(Clone, Debug)]
pub struct CapSnapshot {
    pub limit: usize,
    pub live_count: usize,
    pub inflight_count: usize,
    pub dying_count: usize,
    pub live_job_ids: Vec<String>,
    pub inflight_job_ids: Vec<String>,
    pub dying_job_ids: Vec<String>,
}

#[derive(Clone)]
struct LivePid {
    pid: u32,
}

#[derive(Clone)]
pub struct FfmpegPool {
    inner: Arc<PoolInner>,
}

struct PoolInner {
    config: TranscodeConfig,
    semaphore: Arc<Semaphore>,
    /// Live (running and dying) ffmpeg subprocess pids.
    live: DashMap<String, LivePid>,
    /// Jobs currently in the `try_reserve_slot → spawn` window.
    inflight: DashSet<String>,
    /// Jobs we've issued SIGTERM against. Their permits are already
    /// dropped from the cap accounting (we count `live - dying`).
    dying: DashSet<String>,
    kill_reasons: Mutex<HashMap<String, KillReason>>,
    /// Per-job notify the escalation task awaits — fires either by
    /// `force_kill_timeout_ms` elapsing (escalate to SIGKILL) or by the
    /// process exiting on its own (cancel escalation).
    escalation_cancel: Mutex<HashMap<String, Arc<Notify>>>,
}

impl FfmpegPool {
    pub fn new(config: TranscodeConfig) -> Self {
        let semaphore = Arc::new(Semaphore::new(config.max_concurrent_jobs));
        Self {
            inner: Arc::new(PoolInner {
                config,
                semaphore,
                live: DashMap::new(),
                inflight: DashSet::new(),
                dying: DashSet::new(),
                kill_reasons: Mutex::new(HashMap::new()),
                escalation_cancel: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub fn cap_limit(&self) -> usize {
        self.inner.config.max_concurrent_jobs
    }

    pub fn capacity_retry_hint_ms(&self) -> u64 {
        self.inner.config.capacity_retry_hint_ms
    }

    pub fn has_inflight_or_live(&self, id: &str) -> bool {
        self.inner.inflight.contains(id) || self.inner.live.contains_key(id)
    }

    pub fn try_reserve_slot(&self, job_id: String) -> Option<Reservation> {
        let permit = self.inner.semaphore.clone().try_acquire_owned().ok()?;
        self.inner.inflight.insert(job_id.clone());
        Some(Reservation {
            job_id,
            permit: Some(permit),
        })
    }

    pub fn snapshot_cap(&self) -> CapSnapshot {
        let live_job_ids: Vec<String> = self
            .inner
            .live
            .iter()
            .map(|r| r.key().clone())
            .filter(|id| !self.inner.dying.contains(id))
            .collect();
        let inflight_job_ids: Vec<String> =
            self.inner.inflight.iter().map(|r| r.key().clone()).collect();
        let dying_job_ids: Vec<String> = self.inner.dying.iter().map(|r| r.key().clone()).collect();
        CapSnapshot {
            limit: self.inner.config.max_concurrent_jobs,
            live_count: live_job_ids.len(),
            inflight_count: inflight_job_ids.len(),
            dying_count: dying_job_ids.len(),
            live_job_ids,
            inflight_job_ids,
            dying_job_ids,
        }
    }

    /// Spawn ffmpeg and wait for exit. Captures stderr into a ring
    /// buffer. The chunker decides what to do with the outcome.
    pub async fn run_to_completion(
        &self,
        reservation: Reservation,
        ffmpeg: &Path,
        args: &[OsString],
    ) -> Result<ExitOutcome, PoolError> {
        let Reservation { job_id, permit } = reservation;
        let permit = permit.ok_or(PoolError::LostReservation)?;
        self.inner.inflight.remove(&job_id);

        let mut command = Command::new(ffmpeg);
        command.args(args);
        command.kill_on_drop(true);
        command.stdin(std::process::Stdio::null());
        command.stdout(std::process::Stdio::null());
        command.stderr(std::process::Stdio::piped());

        let mut child = command.spawn().map_err(|source| PoolError::Spawn {
            ffmpeg: ffmpeg.to_path_buf(),
            source,
        })?;
        let pid = child.id().unwrap_or(0);

        // Register before we start the wait so kill_job can find it.
        self.inner.live.insert(job_id.clone(), LivePid { pid });

        let stderr_buf: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let stderr_task = if let Some(stderr) = child.stderr.take() {
            let buf = stderr_buf.clone();
            Some(tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    if let Ok(mut b) = buf.lock() {
                        b.push(line);
                        if b.len() > STDERR_RING_LINES {
                            b.remove(0);
                        }
                    }
                }
            }))
        } else {
            None
        };

        let exit_status = wait_with_job_id(&job_id, &mut child).await;

        if let Some(t) = stderr_task {
            let _ = t.await;
        }

        // Cancel escalation timer (if any), then clean up bookkeeping.
        if let Ok(mut m) = self.inner.escalation_cancel.lock() {
            if let Some(n) = m.remove(&job_id) {
                n.notify_waiters();
            }
        }
        let was_dying = self.inner.dying.remove(&job_id).is_some();
        let kill_reason = self
            .inner
            .kill_reasons
            .lock()
            .ok()
            .and_then(|mut m| m.remove(&job_id));
        self.inner.live.remove(&job_id);
        drop(permit);

        let stderr_tail = stderr_tail(&stderr_buf);
        let status = exit_status?;

        if was_dying {
            return Ok(ExitOutcome::Killed {
                reason: kill_reason.unwrap_or(KillReason::ClientRequest),
                stderr_tail,
            });
        }
        if status.success() {
            Ok(ExitOutcome::Complete { stderr_tail })
        } else {
            Ok(ExitOutcome::Error {
                code: status.code(),
                stderr_tail,
            })
        }
    }

    pub fn kill_job(&self, id: &str, reason: KillReason) {
        if !self.inner.live.contains_key(id) {
            if self.inner.inflight.remove(id).is_some() {
                info!(job_id = %id, kill_reason = reason.as_wire_str(),
                      "Released reservation — {}", reason.as_wire_str());
            }
            return;
        }
        if self.inner.dying.contains(id) {
            return;
        }
        self.inner.dying.insert(id.to_string());
        if let Ok(mut m) = self.inner.kill_reasons.lock() {
            m.insert(id.to_string(), reason);
        }
        info!(job_id = %id, kill_reason = reason.as_wire_str(),
              "Killing ffmpeg — {}", reason.as_wire_str());

        let pid = self.inner.live.get(id).map(|r| r.pid);
        if let Some(pid) = pid {
            send_signal(pid, Signal::Term);
        }

        // Schedule SIGKILL escalation; the wait task cancels it via the
        // shared notify.
        let cancel = Arc::new(Notify::new());
        if let Ok(mut m) = self.inner.escalation_cancel.lock() {
            m.insert(id.to_string(), cancel.clone());
        }
        let force_kill_ms = self.inner.config.force_kill_timeout_ms;
        let id_owned = id.to_string();
        let live = self.inner.live.clone();
        tokio::spawn(async move {
            tokio::select! {
                _ = sleep(Duration::from_millis(force_kill_ms)) => {
                    if let Some(r) = live.get(&id_owned) {
                        warn!(
                            job_id = %id_owned,
                            sigterm_timeout_ms = force_kill_ms,
                            "ffmpeg did not exit within {force_kill_ms}ms after SIGTERM — escalating to SIGKILL"
                        );
                        send_signal(r.pid, Signal::Kill);
                    }
                }
                _ = cancel.notified() => {
                    // Process exited cleanly within grace — escalation cancelled.
                }
            }
        });
    }

    pub async fn kill_all_jobs(&self) {
        if self.inner.live.is_empty() {
            return;
        }
        let ids: Vec<String> = self.inner.live.iter().map(|r| r.key().clone()).collect();
        for id in &ids {
            self.kill_job(id, KillReason::ServerShutdown);
        }
        sleep(Duration::from_millis(self.inner.config.shutdown_timeout_ms)).await;
        for r in self.inner.live.iter() {
            warn!(job_id = %r.key(), "Force-killing job (shutdown timeout)");
            send_signal(r.value().pid, Signal::Kill);
        }
    }
}

async fn wait_with_job_id(
    job_id: &str,
    child: &mut tokio::process::Child,
) -> Result<ExitStatus, PoolError> {
    child.wait().await.map_err(|source| PoolError::Wait {
        job_id: job_id.to_string(),
        source,
    })
}

const STDERR_RING_LINES: usize = 200;
const STDERR_ATTR_MAX_BYTES: usize = 4_096;

fn stderr_tail(buf: &Mutex<Vec<String>>) -> String {
    let lines = match buf.lock() {
        Ok(l) => l.clone(),
        Err(_) => return String::new(),
    };
    let joined = lines.join("\n");
    if joined.len() > STDERR_ATTR_MAX_BYTES {
        joined[joined.len() - STDERR_ATTR_MAX_BYTES..].to_string()
    } else {
        joined
    }
}

#[derive(Clone, Copy)]
enum Signal {
    Term,
    Kill,
}

#[cfg(unix)]
fn send_signal(pid: u32, signal: Signal) {
    use nix::sys::signal::{kill, Signal as NixSignal};
    use nix::unistd::Pid;
    let nix_sig = match signal {
        Signal::Term => NixSignal::SIGTERM,
        Signal::Kill => NixSignal::SIGKILL,
    };
    let _ = kill(Pid::from_raw(pid as i32), nix_sig);
}

#[cfg(not(unix))]
fn send_signal(_pid: u32, _signal: Signal) {
    // Windows: tokio::process::Child::start_kill is the only option;
    // there's no SIGTERM equivalent. The shutdown grace window collapses
    // to "immediate kill" — acceptable for v1, surfaced in the PR.
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    fn cfg(max: usize) -> TranscodeConfig {
        TranscodeConfig {
            max_concurrent_jobs: max,
            force_kill_timeout_ms: 100,
            shutdown_timeout_ms: 200,
            ..TranscodeConfig::default()
        }
    }

    #[test]
    fn try_reserve_slot_caps_at_configured_limit() {
        let pool = FfmpegPool::new(cfg(2));
        let r1 = pool.try_reserve_slot("a".into()).expect("slot 1");
        let r2 = pool.try_reserve_slot("b".into()).expect("slot 2");
        assert!(pool.try_reserve_slot("c".into()).is_none(), "cap reached");
        drop(r1);
        let r3 = pool.try_reserve_slot("c".into()).expect("slot reopened");
        drop(r2);
        drop(r3);
    }

    #[test]
    fn release_returns_slot_synchronously() {
        let pool = FfmpegPool::new(cfg(1));
        let r = pool.try_reserve_slot("a".into()).expect("slot");
        assert!(pool.try_reserve_slot("b".into()).is_none());
        r.release();
        assert!(pool.try_reserve_slot("b".into()).is_some());
    }

    #[test]
    fn snapshot_cap_reports_inflight_separately_from_live() {
        let pool = FfmpegPool::new(cfg(3));
        let _r = pool.try_reserve_slot("a".into()).expect("slot");
        let snap = pool.snapshot_cap();
        assert_eq!(snap.limit, 3);
        assert_eq!(snap.inflight_count, 1);
        assert_eq!(snap.live_count, 0);
        assert_eq!(snap.dying_count, 0);
    }

    #[test]
    fn has_inflight_or_live_after_reservation() {
        let pool = FfmpegPool::new(cfg(2));
        let _r = pool.try_reserve_slot("a".into()).expect("slot");
        assert!(pool.has_inflight_or_live("a"));
        assert!(!pool.has_inflight_or_live("b"));
    }

    #[test]
    fn kill_job_on_inflight_only_releases_reservation() {
        let pool = FfmpegPool::new(cfg(1));
        let _r = pool.try_reserve_slot("a".into()).expect("slot");
        assert!(pool.try_reserve_slot("b".into()).is_none());
        pool.kill_job("a", KillReason::ClientDisconnected);
        assert!(!pool.has_inflight_or_live("a"));
    }

    #[tokio::test]
    async fn run_to_completion_returns_complete_for_zero_exit() {
        let pool = FfmpegPool::new(cfg(1));
        let reservation = pool.try_reserve_slot("j1".into()).expect("slot");
        let outcome = pool
            .run_to_completion(reservation, Path::new("/bin/true"), &[])
            .await
            .expect("run");
        match outcome {
            ExitOutcome::Complete { .. } => {}
            other => panic!("expected Complete, got {other:?}"),
        }
        assert!(pool.try_reserve_slot("after".into()).is_some());
    }

    #[tokio::test]
    async fn run_to_completion_returns_error_for_nonzero_exit() {
        let pool = FfmpegPool::new(cfg(1));
        let reservation = pool.try_reserve_slot("j1".into()).expect("slot");
        let outcome = pool
            .run_to_completion(reservation, Path::new("/bin/false"), &[])
            .await
            .expect("run");
        match outcome {
            ExitOutcome::Error { code, .. } => assert_eq!(code, Some(1)),
            other => panic!("expected Error, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn run_to_completion_killed_returns_killed_outcome_with_reason() {
        let pool = FfmpegPool::new(cfg(1));
        let reservation = pool.try_reserve_slot("sleeper".into()).expect("slot");
        let pool_for_kill = pool.clone();
        let args = [OsStr::new("30").to_owned()];
        let run_fut = pool.run_to_completion(reservation, Path::new("/bin/sleep"), &args);
        let kill_fut = async move {
            tokio::time::sleep(Duration::from_millis(80)).await;
            pool_for_kill.kill_job("sleeper", KillReason::ClientDisconnected);
        };
        let (result, _) = tokio::join!(run_fut, kill_fut);
        match result.expect("run") {
            ExitOutcome::Killed { reason, .. } => {
                assert_eq!(reason, KillReason::ClientDisconnected);
            }
            other => panic!("expected Killed, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn kill_job_idempotent_second_call_no_op() {
        let pool = FfmpegPool::new(cfg(1));
        let reservation = pool.try_reserve_slot("sleeper".into()).expect("slot");
        let pool_for_kill = pool.clone();
        let args = [OsStr::new("30").to_owned()];
        let run_fut = pool.run_to_completion(reservation, Path::new("/bin/sleep"), &args);
        let kill_fut = async move {
            tokio::time::sleep(Duration::from_millis(80)).await;
            pool_for_kill.kill_job("sleeper", KillReason::ClientDisconnected);
            pool_for_kill.kill_job("sleeper", KillReason::ServerShutdown); // second call no-op
        };
        let (result, _) = tokio::join!(run_fut, kill_fut);
        match result.expect("run") {
            ExitOutcome::Killed { reason, .. } => {
                // The first kill wins — server_shutdown does NOT overwrite.
                assert_eq!(reason, KillReason::ClientDisconnected);
            }
            other => panic!("expected Killed, got {other:?}"),
        }
    }
}
