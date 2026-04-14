import type { TranscodeJobRow } from "../../types.js";
import { getDb } from "../index.js";

export function insertJob(row: TranscodeJobRow): void {
  getDb()
    .prepare(
      `
    INSERT OR REPLACE INTO transcode_jobs
      (id, video_id, resolution, status, segment_dir, total_segments, completed_segments,
       start_time_seconds, end_time_seconds, created_at, updated_at, error)
    VALUES
      ($id, $video_id, $resolution, $status, $segment_dir, $total_segments, $completed_segments,
       $start_time_seconds, $end_time_seconds, $created_at, $updated_at, $error)
  `
    )
    .run({
      $id: row.id,
      $video_id: row.video_id,
      $resolution: row.resolution,
      $status: row.status,
      $segment_dir: row.segment_dir,
      $total_segments: row.total_segments,
      $completed_segments: row.completed_segments,
      $start_time_seconds: row.start_time_seconds,
      $end_time_seconds: row.end_time_seconds,
      $created_at: row.created_at,
      $updated_at: row.updated_at,
      $error: row.error,
    });
}

export function updateJobStatus(
  id: string,
  status: TranscodeJobRow["status"],
  extra: Partial<Pick<TranscodeJobRow, "total_segments" | "completed_segments" | "error">> = {}
): void {
  getDb()
    .prepare(
      `
    UPDATE transcode_jobs SET
      status             = $status,
      total_segments     = COALESCE($total_segments, total_segments),
      completed_segments = COALESCE($completed_segments, completed_segments),
      error              = $error,
      updated_at         = $updated_at
    WHERE id = $id
  `
    )
    .run({
      $id: id,
      $status: status,
      $total_segments: extra.total_segments ?? null,
      $completed_segments: extra.completed_segments ?? null,
      $error: extra.error ?? null,
      $updated_at: new Date().toISOString(),
    });
}

export function getJobById(id: string): TranscodeJobRow | null {
  return getDb()
    .prepare("SELECT * FROM transcode_jobs WHERE id = $id")
    .get({ $id: id }) as TranscodeJobRow | null;
}

export function getInterruptedJobs(): TranscodeJobRow[] {
  return getDb()
    .prepare("SELECT * FROM transcode_jobs WHERE status = 'running'")
    .all() as TranscodeJobRow[];
}

export function deleteJobById(id: string): void {
  getDb().prepare("DELETE FROM transcode_jobs WHERE id = $id").run({ $id: id });
}

/**
 * Returns completed jobs sorted by updated_at ASC (oldest first) along with
 * their total segment size in bytes — used by the LRU disk eviction logic.
 */
export function getLruJobs(): Array<TranscodeJobRow & { total_size_bytes: number }> {
  return getDb()
    .prepare(
      `
      SELECT j.*, COALESCE(SUM(s.size_bytes), 0) AS total_size_bytes
      FROM transcode_jobs j
      LEFT JOIN segments s ON s.job_id = j.id
      WHERE j.status = 'complete'
      GROUP BY j.id
      ORDER BY j.updated_at ASC
    `
    )
    .all() as Array<TranscodeJobRow & { total_size_bytes: number }>;
}

/**
 * Marks a job as evicted so the next stream request for the same content range
 * will trigger a fresh transcode rather than trying to serve missing files.
 */
export function markJobEvicted(id: string): void {
  getDb()
    .prepare(
      `UPDATE transcode_jobs SET status = 'error', error = 'evicted', updated_at = $updated_at WHERE id = $id`
    )
    .run({ $id: id, $updated_at: new Date().toISOString() });
}
