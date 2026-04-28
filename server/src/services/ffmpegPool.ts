import type { FfmpegCommand } from "fluent-ffmpeg";

import { config } from "../config.js";
import { getOtelLogger } from "../telemetry/index.js";

const log = getOtelLogger("ffmpegPool");

export type KillReason =
  | "client_request"
  | "client_disconnected"
  | "stream_idle_timeout"
  | "orphan_no_connection"
  | "max_encode_timeout"
  | "cascade_retry"
  | "server_shutdown";

export interface ProgressData {
  frames?: number;
  currentFps?: number;
  currentKbps?: number;
  timemark?: string;
  percent?: number;
}

export interface ProcessHooks {
  onStart?: (cmdLine: string) => void;
  onStderr?: (line: string) => void;
  onProgress?: (p: ProgressData) => void;
  /** ffmpeg exited 0 on its own. */
  onComplete: () => void;
  /** We killed it via killJob() — receives the reason that was passed. */
  onKilled: (reason: KillReason) => void;
  /** ffmpeg exited non-zero on its own (NOT because of our kill). */
  onError: (err: Error) => void;
}

export interface CapSnapshot {
  limit: number;
  /** Spawned and not killing — counted toward cap. */
  liveCount: number;
  /** Reserved, not yet spawned — counted toward cap. */
  inflightCount: number;
  /** SIGTERM dispatched, awaiting exit — NOT counted toward cap. */
  dyingCount: number;
  liveJobIds: string[];
  inflightJobIds: string[];
  dyingJobIds: string[];
}

export interface Reservation {
  readonly jobId: string;
  /** Cancel the reservation without spawning. Idempotent. */
  release(): void;
}

const reservations = new Set<string>();
const liveCommands = new Map<string, FfmpegCommand>();
const dyingJobIds = new Set<string>();
const killReasons = new Map<string, KillReason>();
const escalationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hooksByJobId = new Map<string, ProcessHooks>();

function liveActiveCount(): number {
  return liveCommands.size - dyingJobIds.size;
}

export function getCapLimit(): number {
  return config.transcode.maxConcurrentJobs;
}

/** Try to claim a slot. Returns null if the cap is exhausted. */
export function tryReserveSlot(jobId: string): Reservation | null {
  if (liveActiveCount() + reservations.size >= config.transcode.maxConcurrentJobs) return null;
  reservations.add(jobId);
  let released = false;
  return {
    jobId,
    release(): void {
      if (released) return;
      released = true;
      reservations.delete(jobId);
    },
  };
}

/** True if the id is held by either a reservation or a live (or dying) command. */
export function hasInflightOrLive(id: string): boolean {
  return reservations.has(id) || liveCommands.has(id);
}

/** Snapshot for the chunker's `concurrency_cap_reached` telemetry. */
export function snapshotCap(): CapSnapshot {
  const liveIds = [...liveCommands.keys()].filter((id) => !dyingJobIds.has(id));
  return {
    limit: config.transcode.maxConcurrentJobs,
    liveCount: liveIds.length,
    inflightCount: reservations.size,
    dyingCount: dyingJobIds.size,
    liveJobIds: liveIds,
    inflightJobIds: [...reservations],
    dyingJobIds: [...dyingJobIds],
  };
}

/** Hand a built FfmpegCommand to the pool. The reservation is consumed.
 * The pool wires .on("start"|"stderr"|"progress"|"end"|"error") and calls .run(). */
export function spawnProcess(
  reservation: Reservation,
  command: FfmpegCommand,
  hooks: ProcessHooks
): void {
  const id = reservation.jobId;
  reservations.delete(id);
  liveCommands.set(id, command);
  hooksByJobId.set(id, hooks);

  if (hooks.onStart) command.on("start", hooks.onStart);
  if (hooks.onStderr) command.on("stderr", hooks.onStderr);
  if (hooks.onProgress) command.on("progress", hooks.onProgress);

  command
    .on("end", () => {
      onProcessExit(id, "end");
    })
    .on("error", (err: Error) => {
      onProcessExit(id, "error", err);
    })
    .run();
}

function onProcessExit(id: string, kind: "end" | "error", err?: Error): void {
  const wasDying = dyingJobIds.has(id);
  const reason = killReasons.get(id);
  const hooks = hooksByJobId.get(id);

  liveCommands.delete(id);
  dyingJobIds.delete(id);
  killReasons.delete(id);
  hooksByJobId.delete(id);
  const timer = escalationTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    escalationTimers.delete(id);
  }

  if (!hooks) return;
  if (wasDying) {
    hooks.onKilled(reason ?? "client_request");
  } else if (kind === "end") {
    hooks.onComplete();
  } else {
    hooks.onError(err ?? new Error("ffmpeg exited with error"));
  }
}

/** SIGTERM the process; schedule SIGKILL after config.transcode.forceKillTimeoutMs if alive.
 * Idempotent — second kill on the same id is a no-op (escalation already pending).
 * No-op if the id is unknown. If the id is a not-yet-spawned reservation, the
 * reservation is released. */
export function killJob(id: string, reason: KillReason): void {
  const command = liveCommands.get(id);
  if (!command) {
    if (reservations.has(id)) {
      reservations.delete(id);
      log.info(`Released reservation — ${reason}`, { job_id: id, kill_reason: reason });
    }
    return;
  }
  if (dyingJobIds.has(id)) return;

  dyingJobIds.add(id);
  killReasons.set(id, reason);
  log.info(`Killing ffmpeg — ${reason}`, { job_id: id, kill_reason: reason });
  try {
    command.kill("SIGTERM");
  } catch {
    dyingJobIds.delete(id);
    killReasons.delete(id);
    return;
  }

  const timer = setTimeout(() => {
    escalationTimers.delete(id);
    if (!liveCommands.has(id)) return;
    log.warn(
      `ffmpeg did not exit within ${config.transcode.forceKillTimeoutMs}ms after SIGTERM — escalating to SIGKILL`,
      {
        job_id: id,
        kill_reason: reason,
        sigterm_timeout_ms: config.transcode.forceKillTimeoutMs,
      }
    );
    try {
      command.kill("SIGKILL");
    } catch {
      // already gone between the check and the signal
    }
  }, config.transcode.forceKillTimeoutMs);
  escalationTimers.set(id, timer);
}

/** Server-shutdown sweep: SIGTERM every live job, await up to timeoutMs,
 * SIGKILL any laggards. Per-job escalation (config.transcode.forceKillTimeoutMs) is the
 * primary defence; this terminal SIGKILL pass exists in case the timer
 * itself was preempted. */
export async function killAllJobs(timeoutMs?: number): Promise<void> {
  const sweepTimeoutMs = timeoutMs ?? config.transcode.shutdownTimeoutMs;
  if (liveCommands.size === 0) return;

  const ids = [...liveCommands.keys()];
  const exits = ids.map((id) => {
    const command = liveCommands.get(id);
    if (!command) return Promise.resolve();
    return new Promise<void>((resolve) => {
      command.once("end", () => resolve());
      command.once("error", () => resolve());
      killJob(id, "server_shutdown");
    });
  });

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, sweepTimeoutMs));
  await Promise.race([Promise.all(exits), timeout]);

  for (const [id, command] of liveCommands) {
    log.warn("Force-killing job (shutdown timeout)", { job_id: id });
    try {
      command.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
}
