/**
 * Job restoration — runs once on server startup.
 *
 * Any job still in "running" state when the server died was interrupted
 * mid-encode. Its segment directory may contain a partial (truncated) output
 * that would stall playback. Mark all such jobs as "error" so that the next
 * startTranscodeJob() call wipes the stale segment dir and re-encodes cleanly.
 */
import { getInterruptedJobs, updateJobStatus } from "../db/queries/jobs.js";

export async function restoreInterruptedJobs(): Promise<void> {
  const interrupted = getInterruptedJobs();

  for (const job of interrupted) {
    updateJobStatus(job.id, "error", {
      error: "Server restarted during transcode — will re-encode on next request",
    });
    console.log(
      `[restore] Job ${job.id.slice(0, 8)} — marked error (interrupted); segment dir will be wiped on re-request`
    );
  }
}
