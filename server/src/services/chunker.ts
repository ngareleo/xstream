import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createHash } from "crypto";
import ffmpeg, { type FfmpegCommand } from "fluent-ffmpeg";
import { mkdir, stat, watch } from "fs/promises";
import { join, resolve } from "path";

import { config, RESOLUTION_PROFILES } from "../config.js";
import { getJobById, insertJob, updateJobStatus } from "../db/queries/jobs.js";
import { getSegmentsByJob, insertSegment } from "../db/queries/segments.js";
import { getVideoById } from "../db/queries/videos.js";
import type { ActiveJob, Resolution } from "../types.js";
import { FFmpegFile } from "./ffmpegFile.js";
import { getJob, setJob } from "./jobStore.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Tracks all ffmpeg processes currently encoding so they can be killed on shutdown.
const activeCommands = new Map<string, FfmpegCommand>();

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
      try {
        command.kill("SIGTERM");
      } catch {
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

  // Restore a completed job from a previous server session without re-encoding
  const dbJob = getJobById(id);
  if (dbJob && dbJob.status === "complete") {
    const dbSegments = getSegmentsByJob(id);
    if (dbSegments.length > 0) {
      const segments: string[] = [];
      for (const seg of dbSegments) {
        segments[seg.segment_index] = seg.path;
      }
      const restored: ActiveJob = {
        ...dbJob,
        segments,
        initSegmentPath: join(dbJob.segment_dir, "init.mp4"),
        subscribers: new Set(),
      };
      setJob(restored);
      console.log(
        `[chunker] Restored completed job ${id.slice(0, 8)} from DB (${dbSegments.length} segments)`
      );
      return restored;
    }
  }

  const segmentDir = resolve(config.segmentDir, id);
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
  };

  insertJob(job);
  setJob(job);

  // Probe the file then start transcoding asynchronously (fire-and-forget)
  void runFfmpeg(job, video.path, resolution, segmentDir, startTimeSeconds, endTimeSeconds);

  return job;
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

  const profile = RESOLUTION_PROFILES[resolution];
  const initPath = join(segmentDir, "init.mp4");
  const segmentPattern = join(segmentDir, "segment_%04d.m4s");

  // Probe the file to derive correct transcode parameters
  const file = new FFmpegFile(inputPath);
  try {
    await file.probe();
    console.log(`[chunker] Job ${job.id.slice(0, 8)} — source: ${file.summary()}`);
  } catch (err) {
    const msg = `ffprobe failed: ${(err as Error).message}`;
    console.error(`[chunker] Job ${job.id.slice(0, 8)} — ${msg}`);
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
  void watchSegments(job, segmentDir, initPath);

  activeCommands.set(job.id, command);

  file
    .applyOutputOptions(command, profile, segmentPattern, segmentDir)
    .output(join(segmentDir, "playlist.m3u8"))
    .on("start", (cmd) => {
      console.log(`[chunker] Job ${job.id.slice(0, 8)} started`);
      console.log(`[chunker] cmd: ${cmd.slice(0, 120)}…`);
    })
    .on("error", (err) => {
      activeCommands.delete(job.id);
      console.error(`[chunker] Job ${job.id.slice(0, 8)} error:`, err.message);
      job.status = "error";
      job.error = err.message;
      updateJobStatus(job.id, "error", { error: err.message });
      notifySubscribers(job);
    })
    .on("end", () => {
      activeCommands.delete(job.id);
      console.log(
        `[chunker] Job ${job.id.slice(0, 8)} complete. ${job.segments.filter(Boolean).length} segments`
      );
      job.status = "complete";
      job.total_segments = job.segments.filter(Boolean).length;
      updateJobStatus(job.id, "complete", {
        total_segments: job.total_segments,
        completed_segments: job.total_segments,
      });
      notifySubscribers(job);
    })
    .run();
}

async function watchSegments(job: ActiveJob, segmentDir: string, initPath: string): Promise<void> {
  const seenFiles = new Set<string>();

  try {
    // Registering the watcher first ensures the kernel queues all file events
    // from this point on — even if they arrive before for-await starts iterating.
    const watcher = watch(segmentDir);

    for await (const event of watcher) {
      if (job.status === "error") break;

      const filename = event.filename;
      if (!filename) continue;

      // HLS fMP4 mode writes init.mp4 before any media segments.
      // The inotify event fires on file creation (before ffmpeg finishes writing),
      // so we stat-poll until the file has content before marking it ready.
      if (filename === "init.mp4" && !job.initSegmentPath) {
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
          notifySubscribers(job);
        } else {
          console.warn(
            `[chunker] Init segment for job ${job.id.slice(0, 8)} still empty after polling — skipping`
          );
        }
        continue;
      }

      // Track numbered media segment files
      if (/^segment_\d{4}\.m4s$/.test(filename) && !seenFiles.has(filename)) {
        seenFiles.add(filename);
        const fullPath = join(segmentDir, filename);

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
      }

      if (job.status === "complete") break;
    }
  } catch (err) {
    console.warn(`[chunker] Watcher ended for job ${job.id.slice(0, 8)}:`, (err as Error).message);
  }
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
