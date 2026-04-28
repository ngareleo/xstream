import { type Context as OtelContext, context, SpanStatusCode, trace } from "@opentelemetry/api";
import { createHash } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { watch } from "fs";
import { access, mkdir, rm, stat } from "fs/promises";
import { join, resolve } from "path";

import { config, RESOLUTION_PROFILES } from "../config.js";
import { getJobById, insertJob, updateJobStatus } from "../db/queries/jobs.js";
import { getSegmentsByJob, insertSegment } from "../db/queries/segments.js";
import { getVideoById } from "../db/queries/videos.js";
import { getOtelLogger, getTracer } from "../telemetry/index.js";
import type { ActiveJob, PlaybackErrorCode, Resolution } from "../types.js";
import { FFmpegFile } from "./ffmpegFile.js";
import {
  hasInflightOrLive,
  killJob,
  type Reservation,
  snapshotCap,
  spawnProcess,
  tryReserveSlot,
} from "./ffmpegPool.js";
import { getHwAccelConfig, type HwAccelConfig } from "./hwAccel.js";
import { getJob, setJob } from "./jobStore.js";

// fluent-ffmpeg's binary paths are wired once at startup by the resolver call
// in `index.ts` (see server/src/services/ffmpegPath.ts::resolveFfmpegPaths).
// Do NOT call setFfmpegPath/setFfprobePath here — fluent-ffmpeg's cache is
// module-global, so a stale per-module write would clobber the startup setting.

const log = getOtelLogger("chunker");
const chunkerTracer = getTracer("chunker");

// Per-source VAAPI capability state, learned from prior failures.
// - "needs_sw_pad" — pure VAAPI failed (typically pad_vaapi rejecting the
//   surface format on HDR/DV sources); subsequent chunks start at the
//   sw-pad VAAPI chain (hwdownload + CPU pad + hwupload around the encode).
// - "hw_unsafe"   — sw-pad VAAPI also failed; subsequent chunks skip VAAPI
//   entirely and go straight to software libx264.
// In-memory only: a server restart wipes the map so a driver/ffmpeg upgrade
// gets re-evaluated.
type VaapiVideoState = "needs_sw_pad" | "hw_unsafe";
const vaapiVideoState = new Map<string, VaapiVideoState>();

/**
 * Discriminated result for `startTranscodeJob`. The mutation resolver maps
 * `kind: "ok"` to a `TranscodeJob` GraphQL type and `kind: "error"` to a
 * `PlaybackError` — both members of the `StartTranscodeResult` union. Replaces
 * the previous "throw on known failure" pattern, which Relay rendered as a
 * generic protocol violation (no data on a non-null mutation field) instead
 * of a typed, retryable signal.
 */
export type StartJobResult =
  | { kind: "ok"; job: ActiveJob }
  | {
      kind: "error";
      code: PlaybackErrorCode;
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
    };

/**
 * Inflight dedup polling: when a concurrent call finds the same job already
 * in-flight, it sleeps INFLIGHT_DEDUP_POLL_MS and re-checks jobStore until the
 * job appears or the total wait exceeds config.transcode.inflightDedupTimeoutMs.
 * The poll interval is an internal step; the timeout is the policy knob and
 * lives in config.
 */
const INFLIGHT_DEDUP_POLL_MS = 100;

// `v3` invalidates v2-era chunks that were encoded without
// `-bsf:v dump_extra=keyframe`. Without that BSF, libx264 fmp4 segments
// only carry SPS/PPS in init.mp4's avcC box; Chromium's chunk demuxer
// can fail sample-prepare ~5 s into a fresh seek and silently call
// `endOfStream(decode_error)` (trace 38e711a9…). New encodes inject
// SPS/PPS in-band on every keyframe so the demuxer can prepare cleanly
// across fragment seams. Old segment dirs become unreachable; safe to
// `rm -rf tmp/segments/*` to reclaim. Bump again if the segment-on-disk
// format changes in a way that breaks playback against an in-memory job.
function jobId(contentKey: string, resolution: Resolution, start?: number, end?: number): string {
  return createHash("sha1")
    .update(`v3|${contentKey}|${resolution}|${start ?? ""}|${end ?? ""}`)
    .digest("hex");
}

export async function startTranscodeJob(
  videoId: string,
  resolution: Resolution,
  startTimeSeconds?: number,
  endTimeSeconds?: number,
  parentOtelCtx?: OtelContext
): Promise<StartJobResult> {
  const video = getVideoById(videoId);
  if (!video) {
    return {
      kind: "error",
      code: "VIDEO_NOT_FOUND",
      message: `Video not found: ${videoId}`,
      retryable: false,
    };
  }

  const id = jobId(video.content_fingerprint, resolution, startTimeSeconds, endTimeSeconds);

  const resolveSpan = chunkerTracer.startSpan(
    "job.resolve",
    {
      attributes: {
        "job.id": id,
        "job.video_id": videoId,
        "job.resolution": resolution,
        "job.chunk_start_s": startTimeSeconds ?? 0,
      },
    },
    parentOtelCtx
  );

  const endResolveSpan = (event: string, attrs?: Record<string, string | number>): void => {
    resolveSpan.addEvent(event, attrs);
    resolveSpan.end();
  };

  // Return existing in-memory job if already running or complete
  const existing = getJob(id);
  if (existing && existing.status !== "error") {
    endResolveSpan("job_cache_hit", { job_status: existing.status });
    return { kind: "ok", job: existing };
  }

  // If a concurrent call is already initializing this exact job (between this
  // function's entry and the setJob() call below), wait for it to register rather
  // than spawning a second ffmpeg process.
  if (hasInflightOrLive(id)) {
    const maxRetries = Math.ceil(config.transcode.inflightDedupTimeoutMs / INFLIGHT_DEDUP_POLL_MS);
    for (let i = 0; i < maxRetries; i++) {
      await Bun.sleep(INFLIGHT_DEDUP_POLL_MS);
      const pending = getJob(id);
      if (pending) {
        endResolveSpan("job_inflight_resolved");
        return { kind: "ok", job: pending };
      }
    }
    // If still not registered within inflightDedupTimeoutMs, fall through.
    log.warn("Inflight dedup timeout — proceeding", { job_id: id });
  }

  // Reserve a pool slot synchronously before the first await so any concurrent
  // call with the same parameters sees this job as in-flight and waits rather
  // than racing for the same cap slot. Reservation lifetime: held across probe
  // + restore decision + setJob, then either consumed by spawnProcess (ffmpeg
  // launches) or released (restore-from-DB / probe failure / catch).
  const reservation = tryReserveSlot(id);
  if (!reservation) {
    const snap = snapshotCap();
    const liveJobsDetail = snap.liveJobIds.map((jid) => {
      const j = getJob(jid);
      return {
        id: jid,
        video_id: j?.video_id ?? null,
        chunk_start_s: j?.start_time_seconds ?? null,
        status: j?.status ?? "missing-from-store",
        connections: j?.connections ?? -1,
      };
    });
    resolveSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: `Too many concurrent streams (limit: ${snap.limit})`,
    });
    resolveSpan.addEvent("concurrency_cap_reached", {
      "cap.limit": snap.limit,
      "cap.active_count": snap.liveCount,
      "cap.inflight_count": snap.inflightCount,
      "cap.dying_count": snap.dyingCount,
      "cap.active_jobs_json": JSON.stringify(liveJobsDetail),
      "cap.inflight_ids_json": JSON.stringify(snap.inflightJobIds),
      "cap.dying_ids_json": JSON.stringify(snap.dyingJobIds),
      "cap.requested_video_id": videoId,
      "cap.requested_chunk_start_s": startTimeSeconds ?? 0,
      "cap.requested_resolution": resolution,
    });
    resolveSpan.end();
    return {
      kind: "error",
      code: "CAPACITY_EXHAUSTED",
      message: `Too many concurrent streams (limit: ${snap.limit}). Close another player tab and try again.`,
      retryable: true,
      retryAfterMs: config.transcode.capacityRetryHintMs,
    };
  }

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
            errorCode: null,
          };
          setJob(restored);
          log.info("Restored completed job from DB", {
            job_id: id,
            segment_count: dbSegments.length,
          });
          // Restore is a non-runFfmpeg exit path: spawnProcess never consumes
          // the reservation for restored jobs, so this path must release the
          // slot itself or the cap leaks one slot per restore.
          reservation.release();
          endResolveSpan("job_restored_from_db", { segment_count: dbSegments.length });
          return { kind: "ok", job: restored };
        }
      } else {
        // Segment dir was wiped or truncated — force re-encode and wipe any
        // partial files so the stream handler doesn't serve stale data.
        log.warn("Completed job missing init.mp4 on disk — treating as error", { job_id: id });
        updateJobStatus(id, "error", { error: "Segment dir missing — will re-encode" });
        shouldWipeDir = true;
      }
    }

    const segmentDir = resolve(config.segmentDir, id);

    // Wipe stale segment directories from prior errored (or missing-init) encodes
    // so the stream handler never serves truncated or partial content.
    if ((dbJob && dbJob.status === "error") || shouldWipeDir) {
      await rm(segmentDir, { recursive: true, force: true });
      log.info("Cleared stale segment dir", { job_id: id });
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
      errorCode: null,
    };

    insertJob(job);
    setJob(job);
    // Derive the ffmpeg span's parent context from resolveSpan BEFORE ending it so
    // transcode.job nests under job.resolve in the trace tree instead of the raw
    // HTTP POST mutation span (which is ~34 ms while ffmpeg runs for minutes).
    const jobCtx = trace.setSpan(parentOtelCtx ?? context.active(), resolveSpan);
    endResolveSpan("job_started");
    // Job is now in jobStore — any concurrent duplicate can find it via getJob().
    // Reservation stays held until spawnProcess inside runFfmpeg consumes it
    // (after ffprobe). The pool's reservations Set keeps the cap honest during
    // the ffprobe window so a concurrent call cannot bypass it.
    void runFfmpeg(
      reservation,
      job,
      video.path,
      resolution,
      segmentDir,
      startTimeSeconds,
      endTimeSeconds,
      jobCtx
    );

    return { kind: "ok", job };
  } catch (err) {
    resolveSpan.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    resolveSpan.end();
    reservation.release();
    // Genuinely unexpected — DB write failure, mkdir ENOSPC, etc. Map to the
    // INTERNAL bucket so the resolver can surface a typed error to the
    // client; no stack trace makes it to the wire.
    return {
      kind: "error",
      code: "INTERNAL",
      message: (err as Error).message,
      retryable: false,
    };
  }
}

async function runFfmpeg(
  reservation: Reservation,
  job: ActiveJob,
  inputPath: string,
  resolution: Resolution,
  segmentDir: string,
  startTime?: number,
  endTime?: number,
  parentOtelCtx?: OtelContext,
  // Tier-2 retry: forces software libx264 even when HW is otherwise configured.
  // Set by the sw-pad VAAPI error handler (third tier) and by `hw_unsafe` cache hits.
  forceSoftware = false,
  // Tier-1 retry: forces the sw-pad VAAPI chain (CPU round-trip for the pad
  // operation, encode still on GPU). Set by the fast-VAAPI error handler and
  // by `needs_sw_pad` cache hits. Ignored when forceSoftware is true.
  useSwVaapiPad = false
): Promise<void> {
  job.status = "running";
  updateJobStatus(job.id, "running");

  // Promote per-source cache state into the run's tier flags. A `hw_unsafe`
  // video skips both VAAPI tiers; a `needs_sw_pad` video starts at the sw-pad
  // tier. Explicit caller flags (forceSoftware / useSwVaapiPad from a retry)
  // also win — they're already set to the correct tier.
  const cachedState = vaapiVideoState.get(job.video_id);
  const effForceSoftware = forceSoftware || cachedState === "hw_unsafe";
  const effUseSwVaapiPad = !effForceSoftware && (useSwVaapiPad || cachedState === "needs_sw_pad");
  const jobHwAccel: HwAccelConfig = effForceSoftware ? { kind: "software" } : getHwAccelConfig();

  const jobSpan = chunkerTracer.startSpan(
    "transcode.job",
    {
      attributes: {
        "job.id": job.id,
        "job.video_id": job.video_id,
        "job.resolution": resolution,
        "job.chunk_start_s": startTime ?? 0,
        "job.chunk_duration_s": endTime !== undefined ? endTime - (startTime ?? 0) : -1,
        hwaccel: jobHwAccel.kind,
        "hwaccel.forced_software": effForceSoftware,
        "hwaccel.vaapi_sw_pad": effUseSwVaapiPad,
      },
    },
    parentOtelCtx
  );

  const profile = RESOLUTION_PROFILES[resolution];
  const initPath = join(segmentDir, "init.mp4");
  const segmentPattern = join(segmentDir, "segment_%04d.m4s");

  // Probe the file to derive correct transcode parameters
  const file = new FFmpegFile(inputPath);
  const probeStart = Date.now();
  try {
    await file.probe();
    const probeDurationMs = Date.now() - probeStart;
    log.info("ffprobe complete", {
      job_id: job.id,
      video_id: job.video_id,
      resolution,
      probe_duration_ms: probeDurationMs,
    });
    jobSpan.addEvent("probe_complete", {
      probe_duration_ms: probeDurationMs,
      summary: file.summary(),
    });
    // Surface whether tonemap_vaapi will run for this job. Set once we know
    // the source's HDR status from probe — after the jobSpan was already
    // opened (its attributes surface fields known up-front; per-source
    // properties land here).
    jobSpan.setAttribute("hwaccel.hdr_tonemap", jobHwAccel.kind === "vaapi" && file.metadata.isHdr);
  } catch (err) {
    const probeDurationMs = Date.now() - probeStart;
    const msg = `ffprobe failed: ${(err as Error).message}`;
    log.error("ffprobe failed", {
      job_id: job.id,
      video_id: job.video_id,
      resolution,
      probe_duration_ms: probeDurationMs,
      message: (err as Error).message,
    });
    jobSpan.addEvent("probe_error", {
      probe_duration_ms: probeDurationMs,
      message: (err as Error).message,
    });
    jobSpan.end();
    // Probe failed before spawnProcess could take ownership — release the
    // reservation here so the cap doesn't leak when ffprobe rejects the file.
    reservation.release();
    job.status = "error";
    job.error = msg;
    job.errorCode = "PROBE_FAILED";
    updateJobStatus(job.id, "error", { error: msg });
    notifySubscribers(job);
    return;
  }

  let command = ffmpeg(inputPath);

  // -loglevel error keeps real errors but suppresses frame/info chatter, so
  // the stderr buffer below stays focused on what we actually care about
  // when a HW encode fails (e.g. the "Conversion failed!" code-218 path).
  command = command.inputOptions(["-loglevel", "error"]);

  if (startTime !== undefined) command = command.seekInput(startTime);
  if (endTime !== undefined) command = command.duration(endTime - (startTime ?? 0));

  // fluent-ffmpeg discards ffmpeg's stderr by default — only `err.message`
  // (e.g. "ffmpeg exited with code 218: Conversion failed!") makes it into
  // the onError hook. Capture the most recent stderr lines so the failure
  // events we emit to Seq carry the actual ffmpeg complaint.
  const STDERR_RING_LINES = 200;
  const STDERR_ATTR_MAX_BYTES = 4_096;
  const stderrRing: string[] = [];
  const captureStderr = (line: string): void => {
    stderrRing.push(line);
    if (stderrRing.length > STDERR_RING_LINES) stderrRing.shift();
  };
  const stderrTail = (): string => {
    const joined = stderrRing.join("\n");
    return joined.length > STDERR_ATTR_MAX_BYTES
      ? joined.slice(joined.length - STDERR_ATTR_MAX_BYTES)
      : joined;
  };
  const exitCodeOf = (msg: string): number => {
    const match = /exited with code (\d+)/.exec(msg);
    return match ? parseInt(match[1], 10) : -1;
  };

  // Register the inotify watch BEFORE spawnProcess calls .run() so the kernel
  // queues events from the very first file ffmpeg writes (init.mp4 and
  // segment_0000.m4s). Wiring the watcher after the spawn risks missing early
  // segment events.
  watchSegments(job, segmentDir, initPath);

  // Kill orphaned jobs — prefetched chunks that start encoding but whose
  // stream connection is never opened (e.g. user seeks away before the stream
  // starts). If connections is still 0 after orphanTimeoutMs, no client is
  // watching: kill ffmpeg.
  const orphanTimer = setTimeout(() => {
    const currentJob = getJob(job.id);
    if (currentJob && currentJob.connections === 0 && currentJob.status === "running") {
      killJob(job.id, "orphan_no_connection");
    }
  }, config.transcode.orphanTimeoutMs);

  // Wall-clock upper bound on encode time. orphan_no_connection covers the
  // "client never connected" case; the stream-side idle timeout covers
  // "ffmpeg stopped producing segments". Neither catches a job that makes
  // slow but non-zero progress while a client is still subscribed — that
  // would otherwise tie up a pool slot indefinitely.
  //
  // Budget = chunk duration × maxEncodeRateMultiplier. Realistic worst case
  // on this system is SW libx264 at 1080p (~10 min for a 5-min chunk; SW 4K
  // is architecturally ruled out — VAAPI-required); the default 3× gives
  // ~5 min headroom. For ad-hoc full-video transcodes (no startTime/endTime),
  // fall back to an absolute 1-hour cap — pre-Tauri prototype path; not the
  // primary use case.
  const ABSOLUTE_FALLBACK_MS = 60 * 60 * 1000; // 1 h, only for full-video transcodes
  const chunkWindowSeconds = endTime != null && startTime != null ? endTime - startTime : null;
  const MAX_ENCODE_MS =
    chunkWindowSeconds != null
      ? Math.ceil(chunkWindowSeconds * config.transcode.maxEncodeRateMultiplier * 1000)
      : ABSOLUTE_FALLBACK_MS;
  const maxEncodeTimer = setTimeout(() => {
    const currentJob = getJob(job.id);
    if (currentJob && currentJob.status === "running") {
      log.warn(
        `Max encode time exceeded — killing ffmpeg (chunk ${chunkWindowSeconds ?? "full-video"}s, budget ${MAX_ENCODE_MS}ms)`,
        {
          job_id: job.id,
          chunk_duration_s: chunkWindowSeconds ?? -1,
          max_encode_ms: MAX_ENCODE_MS,
        }
      );
      killJob(job.id, "max_encode_timeout");
    }
  }, MAX_ENCODE_MS);

  // Throttle fluent-ffmpeg's per-second progress callback to one event every 10 s
  // so a full 300 s chunk emits ~30 transcode_progress events — enough to spot
  // encode-rate drops without dominating Seq ingest.
  const PROGRESS_INTERVAL_MS = 10_000;
  let lastProgressAt = 0;

  let encodeStart = 0;

  /** Reserve a slot for the next cascade tier and recurse. Called from onError
   * synchronously after the pool released the prior slot, so the cap is normally
   * free. The defensive guard handles the rare race where 3 other jobs filled
   * the slot in the same microtask. */
  const cascadeTo = (forceSoftware_: boolean, useSwVaapiPad_: boolean): void => {
    const next = tryReserveSlot(job.id);
    if (!next) {
      log.error("Cascade aborted — concurrency cap reached during retry", {
        job_id: job.id,
        video_id: job.video_id,
        resolution,
      });
      jobSpan.addEvent("cascade_aborted_cap_full");
      jobSpan.end();
      job.status = "error";
      job.error = "Cascade retry blocked by concurrency cap";
      job.errorCode = "ENCODE_FAILED";
      updateJobStatus(job.id, "error", { error: job.error });
      notifySubscribers(job);
      return;
    }
    void runFfmpeg(
      next,
      job,
      inputPath,
      resolution,
      segmentDir,
      startTime,
      endTime,
      parentOtelCtx,
      forceSoftware_,
      useSwVaapiPad_
    );
  };

  const fullCommand = file
    .applyOutputOptions(command, jobHwAccel, profile, segmentPattern, segmentDir, {
      vaapiSwPad: effUseSwVaapiPad,
      chunkStartSeconds: startTime ?? 0,
    })
    .output(join(segmentDir, "playlist.m3u8"));

  spawnProcess(reservation, fullCommand, {
    onStart: (cmd) => {
      encodeStart = Date.now();
      jobSpan.addEvent("transcode_started", { resolution, cmd: cmd.slice(0, 120) });
    },
    onStderr: captureStderr,
    onProgress: (p) => {
      const now = Date.now();
      if (now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
      lastProgressAt = now;
      jobSpan.addEvent("transcode_progress", {
        frames: p.frames ?? 0,
        fps: p.currentFps ?? 0,
        kbps: p.currentKbps ?? 0,
        timemark: p.timemark ?? "",
        percent: p.percent ?? 0,
      });
    },
    onComplete: () => {
      clearTimeout(orphanTimer);
      clearTimeout(maxEncodeTimer);
      const segmentCount = job.segments.filter(Boolean).length;
      const encodeDurationMs = encodeStart > 0 ? Date.now() - encodeStart : 0;
      // Silent-failure diagnostic: ffmpeg exited cleanly but produced zero
      // segments (e.g. -ss 0 -t SHORT on VAAPI HDR 4K — the existing
      // 3-tier cascade only fires on non-zero exit, so this case slips
      // through without any error signal). Emit the captured stderr tail
      // so the failure mode is debuggable in Seq. Tracked as
      // OBS-STDERR-001 in docs/todo.md; root cause investigation pending
      // — see docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md.
      if (segmentCount === 0) {
        const ffmpegStderr = stderrTail();
        log.warn("Transcode produced zero segments despite clean exit", {
          job_id: job.id,
          video_id: job.video_id,
          resolution,
          chunk_start_s: startTime ?? 0,
          chunk_duration_s: endTime !== undefined ? endTime - (startTime ?? 0) : -1,
          encode_duration_ms: encodeDurationMs,
          ffmpeg_stderr: ffmpegStderr,
        });
        jobSpan.addEvent("transcode_silent_failure", {
          chunk_start_s: startTime ?? 0,
          chunk_duration_s: endTime !== undefined ? endTime - (startTime ?? 0) : -1,
          encode_duration_ms: encodeDurationMs,
          ffmpeg_stderr: ffmpegStderr,
        });
        jobSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: "Clean exit but zero segments written",
        });
      }
      log.info("Transcode complete", {
        job_id: job.id,
        video_id: job.video_id,
        resolution,
        segment_count: segmentCount,
        encode_duration_ms: encodeDurationMs,
      });
      jobSpan.addEvent("transcode_complete", {
        segment_count: segmentCount,
        encode_duration_ms: encodeDurationMs,
      });
      jobSpan.end();
      job.status = "complete";
      job.total_segments = segmentCount;
      updateJobStatus(job.id, "complete", {
        total_segments: job.total_segments,
        completed_segments: job.total_segments,
      });
      notifySubscribers(job);
    },
    onKilled: (reason) => {
      clearTimeout(orphanTimer);
      clearTimeout(maxEncodeTimer);
      // Treat a killed job as an error so the next startTranscodeJob call
      // wipes the stale segment dir and re-encodes rather than serving a
      // truncated stream from a partial fragment set.
      const msg = `ffmpeg killed — ${reason}`;
      log.info(`Transcode killed: ${reason}`, {
        job_id: job.id,
        video_id: job.video_id,
        resolution,
        kill_reason: reason,
      });
      jobSpan.addEvent("transcode_killed", { kill_reason: reason });
      jobSpan.end();
      job.status = "error";
      job.error = msg;
      updateJobStatus(job.id, "error", { error: msg });
      notifySubscribers(job);
    },
    onError: (err) => {
      clearTimeout(orphanTimer);
      clearTimeout(maxEncodeTimer);
      const encodeDurationMs = encodeStart > 0 ? Date.now() - encodeStart : 0;
      const ffmpegStderr = stderrTail();
      const ffmpegExitCode = exitCodeOf(err.message);

      // Three-tier failure cascade for VAAPI:
      //   tier 1 (fast)  → tier 2 (sw-pad VAAPI) → tier 3 (software libx264)
      // Other HW backends fall straight to software (no sw-pad equivalent).
      // Each tier is a single retry; if every tier fails, mark the job errored.

      // Tier 2 → 3: sw-pad VAAPI failed; mark the source hw_unsafe and fall
      // through to software libx264. After this, every future chunk of the
      // same video skips both VAAPI tiers via the cache.
      if (jobHwAccel.kind === "vaapi" && effUseSwVaapiPad && !effForceSoftware) {
        vaapiVideoState.set(job.video_id, "hw_unsafe");
        log.info("Marking video hw_unsafe — sw-pad VAAPI also failed; future chunks use software", {
          video_id: job.video_id,
          ffmpeg_exit_code: ffmpegExitCode,
        });
        jobSpan.addEvent("vaapi_marked_hw_unsafe", {
          video_id: job.video_id,
          ffmpeg_exit_code: ffmpegExitCode,
        });
        log.warn("Sw-pad VAAPI failed — falling back to software", {
          job_id: job.id,
          video_id: job.video_id,
          resolution,
          encode_duration_ms: encodeDurationMs,
          ffmpeg_exit_code: ffmpegExitCode,
          ffmpeg_stderr: ffmpegStderr,
          message: err.message,
        });
        jobSpan.addEvent("transcode_fallback_to_software", {
          hwaccel: "vaapi_sw_pad",
          encode_duration_ms: encodeDurationMs,
          ffmpeg_exit_code: ffmpegExitCode,
          ffmpeg_stderr: ffmpegStderr,
          message: err.message,
        });
        jobSpan.end();
        cascadeTo(/* forceSoftware */ true, /* useSwVaapiPad */ false);
        return;
      }

      // Tier 1 → 2: fast VAAPI failed; mark the source needs_sw_pad and retry
      // with the CPU-pad chain. After this, future chunks of the same video
      // skip the fast tier and start at sw-pad.
      // Exception: HDR sources produce the SAME filter chain at both tiers
      // (`tonemap_vaapi → scale_vaapi`, no pad in either) — retrying tier 2
      // would just fail identically and burn another ~600 ms. Skip straight
      // to software for HDR cascade-on-failure.
      if (
        jobHwAccel.kind === "vaapi" &&
        !effUseSwVaapiPad &&
        !effForceSoftware &&
        !file.metadata.isHdr
      ) {
        vaapiVideoState.set(job.video_id, "needs_sw_pad");
        log.info("Marking video needs_sw_pad — fast VAAPI failed; future chunks use sw-pad", {
          video_id: job.video_id,
          ffmpeg_exit_code: ffmpegExitCode,
        });
        jobSpan.addEvent("vaapi_marked_needs_sw_pad", {
          video_id: job.video_id,
          ffmpeg_exit_code: ffmpegExitCode,
        });
        log.warn("Fast VAAPI failed — retrying with sw-pad (CPU round-trip for the pad step)", {
          job_id: job.id,
          video_id: job.video_id,
          resolution,
          encode_duration_ms: encodeDurationMs,
          ffmpeg_exit_code: ffmpegExitCode,
          ffmpeg_stderr: ffmpegStderr,
          message: err.message,
        });
        jobSpan.addEvent("transcode_fallback_to_vaapi_sw_pad", {
          encode_duration_ms: encodeDurationMs,
          ffmpeg_exit_code: ffmpegExitCode,
          ffmpeg_stderr: ffmpegStderr,
          message: err.message,
        });
        jobSpan.end();
        cascadeTo(/* forceSoftware */ false, /* useSwVaapiPad */ true);
        return;
      }

      // Other HW backends (videotoolbox, qsv, …): no sw-pad tier exists, so
      // a single failure goes straight to software libx264.
      if (jobHwAccel.kind !== "software" && !effForceSoftware) {
        log.warn(`HW encode failed — retrying chunk with software (hwaccel: ${jobHwAccel.kind})`, {
          job_id: job.id,
          video_id: job.video_id,
          resolution,
          hwaccel: jobHwAccel.kind,
          encode_duration_ms: encodeDurationMs,
          ffmpeg_exit_code: ffmpegExitCode,
          ffmpeg_stderr: ffmpegStderr,
          message: err.message,
        });
        jobSpan.addEvent("transcode_fallback_to_software", {
          hwaccel: jobHwAccel.kind,
          encode_duration_ms: encodeDurationMs,
          ffmpeg_exit_code: ffmpegExitCode,
          ffmpeg_stderr: ffmpegStderr,
          message: err.message,
        });
        jobSpan.end();
        cascadeTo(/* forceSoftware */ true, /* useSwVaapiPad */ false);
        return;
      }

      // Final tier — software libx264 also failed (or this was always a software
      // run via env-disabled HW). Mark the job errored.
      log.error("Transcode error", {
        job_id: job.id,
        video_id: job.video_id,
        resolution,
        encode_duration_ms: encodeDurationMs,
        ffmpeg_exit_code: ffmpegExitCode,
        ffmpeg_stderr: ffmpegStderr,
        message: err.message,
      });
      jobSpan.addEvent("transcode_error", {
        encode_duration_ms: encodeDurationMs,
        ffmpeg_exit_code: ffmpegExitCode,
        ffmpeg_stderr: ffmpegStderr,
        message: err.message,
      });
      jobSpan.end();
      job.status = "error";
      job.error = err.message;
      job.errorCode = "ENCODE_FAILED";
      updateJobStatus(job.id, "error", { error: err.message });
      notifySubscribers(job);
    },
  });
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
          log.info("Init segment ready", { job_id: job.id, size_bytes: initSize });
          notifySubscribers(job);
        } else {
          log.warn("Init segment still empty after polling — skipping", { job_id: job.id });
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
    log.warn("Watcher error", { job_id: job.id, message: err.message });
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
