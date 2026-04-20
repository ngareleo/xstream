import { rm, stat } from "fs/promises";
import { join } from "path";

import { config } from "../config.js";
import { getLruJobs, markJobEvicted } from "../db/queries/jobs.js";
import { deleteSegmentsByJob } from "../db/queries/segments.js";
import { getOtelLogger } from "../telemetry/index.js";

const log = getOtelLogger("diskCache");

/** Default disk quota for the segment cache (20 GB). Override with SEGMENT_CACHE_GB env var. */
const DEFAULT_CACHE_GB = 20;

function cacheLimitBytes(): number {
  const envGb = parseFloat(process.env.SEGMENT_CACHE_GB ?? "");
  const gb = Number.isFinite(envGb) && envGb > 0 ? envGb : DEFAULT_CACHE_GB;
  return gb * 1024 * 1024 * 1024;
}

/**
 * Evicts the oldest completed jobs (by updated_at ASC) until the total
 * segment-file size is under `cacheLimitBytes()`. Called on server startup
 * and after each job completes.
 *
 * Eviction steps per job:
 *  1. Delete segment directory from disk.
 *  2. Remove segment rows from the DB.
 *  3. Mark the job as "evicted" (status=error) so the next stream request re-encodes.
 */
export async function pruneLruJobs(): Promise<void> {
  const limit = cacheLimitBytes();
  const jobs = getLruJobs();

  // Sum segment bytes from DB (accurate even if FS has minor discrepancies)
  let totalBytes = jobs.reduce((acc, j) => acc + (j.total_size_bytes ?? 0), 0);
  if (totalBytes <= limit) return;

  log.info("Cache over limit — evicting oldest jobs", {
    cache_gb: parseFloat((totalBytes / 1e9).toFixed(2)),
    limit_gb: parseFloat((limit / 1e9).toFixed(2)),
  });

  for (const job of jobs) {
    if (totalBytes <= limit) break;

    const dir = job.segment_dir;
    let rmOk = false;
    try {
      await rm(dir, { recursive: true, force: true });
      rmOk = true;
    } catch (err) {
      log.warn("Failed to remove segment dir", { dir, message: (err as Error).message });
    }

    if (rmOk) {
      // Only update the DB and decrement the running total after a confirmed
      // successful delete. If rm() fails, the cache is still consuming that
      // space and we must not undercount totalBytes or mark the job as gone.
      deleteSegmentsByJob(job.id);
      markJobEvicted(job.id);
      totalBytes -= job.total_size_bytes ?? 0;
      log.info("Evicted job", {
        job_id: job.id,
        freed_mb: parseFloat(((job.total_size_bytes ?? 0) / 1e6).toFixed(1)),
      });
    }
  }
}

/** Returns the total size of all completed segment files tracked in the DB. */
export async function getCacheSizeBytes(): Promise<number> {
  const jobs = getLruJobs();
  let total = 0;
  for (const job of jobs) {
    try {
      await stat(join(config.segmentDir, job.id));
      total += job.total_size_bytes ?? 0;
    } catch {
      // Dir already gone
    }
  }
  return total;
}
