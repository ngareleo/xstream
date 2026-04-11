import type { VideoRow, VideoStreamRow } from "../../types.js";
import { getDb } from "../index.js";

export function upsertVideo(row: VideoRow): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO videos (id, library_id, path, filename, title, duration_seconds, file_size_bytes, bitrate, scanned_at, content_fingerprint)
    VALUES ($id, $library_id, $path, $filename, $title, $duration_seconds, $file_size_bytes, $bitrate, $scanned_at, $content_fingerprint)
    ON CONFLICT(path) DO UPDATE SET
      library_id          = excluded.library_id,
      filename            = excluded.filename,
      title               = excluded.title,
      duration_seconds    = excluded.duration_seconds,
      file_size_bytes     = excluded.file_size_bytes,
      bitrate             = excluded.bitrate,
      scanned_at          = excluded.scanned_at,
      content_fingerprint = excluded.content_fingerprint
  `
  ).run({
    $id: row.id,
    $library_id: row.library_id,
    $path: row.path,
    $filename: row.filename,
    $title: row.title,
    $duration_seconds: row.duration_seconds,
    $file_size_bytes: row.file_size_bytes,
    $bitrate: row.bitrate,
    $scanned_at: row.scanned_at,
    $content_fingerprint: row.content_fingerprint,
  });
}

export function replaceVideoStreams(videoId: string, streams: Omit<VideoStreamRow, "id">[]): void {
  const db = getDb();
  db.prepare("DELETE FROM video_streams WHERE video_id = $video_id").run({ $video_id: videoId });
  const stmt = db.prepare(`
    INSERT INTO video_streams (video_id, stream_type, codec, width, height, fps, channels, sample_rate)
    VALUES ($video_id, $stream_type, $codec, $width, $height, $fps, $channels, $sample_rate)
  `);
  for (const s of streams) {
    stmt.run({
      $video_id: s.video_id,
      $stream_type: s.stream_type,
      $codec: s.codec,
      $width: s.width,
      $height: s.height,
      $fps: s.fps,
      $channels: s.channels,
      $sample_rate: s.sample_rate,
    });
  }
}

export function getVideoById(id: string): VideoRow | null {
  return getDb().prepare("SELECT * FROM videos WHERE id = $id").get({ $id: id }) as VideoRow | null;
}

export function getVideosByLibrary(libraryId: string, limit: number, offset: number): VideoRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM videos WHERE library_id = $library_id ORDER BY title, filename LIMIT $limit OFFSET $offset"
    )
    .all({ $library_id: libraryId, $limit: limit, $offset: offset }) as VideoRow[];
}

export function countVideosByLibrary(libraryId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM videos WHERE library_id = $library_id")
    .get({ $library_id: libraryId }) as { count: number };
  return row.count;
}

export function getStreamsByVideoId(videoId: string): VideoStreamRow[] {
  return getDb()
    .prepare("SELECT * FROM video_streams WHERE video_id = $video_id")
    .all({ $video_id: videoId }) as VideoStreamRow[];
}
