/**
 * Job restoration — runs once on server startup.
 *
 * Any job still in "running" state when the server died was interrupted
 * mid-encode. Its segment directory may contain a partial (truncated) output
 * that would stall playback. Mark all such jobs as "error" so that the next
 * startTranscodeJob() call wipes the stale segment dir and re-encodes cleanly.
 */
import { getInterruptedJobs, updateJobStatus } from "../db/queries/jobs.js";
import { getOtelLogger } from "../telemetry/index.js";

const log = getOtelLogger("jobRestore");

export async function restoreInterruptedJobs(): Promise<void> {
  const interrupted = getInterruptedJobs();

  for (const job of interrupted) {
    updateJobStatus(job.id, "error", {
      error: "Server restarted during transcode — will re-encode on next request",
    });
    log.info("Interrupted job marked as error — will re-encode on next request", {
      job_id: job.id,
    });
  }
}
