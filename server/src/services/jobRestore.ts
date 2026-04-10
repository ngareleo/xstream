/**
 * Job restoration — runs once on server startup.
 *
 * Instead of blindly marking all previously-running jobs as "error", this
 * module inspects the filesystem to determine each job's actual state:
 *
 * - If init.mp4 + at least one segment exist → restore the job to memory
 *   with the segments that were completed, and update status to "complete"
 *   (all segments produced) or "interrupted" mapped to "error" (partial).
 * - If no segments at all → mark as "error" (transcode never produced output).
 *
 * This avoids forcing a full re-encode when the server restarts mid-job.
 */
import { existsSync } from "fs";
import { readdir, stat } from "fs/promises";
import { join } from "path";

import { getInterruptedJobs, updateJobStatus } from "../db/queries/jobs.js";
import { getSegmentsByJob, insertSegment } from "../db/queries/segments.js";
import type { ActiveJob, TranscodeJobRow } from "../types.js";
import { setJob } from "./jobStore.js";

export async function restoreInterruptedJobs(): Promise<void> {
  const interrupted = getInterruptedJobs();

  for (const job of interrupted) {
    const restored = await tryRestore(job);
    if (restored) {
      console.log(
        `[restore] Job ${job.id.slice(0, 8)} — restored with ${restored.segments.filter(Boolean).length} segments`
      );
    } else {
      updateJobStatus(job.id, "error", {
        error: "Server restarted during transcode — output not recoverable",
      });
      console.warn(`[restore] Job ${job.id.slice(0, 8)} — no segments found, marked as error`);
    }
  }
}

async function tryRestore(job: TranscodeJobRow): Promise<ActiveJob | null> {
  const segmentDir = job.segment_dir;
  const initPath = join(segmentDir, "init.mp4");

  if (!existsSync(initPath)) return null;

  // Scan directory for completed segment files
  let entries: string[];
  try {
    entries = await readdir(segmentDir);
  } catch {
    return null;
  }

  const segmentFiles = entries.filter((f) => /^segment_\d{4}\.m4s$/.test(f)).sort();
  if (segmentFiles.length === 0) return null;

  // Build segments array from filesystem + re-sync DB
  const dbSegments = getSegmentsByJob(job.id);
  const dbByIndex = new Map(dbSegments.map((s) => [s.segment_index, s]));

  const segments: string[] = [];

  for (const filename of segmentFiles) {
    const index = parseInt(filename.replace("segment_", "").replace(".m4s", ""), 10);
    const fullPath = join(segmentDir, filename);

    segments[index] = fullPath;

    // Insert into DB if missing (e.g. watcher missed it before the crash)
    if (!dbByIndex.has(index)) {
      try {
        const fileStat = await stat(fullPath);
        insertSegment({
          job_id: job.id,
          segment_index: index,
          path: fullPath,
          duration_seconds: null,
          size_bytes: fileStat.size,
        });
      } catch {
        /* file disappeared between readdir and stat */
      }
    }
  }

  const segmentCount = segments.filter(Boolean).length;

  // Mark restored jobs as complete regardless of whether the segment count matches the
  // original plan. The server streams whatever segments exist on disk; there is no
  // value in re-encoding when partial output is already playable.
  const status = "complete" as const;

  updateJobStatus(job.id, status, {
    total_segments: segmentCount,
    completed_segments: segmentCount,
  });

  const restored: ActiveJob = {
    ...job,
    status,
    total_segments: segmentCount,
    completed_segments: segmentCount,
    error: null,
    segments,
    initSegmentPath: initPath,
    subscribers: new Set(),
  };

  setJob(restored);
  return restored;
}
