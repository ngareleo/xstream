import { rm, stat } from "fs/promises";
import { join } from "path";

import { config } from "../config.js";
import { getLruJobs, markJobEvicted } from "../db/queries/jobs.js";
import { deleteSegmentsByJob } from "../db/queries/segments.js";

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

  console.log(
    `[diskCache] Cache ${(totalBytes / 1e9).toFixed(2)} GB > limit ${(limit / 1e9).toFixed(2)} GB — evicting oldest jobs`
  );

  for (const job of jobs) {
    if (totalBytes <= limit) break;

    const dir = job.segment_dir;
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[diskCache] Failed to remove ${dir}:`, (err as Error).message);
    }

    deleteSegmentsByJob(job.id);
    markJobEvicted(job.id);
    totalBytes -= job.total_size_bytes ?? 0;
    console.log(
      `[diskCache] Evicted job ${job.id.slice(0, 8)} (${((job.total_size_bytes ?? 0) / 1e6).toFixed(1)} MB freed)`
    );
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
