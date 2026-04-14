import type { SegmentRow } from "../../types.js";
import { getDb } from "../index.js";

export function insertSegment(row: Omit<SegmentRow, "id">): void {
  getDb()
    .prepare(
      `
    INSERT OR IGNORE INTO segments (job_id, segment_index, path, duration_seconds, size_bytes)
    VALUES ($job_id, $segment_index, $path, $duration_seconds, $size_bytes)
  `
    )
    .run({
      $job_id: row.job_id,
      $segment_index: row.segment_index,
      $path: row.path,
      $duration_seconds: row.duration_seconds,
      $size_bytes: row.size_bytes,
    });
}

export function getSegmentsByJob(jobId: string): SegmentRow[] {
  return getDb()
    .prepare("SELECT * FROM segments WHERE job_id = $job_id ORDER BY segment_index")
    .all({ $job_id: jobId }) as SegmentRow[];
}

export function getSegment(jobId: string, index: number): SegmentRow | null {
  return getDb()
    .prepare("SELECT * FROM segments WHERE job_id = $job_id AND segment_index = $index")
    .get({ $job_id: jobId, $index: index }) as SegmentRow | null;
}

export function deleteSegmentsByJob(jobId: string): void {
  getDb().prepare("DELETE FROM segments WHERE job_id = $job_id").run({ $job_id: jobId });
}
