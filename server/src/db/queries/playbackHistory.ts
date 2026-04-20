import { getDb } from "../index.js";

export interface PlaybackHistoryRow {
  id: string;
  trace_id: string;
  video_id: string;
  video_title: string;
  resolution: string;
  started_at: string;
}

export function insertPlaybackSession(row: PlaybackHistoryRow): void {
  getDb()
    .prepare(
      `INSERT INTO playback_history (id, trace_id, video_id, video_title, resolution, started_at)
       VALUES ($id, $trace_id, $video_id, $video_title, $resolution, $started_at)`
    )
    .run({
      $id: row.id,
      $trace_id: row.trace_id,
      $video_id: row.video_id,
      $video_title: row.video_title,
      $resolution: row.resolution,
      $started_at: row.started_at,
    });
}

export function getPlaybackHistory(limit = 50): PlaybackHistoryRow[] {
  return getDb()
    .prepare(
      `SELECT id, trace_id, video_id, video_title, resolution, started_at
       FROM playback_history
       ORDER BY started_at DESC
       LIMIT $limit`
    )
    .all({ $limit: limit }) as PlaybackHistoryRow[];
}
