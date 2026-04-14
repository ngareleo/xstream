import { access, readFile } from "fs/promises";
import { join } from "path";

import { getJobById } from "../db/queries/jobs.js";
import { getSegmentsByJob } from "../db/queries/segments.js";
import { killJob } from "../services/chunker.js";
import { addConnection, getJob, removeConnection } from "../services/jobStore.js";

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

export async function handleStream(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const jobId = parts[2];
  const fromParam = parseInt(url.searchParams.get("from") ?? "0", 10);
  const fromIndex = Number.isFinite(fromParam) && fromParam >= 0 ? fromParam : 0;

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  // Try in-memory store first, fall back to DB for completed jobs
  const memJob = getJob(jobId);
  if (!memJob) {
    const dbJob = getJobById(jobId);
    if (!dbJob) return new Response("Job not found", { status: 404 });
    if (dbJob.status === "error")
      return new Response(`Job failed: ${dbJob.error}`, { status: 500 });
    // Note: if job is complete in DB but not in memory, chunker.startTranscodeJob should
    // have restored it. If it reaches here, we'll still try to stream below.
  }

  const CONNECTION_TIMEOUT_MS = 90_000;

  const stream = new ReadableStream({
    async start(controller) {
      console.log(`[stream] ${jobId.slice(0, 8)} — start (from=${fromIndex})`);
      addConnection(jobId);
      let lastSentAt = Date.now();

      // Wait for init segment (up to 10 s), re-fetching the job each iteration so
      // that jobs added to memory after the stream started are detected promptly.
      let attempts = 0;
      while (!getJob(jobId)?.initSegmentPath && attempts < 100) {
        await Bun.sleep(100);
        attempts++;
      }
      // Acquire the job reference after waiting — it may now be in memory.
      const activeJob = getJob(jobId);

      if (!activeJob?.initSegmentPath) {
        // Last resort: check DB + filesystem
        const dbJob = getJobById(jobId);
        const fsInitPath = dbJob ? join(dbJob.segment_dir, "init.mp4") : null;
        const initExists = fsInitPath
          ? await access(fsInitPath)
              .then(() => true)
              .catch(() => false)
          : false;
        if (!initExists || !fsInitPath) {
          console.error(`[stream] ${jobId.slice(0, 8)} — init segment never became ready`);
          removeConnection(jobId);
          controller.error(new Error("Init segment not ready"));
          return;
        }
        // fsInitPath is non-null because initExists is true
        if (activeJob) activeJob.initSegmentPath = fsInitPath;
      }

      const dbJobFallback = getJobById(jobId);
      const initPath =
        activeJob?.initSegmentPath ??
        (dbJobFallback ? join(dbJobFallback.segment_dir, "init.mp4") : null);

      if (!initPath) {
        removeConnection(jobId);
        controller.error(new Error("Init segment path unavailable"));
        return;
      }

      // Send init segment first
      try {
        const initBytes = await readFile(initPath);
        console.log(`[stream] ${jobId.slice(0, 8)} — sending init (${initBytes.byteLength} bytes)`);
        writeLengthPrefixed(controller, new Uint8Array(initBytes));
        lastSentAt = Date.now();
      } catch (err) {
        removeConnection(jobId);
        controller.error(err);
        return;
      }

      let index = fromIndex;
      let sentCount = 0;

      // Stream segments as they become available
      while (true) {
        const currentJob = getJob(jobId);

        if (!currentJob) {
          // Job evicted from memory — serve remaining segments from DB
          const dbSegments = getSegmentsByJob(jobId);
          const remaining = dbSegments.filter((s) => s.segment_index >= index);
          console.log(
            `[stream] ${jobId.slice(0, 8)} — serving ${remaining.length} segments from DB`
          );
          for (const seg of remaining) {
            if (req.signal?.aborted) break;
            const segBytes = await readFile(seg.path);
            writeLengthPrefixed(controller, new Uint8Array(segBytes));
            lastSentAt = Date.now();
            sentCount++;
          }
          break;
        }

        // Resolve path: prefer in-memory array, fall back to expected filesystem path
        let path: string | null = currentJob.segments[index] ?? null;
        if (!path) {
          // The watcher may have missed this segment (timing race). Check disk directly.
          const expectedPath = segmentPath(currentJob.segment_dir, index);
          const exists = await access(expectedPath)
            .then(() => true)
            .catch(() => false);
          if (exists) {
            path = expectedPath;
            currentJob.segments[index] = path; // patch the in-memory array
          }
        }

        if (path) {
          try {
            const segBytes = await readFile(path);
            writeLengthPrefixed(controller, new Uint8Array(segBytes));
            lastSentAt = Date.now();
            index++;
            sentCount++;
            if (sentCount % 20 === 0) {
              console.log(`[stream] ${jobId.slice(0, 8)} — sent ${sentCount} segments`);
            }
          } catch (err) {
            console.warn(
              `[stream] ${jobId.slice(0, 8)} — readFile failed for segment ${index}:`,
              (err as Error).message
            );
            await Bun.sleep(50);
          }
        } else if (currentJob.status === "complete" || currentJob.status === "error") {
          console.log(
            `[stream] ${jobId.slice(0, 8)} — job ${currentJob.status} at segment ${index}/${currentJob.segments.filter(Boolean).length} → closing`
          );
          break;
        } else {
          // Segment not yet produced; wait for the encoder
          await Bun.sleep(100);

          // 90-second idle timeout: if no segment has been sent for 90s and we're
          // still waiting, the job may be stalled or the client silently disconnected.
          if (Date.now() - lastSentAt > CONNECTION_TIMEOUT_MS) {
            console.log(`[stream] ${jobId.slice(0, 8)} — 90s idle timeout, closing`);
            removeConnection(jobId);
            const idleJob = getJob(jobId);
            if (idleJob && idleJob.connections === 0 && idleJob.status === "running") {
              killJob(jobId);
            }
            controller.close();
            return;
          }
        }

        // Check if client disconnected
        if (req.signal?.aborted) {
          console.log(
            `[stream] ${jobId.slice(0, 8)} — client disconnected after ${sentCount} segments`
          );
          removeConnection(jobId);
          const disconnectedJob = getJob(jobId);
          if (
            disconnectedJob &&
            disconnectedJob.connections === 0 &&
            disconnectedJob.status === "running"
          ) {
            killJob(jobId);
          }
          controller.close();
          return;
        }
      }

      // Natural end of stream (job complete or served all DB segments)
      removeConnection(jobId);
      console.log(`[stream] ${jobId.slice(0, 8)} — done, sent ${sentCount} media segments`);
      controller.close();
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Cache-Control": "no-store",
  };

  // In development the client is served by Vite which proxies /stream/ requests,
  // so technically no CORS header is needed. Using a wildcard here is safe for dev
  // and avoids breakage when Vite picks an alternate port (e.g. 5174).
  if (process.env.NODE_ENV !== "production") {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return new Response(stream, { headers });
}
