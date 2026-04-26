import { context, propagation } from "@opentelemetry/api";
import { access, readFile } from "fs/promises";
import { join } from "path";

import { getJobById } from "../db/queries/jobs.js";
import { getSegmentsByJob } from "../db/queries/segments.js";
import { killJob } from "../services/chunker.js";
import { addConnection, getJob, removeConnection } from "../services/jobStore.js";
import { getOtelLogger, getTracer } from "../telemetry/index.js";

const log = getOtelLogger("stream");
const streamTracer = getTracer("stream");

/**
 * Maximum idle time before the stream assumes the connection is dead and kills
 * the job. Must be larger than the widest back-pressure halt the client can
 * induce. With forwardTargetS=60 and forwardResumeS=0 (the flag's min), halts
 * can reach ~60s; 180s leaves ~120s of defensive margin for real network blips.
 */
const CONNECTION_TIMEOUT_MS = 180_000;

/** How long (ms) between polls when waiting for the encoder to produce a segment. */
const ENCODER_POLL_MS = 100;

/** Max attempts (polled every ENCODER_POLL_MS) to wait for init.mp4. 600 × 100ms = 60s. */
const INIT_WAIT_ATTEMPTS = 600;

function writeLengthPrefixed(controller: ReadableStreamDefaultController, data: Uint8Array): void {
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint32(0, data.byteLength, false); // big-endian
  controller.enqueue(header);
  controller.enqueue(data);
}

/** Derive the expected on-disk path for a segment by index. */
function segmentPath(segmentDir: string, index: number): string {
  return join(segmentDir, `segment_${String(index).padStart(4, "0")}.m4s`);
}

/**
 * Length-prefixed binary streaming endpoint. Pull-based: every byte sent
 * corresponds to a `reader.read()` call on the client, so MSE backpressure
 * propagates all the way through the TCP socket into the server's `pull`
 * being called or not. No internal queues between disk read and consumer —
 * this is the invariant documented in docs/code-style/Invariants.
 *
 * The same `pull` body serves live-encoded and restored jobs uniformly. For
 * live jobs, the "segment not yet produced" branch sleeps and retries within
 * the same pull; the consumer awaits naturally. For restored jobs, segments
 * are on disk from the start, so each pull produces one segment without
 * sleeping. The encoder vs. disk distinction is invisible at the stream layer.
 */
export function handleStream(req: Request): Response {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const jobId = parts[2];
  const fromParam = parseInt(url.searchParams.get("from") ?? "0", 10);
  const fromIndex = Number.isFinite(fromParam) && fromParam >= 0 ? fromParam : 0;

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  // Extract W3C traceparent so the server span nests under the client's
  // chunk.stream span (same traceId).
  const carrier: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    carrier[key] = value;
  });
  const incomingCtx = propagation.extract(context.active(), carrier);
  const span = streamTracer.startSpan(
    "stream.request",
    { attributes: { "job.id": jobId, "stream.from_index": fromIndex } },
    incomingCtx
  );

  // Validate job exists before committing to the stream. A 404/500 here
  // means the client never sees a ReadableStream — saves the pull machinery.
  const memJob = getJob(jobId);
  if (!memJob) {
    const dbJob = getJobById(jobId);
    if (!dbJob) {
      span.addEvent("job_not_found");
      span.end();
      return new Response("Job not found", { status: 404 });
    }
    if (dbJob.status === "error") {
      span.addEvent("job_errored");
      span.end();
      return new Response(`Job failed: ${dbJob.error}`, { status: 500 });
    }
  }

  // Per-stream mutable state. Lives in this closure; each pull mutates it.
  const streamStartAt = Date.now();
  let totalBytesSent = 0;
  let sentCount = 0;
  let index = fromIndex;
  let initSent = false;
  let lastSentAt = Date.now();
  let closed = false;

  /** Snapshot for logging on natural close; set once inside cancel/close paths. */
  const finalise = (reason: "complete" | "client_disconnected" | "idle_timeout"): void => {
    if (closed) return;
    closed = true;
    removeConnection(jobId);
    const durationMs = Date.now() - streamStartAt;
    const transferRateKbps = durationMs > 0 ? Math.round((totalBytesSent * 8) / durationMs) : 0;
    if (reason === "complete") {
      log.info("Stream complete", {
        job_id: jobId,
        segments_sent: sentCount,
        total_bytes_sent: totalBytesSent,
        duration_ms: durationMs,
        transfer_rate_kbps: transferRateKbps,
      });
      span.addEvent("stream_complete", {
        segments_sent: sentCount,
        total_bytes_sent: totalBytesSent,
        duration_ms: durationMs,
        transfer_rate_kbps: transferRateKbps,
      });
    } else if (reason === "client_disconnected") {
      log.info(`Client disconnected after ${sentCount} segments — cleaning up`, {
        job_id: jobId,
        segments_sent: sentCount,
      });
      span.addEvent("client_disconnected", { segments_sent: sentCount });
      const disconnectedJob = getJob(jobId);
      if (
        disconnectedJob &&
        disconnectedJob.connections === 0 &&
        disconnectedJob.status === "running"
      ) {
        killJob(jobId, "client_disconnected");
      }
    } else {
      log.warn(`Stream idle timeout after ${sentCount} segments — killing ffmpeg`, {
        job_id: jobId,
        segments_sent: sentCount,
        idle_ms: CONNECTION_TIMEOUT_MS,
      });
      span.addEvent("idle_timeout", { segments_sent: sentCount });
      const idleJob = getJob(jobId);
      if (idleJob && idleJob.connections === 0 && idleJob.status === "running") {
        killJob(jobId, "stream_idle_timeout");
      }
    }
    span.end();
  };

  /** Resolve the path for the next segment; null if not yet available. */
  const resolveNextSegmentPath = async (): Promise<string | null> => {
    const currentJob = getJob(jobId);
    if (currentJob) {
      const inMem = currentJob.segments[index];
      if (inMem) return inMem;
      // Watcher may have missed this segment — check disk.
      const expected = segmentPath(currentJob.segment_dir, index);
      if (
        await access(expected)
          .then(() => true)
          .catch(() => false)
      ) {
        currentJob.segments[index] = expected;
        return expected;
      }
      return null;
    }
    // Job evicted from memory — serve from DB segment rows, falling back to
    // filesystem scan. This only triggers on rare paths (server restart mid-stream,
    // watcher gap after restart); normal streams never hit it.
    const dbSegments = getSegmentsByJob(jobId);
    const match = dbSegments.find((s) => s.segment_index === index);
    if (match) return match.path;
    const dbJobForFs = getJobById(jobId);
    if (dbJobForFs?.segment_dir) {
      const expected = segmentPath(dbJobForFs.segment_dir, index);
      if (
        await access(expected)
          .then(() => true)
          .catch(() => false)
      ) {
        return expected;
      }
    }
    return null;
  };

  const stream = new ReadableStream({
    start(): void {
      span.addEvent("stream_started", { from_index: fromIndex });
      addConnection(jobId);
    },

    async pull(controller): Promise<void> {
      if (closed) return;

      if (req.signal?.aborted) {
        finalise("client_disconnected");
        controller.close();
        return;
      }

      // First pull sends the init segment once it's ready. The wait is bounded
      // by INIT_WAIT_ATTEMPTS × ENCODER_POLL_MS = 60s (handles slow ffprobe on
      // large HEVC sources). Aborted checks on every poll so client disconnects
      // are seen promptly.
      if (!initSent) {
        let attempts = 0;
        while (!getJob(jobId)?.initSegmentPath && attempts < INIT_WAIT_ATTEMPTS) {
          if (req.signal?.aborted) {
            finalise("client_disconnected");
            controller.close();
            return;
          }
          try {
            await Bun.sleep(ENCODER_POLL_MS);
          } catch {
            // Bun cancelled coroutine — connection closed
            finalise("client_disconnected");
            controller.close();
            return;
          }
          attempts++;
        }

        const activeJob = getJob(jobId);
        const initWaitMs = Date.now() - streamStartAt;
        span.addEvent("init_wait_complete", {
          init_wait_ms: initWaitMs,
          attempts,
          has_init: activeJob?.initSegmentPath != null,
        });

        // Filesystem fallback — job gone from memory but init.mp4 on disk.
        let initPath = activeJob?.initSegmentPath ?? null;
        if (!initPath) {
          const dbJob = getJobById(jobId);
          const fsInitPath = dbJob ? join(dbJob.segment_dir, "init.mp4") : null;
          const initExists = fsInitPath
            ? await access(fsInitPath)
                .then(() => true)
                .catch(() => false)
            : false;
          if (initExists && fsInitPath) {
            initPath = fsInitPath;
            if (activeJob) activeJob.initSegmentPath = fsInitPath;
          }
        }

        if (!initPath) {
          log.error("Init segment never became ready", { job_id: jobId });
          span.addEvent("init_timeout");
          finalise("complete");
          controller.error(new Error("Init segment not ready"));
          return;
        }

        try {
          const initBytes = await readFile(initPath);
          totalBytesSent += initBytes.byteLength;
          span.addEvent("init_sent", { bytes: initBytes.byteLength });
          writeLengthPrefixed(controller, new Uint8Array(initBytes));
          lastSentAt = Date.now();
          initSent = true;
        } catch (err) {
          finalise("complete");
          controller.error(err);
        }
        return;
      }

      // Media segment flow. Try to resolve the path; if not yet available,
      // wait (bounded by CONNECTION_TIMEOUT_MS) for the encoder.
      while (!req.signal?.aborted) {
        const path = await resolveNextSegmentPath();
        if (path) {
          try {
            const segBytes = await readFile(path);
            totalBytesSent += segBytes.byteLength;
            writeLengthPrefixed(controller, new Uint8Array(segBytes));
            lastSentAt = Date.now();
            index++;
            sentCount++;
            if (sentCount % 20 === 0) {
              log.info("Segment progress", {
                job_id: jobId,
                segments_sent: sentCount,
                total_bytes_sent: totalBytesSent,
              });
            }
            return;
          } catch (err) {
            log.warn("Segment read failed", {
              job_id: jobId,
              segment_index: index,
              message: (err as Error).message,
            });
            try {
              await Bun.sleep(50);
            } catch {
              finalise("client_disconnected");
              controller.close();
              return;
            }
            continue;
          }
        }

        // No path yet. Decide whether to wait for the encoder or close.
        const currentJob = getJob(jobId);
        if (!currentJob) {
          // Job evicted and not on disk — stream is done.
          log.info("Job ended, closing stream", {
            job_id: jobId,
            segment_index: index,
            total_segments: sentCount,
          });
          finalise("complete");
          controller.close();
          return;
        }
        if (currentJob.status === "complete" || currentJob.status === "error") {
          log.info("Job ended, closing stream", {
            job_id: jobId,
            job_status: currentJob.status,
            segment_index: index,
            total_segments: currentJob.segments.filter(Boolean).length,
          });
          finalise("complete");
          controller.close();
          return;
        }

        // Encoder still producing — wait briefly and re-check.
        try {
          await Bun.sleep(ENCODER_POLL_MS);
        } catch {
          finalise("client_disconnected");
          controller.close();
          return;
        }

        if (Date.now() - lastSentAt > CONNECTION_TIMEOUT_MS) {
          finalise("idle_timeout");
          controller.close();
          return;
        }
      }

      finalise("client_disconnected");
      controller.close();
    },

    cancel(): void {
      // Called when the consumer explicitly cancels the reader (e.g. page navigation
      // aborts the fetch). finalise() is idempotent so duplicate calls from
      // pull's own abort detection are safe.
      finalise("client_disconnected");
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
  };

  // In dev, Vite proxies /stream/; wildcard CORS keeps alternate Vite ports working.
  if (process.env.NODE_ENV !== "production") {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return new Response(stream, { headers });
}
