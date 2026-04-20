import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createHash } from "crypto";
import ffmpeg, { type FfmpegCommand } from "fluent-ffmpeg";
import { watch } from "fs";
import { access, mkdir, rm, stat } from "fs/promises";
import { join, resolve } from "path";

import { config, RESOLUTION_PROFILES } from "../config.js";
import { getJobById, insertJob, updateJobStatus } from "../db/queries/jobs.js";
import { getSegmentsByJob, insertSegment } from "../db/queries/segments.js";
import { getVideoById } from "../db/queries/videos.js";
import { getOtelLogger, getTracer } from "../telemetry.js";
import type { ActiveJob, Resolution } from "../types.js";
import { FFmpegFile } from "./ffmpegFile.js";
import { getJob, setJob } from "./jobStore.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const log = getOtelLogger("chunker");
const chunkerTracer = getTracer("chunker");
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Tracks all ffmpeg processes currently encoding so they can be killed on shutdown.
const activeCommands = new Map<string, FfmpegCommand>();

// Job IDs that were deliberately killed (SIGTERM/SIGKILL). When ffmpeg exits cleanly
// after a SIGTERM it fires .on("end") rather than .on("error"), which would otherwise
// mark the job "complete" with a truncated segment set. This set lets the "end" handler
// detect a kill and treat the exit as an error instead.
const killedJobs = new Set<string>();

// Job IDs currently being initialized — between the start of startTranscodeJob and
// the setJob() call that makes them visible in jobStore. Guards against concurrent
// calls with identical parameters spawning duplicate ffmpeg processes during the
// async window (ffprobe, mkdir) before setJob() registers the job.
const inflightJobIds = new Set<string>();

/** Maximum number of concurrently running ffmpeg jobs. */
const MAX_CONCURRENT_JOBS = 3;

/**
 * Inflight dedup polling: when a concurrent call finds the same job already
 * in-flight, it sleeps INFLIGHT_DEDUP_POLL_MS and re-checks jobStore until the
 * job appears or the total wait exceeds INFLIGHT_DEDUP_TIMEOUT_MS.
 */
const INFLIGHT_DEDUP_POLL_MS = 100;
const INFLIGHT_DEDUP_TIMEOUT_MS = 5_000;
const INFLIGHT_DEDUP_MAX_RETRIES = INFLIGHT_DEDUP_TIMEOUT_MS / INFLIGHT_DEDUP_POLL_MS;

/**
 * Gracefully shuts down all active ffmpeg jobs:
 * 1. Sends SIGTERM to every running process.
 * 2. Waits up to `timeoutMs` for each to exit.
 * 3. SIGKILLs any process that did not exit within the timeout.
 */
export async function killAllActiveJobs(timeoutMs = 5000): Promise<void> {
  if (activeCommands.size === 0) return;

  const exitPromises = [...activeCommands.entries()].map(([id, command]) => {
    return new Promise<void>((resolve) => {
      const cleanup = (): void => {
        activeCommands.delete(id);
        resolve();
      };
      command.once("end", cleanup);
      command.once("error", cleanup);
      console.log(`[chunker] Killing job ${id.slice(0, 8)}`);
      killedJobs.add(id);
      try {
        command.kill("SIGTERM");
      } catch {
        killedJobs.delete(id);
        cleanup();
      }
    });
  });

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([Promise.all(exitPromises), timeout]);

  // SIGKILL any processes that didn't exit within the timeout
  for (const [id, command] of activeCommands) {
    console.warn(`[chunker] Force-killing job ${id.slice(0, 8)} (SIGTERM timeout)`);
    try {
      command.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
  activeCommands.clear();
}

function jobId(contentKey: string, resolution: Resolution, start?: number, end?: number): string {
  return createHash("sha1")
    .update(`${contentKey}|${resolution}|${start ?? ""}|${end ?? ""}`)
    .digest("hex");
}

/**
 * Kills the ffmpeg process for a specific job. Safe to call even if the job has
 * already finished — the command map won't contain it in that case.
 */
export function killJob(id: string): void {
  const command = activeCommands.get(id);
  if (!command) return;
  console.log(`[chunker] Killing job ${id.slice(0, 8)} — no active connections`);
  // Mark as killed BEFORE sending the signal. ffmpeg sometimes exits cleanly on
  // SIGTERM (firing .on("end") instead of .on("error")), which would mark the job
  // "complete" with a truncated segment set. The killedJobs set prevents that.
  killedJobs.add(id);
  try {
    command.kill("SIGTERM");
  } catch {
    killedJobs.delete(id);
  }
}

export async function startTranscodeJob(
  videoId: string,
  resolution: Resolution,
  startTimeSeconds?: number,
  endTimeSeconds?: number
): Promise<ActiveJob> {
  const video = getVideoById(videoId);
  if (!video) throw new Error(`Video not found: ${videoId}`);

  const id = jobId(video.content_fingerprint, resolution, startTimeSeconds, endTimeSeconds);

  // Return existing in-memory job if already running or complete
  const existing = getJob(id);
  if (existing && existing.status !== "error") return existing;

  // If a concurrent call is already initializing this exact job (between this
  // function's entry and the setJob() call below), wait for it to register rather
  // than spawning a second ffmpeg process.
  if (inflightJobIds.has(id)) {
    for (let i = 0; i < INFLIGHT_DEDUP_MAX_RETRIES; i++) {
      await Bun.sleep(INFLIGHT_DEDUP_POLL_MS);
      const pending = getJob(id);
      if (pending) return pending;
    }
    // If still not registered after INFLIGHT_DEDUP_TIMEOUT_MS, fall through.
    console.warn(`[chunker] Inflight dedup timeout for job ${id.slice(0, 8)} — proceeding`);
  }

  // Guard against runaway resource use — cap concurrent ffmpeg processes.
  // Include inflightJobIds in the count: those jobs haven't called activeCommands.set
  // yet (that happens after ffprobe inside runFfmpeg), so activeCommands.size alone
  // would undercount concurrent work during the initialization window.
  if (activeCommands.size + inflightJobIds.size >= MAX_CONCURRENT_JOBS) {
    throw new Error(
      `Too many concurrent streams (limit: ${MAX_CONCURRENT_JOBS}). Close another player tab and try again.`
    );
  }

  // Register synchronously before the first await so any concurrent call with the
  // same parameters sees this job as in-flight and waits rather than proceeding.
  inflightJobIds.add(id);

  try {
    // Restore a completed job from a previous server session without re-encoding.
    // Verify the init segment actually exists on disk — a "complete" entry whose
    // segment dir was wiped (or was left truncated by old restore logic) must be
    // treated as an error so startTranscodeJob re-encodes cleanly.
    const dbJob = getJobById(id);
    // shouldWipeDir is set when we need to delete the segment directory before
    // re-encoding — either because the job previously errored (stale partial
    // data) or because a "complete" job is missing its init.mp4 on disk.
    let shouldWipeDir = false;

    if (dbJob && dbJob.status === "complete") {
      const initPath = join(dbJob.segment_dir, "init.mp4");
      const initExists = await access(initPath)
        .then(() => true)
        .catch(() => false);

      if (initExists) {
        const dbSegments = getSegmentsByJob(id);
        if (dbSegments.length > 0) {
          const segments: string[] = [];
          for (const seg of dbSegments) {
            segments[seg.segment_index] = seg.path;
          }
          const restored: ActiveJob = {
            ...dbJob,
            segments,
            initSegmentPath: initPath,
            subscribers: new Set(),
            connections: 0,
          };
          setJob(restored);
          console.log(
            `[chunker] Restored completed job ${id.slice(0, 8)} from DB (${dbSegments.length} segments)`
          );
          log.info("Restored completed job from DB", {
            job_id: id,
            segment_count: dbSegments.length,
          });
          return restored;
        }
      } else {
        // Segment dir was wiped or truncated — force re-encode and wipe any
        // partial files so the stream handler doesn't serve stale data.
        console.warn(
          `[chunker] Completed job ${id.slice(0, 8)} missing init.mp4 on disk — treating as error`
        );
        updateJobStatus(id, "error", { error: "Segment dir missing — will re-encode" });
        shouldWipeDir = true;
      }
    }

    const segmentDir = resolve(config.segmentDir, id);

    // Wipe stale segment directories from prior errored (or missing-init) encodes
    // so the stream handler never serves truncated or partial content.
    if ((dbJob && dbJob.status === "error") || shouldWipeDir) {
      await rm(segmentDir, { recursive: true, force: true });
      console.log(`[chunker] Cleared stale segment dir for job ${id.slice(0, 8)}`);
    }

    await mkdir(segmentDir, { recursive: true });

    const now = new Date().toISOString();
    const job: ActiveJob = {
      id,
      video_id: videoId,
      resolution,
      status: "pending",
      segment_dir: segmentDir,
      total_segments: null,
      completed_segments: 0,
      start_time_seconds: startTimeSeconds ?? null,
      end_time_seconds: endTimeSeconds ?? null,
      created_at: now,
      updated_at: now,
      error: null,
      segments: [],
      initSegmentPath: null,
      subscribers: new Set(),
      connections: 0,
    };

    insertJob(job);
    setJob(job);
    // Job is now in jobStore — any concurrent duplicate can find it via getJob().
    // Keep id in inflightJobIds until runFfmpeg calls activeCommands.set() (after
    // ffprobe). Deleting it here would open a window where neither activeCommands
    // nor inflightJobIds counts this job, letting the MAX_CONCURRENT_JOBS cap be
    // bypassed by a concurrent call during the ffprobe window.
    void runFfmpeg(job, video.path, resolution, segmentDir, startTimeSeconds, endTimeSeconds);

    return job;
  } catch (err) {
    inflightJobIds.delete(id);
    throw err;
  }
}

async function runFfmpeg(
  job: ActiveJob,
  inputPath: string,
  resolution: Resolution,
  segmentDir: string,
  startTime?: number,
  endTime?: number
): Promise<void> {
  job.status = "running";
  updateJobStatus(job.id, "running");

  const jobSpan = chunkerTracer.startSpan("transcode.job", {
    attributes: {
      "job.id": job.id,
      "job.resolution": resolution,
      "job.chunk_start_s": startTime ?? 0,
      "job.chunk_duration_s": endTime !== undefined ? endTime - (startTime ?? 0) : -1,
    },
  });

  const profile = RESOLUTION_PROFILES[resolution];
  const initPath = join(segmentDir, "init.mp4");
  const segmentPattern = join(segmentDir, "segment_%04d.m4s");

  // Probe the file to derive correct transcode parameters
  const file = new FFmpegFile(inputPath);
  try {
    await file.probe();
    console.log(`[chunker] Job ${job.id.slice(0, 8)} — source: ${file.summary()}`);
    log.info("ffprobe complete", { job_id: job.id, summary: file.summary() });
    jobSpan.addEvent("probe_complete", { summary: file.summary() });
  } catch (err) {
    const msg = `ffprobe failed: ${(err as Error).message}`;
    console.error(`[chunker] Job ${job.id.slice(0, 8)} — ${msg}`);
    log.error("ffprobe failed", { job_id: job.id, message: (err as Error).message });
    jobSpan.addEvent("probe_error", { message: (err as Error).message });
    jobSpan.end();
    job.status = "error";
    job.error = msg;
    updateJobStatus(job.id, "error", { error: msg });
    notifySubscribers(job);
    return;
  }

  let command = ffmpeg(inputPath);

  if (startTime !== undefined) command = command.seekInput(startTime);
  if (endTime !== undefined) command = command.duration(endTime - (startTime ?? 0));

  // Register the inotify watch BEFORE calling .run() so the kernel queues events
  // from the very first file ffmpeg writes (init.mp4 and segment_0000.m4s).
  // Calling watchSegments after .on("start") risks missing early segment events.
  watchSegments(job, segmentDir, initPath);

  activeCommands.set(job.id, command);
  // Now tracked by activeCommands — remove from inflight so the slot is counted
  // exactly once and the concurrent-job cap isn't double-counted.
  inflightJobIds.delete(job.id);

  // Kill orphaned jobs — prefetched chunks that start encoding but whose stream
  // connection is never opened (e.g. user seeks away before the stream starts).
  // If connections is still 0 after 30 s, no client is watching: kill ffmpeg.
  const ORPHAN_TIMEOUT_MS = 30_000;
  const orphanTimer = setTimeout(() => {
    const currentJob = getJob(job.id);
    if (currentJob && currentJob.connections === 0 && currentJob.status === "running") {
      console.log(
        `[chunker] Job ${job.id.slice(0, 8)} — no connections after ${ORPHAN_TIMEOUT_MS / 1000}s, killing orphan`
      );
      killJob(job.id);
    }
  }, ORPHAN_TIMEOUT_MS);

  file
    .applyOutputOptions(command, profile, segmentPattern, segmentDir)
    .output(join(segmentDir, "playlist.m3u8"))
    .on("start", (cmd) => {
      console.log(`[chunker] Job ${job.id.slice(0, 8)} started`);
      console.log(`[chunker] cmd: ${cmd.slice(0, 120)}…`);
      log.info("Transcode started", { job_id: job.id, resolution });
      jobSpan.addEvent("transcode_started");
    })
    .on("error", (err) => {
      clearTimeout(orphanTimer);
      activeCommands.delete(job.id);
      // Clear killedJobs entry if present. A SIGTERM can cause ffmpeg to exit via
      // both .on("error") and .on("end") depending on the OS; clearing here ensures
      // the entry doesn't linger if the error path fires instead of the end path.
      killedJobs.delete(job.id);
      console.error(`[chunker] Job ${job.id.slice(0, 8)} error:`, err.message);
      log.error("Transcode error", { job_id: job.id, message: err.message });
      jobSpan.addEvent("transcode_error", { message: err.message });
      jobSpan.end();
      job.status = "error";
      job.error = err.message;
      updateJobStatus(job.id, "error", { error: err.message });
      notifySubscribers(job);
    })
    .on("end", () => {
      clearTimeout(orphanTimer);
      activeCommands.delete(job.id);

      if (killedJobs.has(job.id)) {
        // ffmpeg exited cleanly after SIGTERM — treat as error, not completion,
        // so the next startTranscodeJob call will wipe the stale segment dir and
        // re-encode rather than serving a truncated stream.
        killedJobs.delete(job.id);
        const msg = "ffmpeg process was killed";
        console.log(`[chunker] Job ${job.id.slice(0, 8)} killed (end event) — marking error`);
        log.info("Transcode killed", { job_id: job.id });
        jobSpan.addEvent("transcode_killed");
        jobSpan.end();
        job.status = "error";
        job.error = msg;
        updateJobStatus(job.id, "error", { error: msg });
        notifySubscribers(job);
        return;
      }

      const segmentCount = job.segments.filter(Boolean).length;
      console.log(`[chunker] Job ${job.id.slice(0, 8)} complete. ${segmentCount} segments`);
      log.info("Transcode complete", { job_id: job.id, segment_count: segmentCount });
      jobSpan.addEvent("transcode_complete", { segment_count: segmentCount });
      jobSpan.end();
      job.status = "complete";
      job.total_segments = segmentCount;
      updateJobStatus(job.id, "complete", {
        total_segments: job.total_segments,
        completed_segments: job.total_segments,
      });
      notifySubscribers(job);
    })
    .run();
}

function watchSegments(job: ActiveJob, segmentDir: string, initPath: string): void {
  const seenFiles = new Set<string>();

  // Use fs.watch() (EventEmitter API) — fs/promises.watch() async iterable is not
  // reliably supported in Bun and may silently produce no events.
  const watcher = watch(segmentDir, { persistent: false });

  watcher.on("change", (eventType, rawFilename) => {
    if (job.status === "error" || job.status === "complete") {
      watcher.close();
      return;
    }

    const filename = typeof rawFilename === "string" ? rawFilename : null;
    if (!filename) return;

    // HLS fMP4 mode writes init.mp4 before any media segments.
    // The inotify event fires on file creation (before ffmpeg finishes writing),
    // so we stat-poll until the file has content before marking it ready.
    if (filename === "init.mp4" && !job.initSegmentPath) {
      void (async () => {
        let initSize = 0;
        for (let i = 0; i < 40; i++) {
          try {
            const s = await stat(initPath);
            if (s.size > 0) {
              initSize = s.size;
              break;
            }
          } catch {
            // file not yet visible
          }
          await Bun.sleep(50);
        }
        if (initSize > 0) {
          job.initSegmentPath = initPath;
          console.log(
            `[chunker] Init segment ready for job ${job.id.slice(0, 8)} (${initSize} bytes)`
          );
          log.info("Init segment ready", { job_id: job.id, size_bytes: initSize });
          notifySubscribers(job);
        } else {
          console.warn(
            `[chunker] Init segment for job ${job.id.slice(0, 8)} still empty after polling — skipping`
          );
        }
      })();
      return;
    }

    // Track numbered media segment files
    if (/^segment_\d{4}\.m4s$/.test(filename) && !seenFiles.has(filename)) {
      seenFiles.add(filename);
      const fullPath = join(segmentDir, filename);

      void (async () => {
        try {
          const fileStat = await stat(fullPath);
          const index = parseInt(filename.replace("segment_", "").replace(".m4s", ""), 10);

          job.segments[index] = fullPath;
          job.completed_segments = job.segments.filter(Boolean).length;

          insertSegment({
            job_id: job.id,
            segment_index: index,
            path: fullPath,
            duration_seconds: null,
            size_bytes: fileStat.size,
          });

          updateJobStatus(job.id, job.status, { completed_segments: job.completed_segments });
          notifySubscribers(job);
        } catch {
          // File might not be fully written; stream.ts will fall back to the filesystem
        }
      })();
    }
  });

  watcher.on("error", (err) => {
    console.warn(`[chunker] Watcher error for job ${job.id.slice(0, 8)}:`, err.message);
    watcher.close();
  });
}

function notifySubscribers(job: ActiveJob): void {
  for (const controller of job.subscribers) {
    try {
      controller.enqueue(null); // signal update — stream.ts reads job state directly
    } catch {
      job.subscribers.delete(controller);
    }
  }
}
