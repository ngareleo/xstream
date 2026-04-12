import type { MediaType, VideoRow, VideoStreamRow } from "../../types.js";
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

export interface VideoFilter {
  search?: string;
  /** Internal MediaType — "movies" | "tvShows". Filters by the parent library's media_type. */
  mediaType?: MediaType;
}

export function getVideosByLibrary(
  libraryId: string,
  limit: number,
  offset: number,
  filter: VideoFilter = {}
): VideoRow[] {
  const { search, mediaType } = filter;
  const conditions: string[] = ["v.library_id = $library_id"];
  const params: Record<string, string | number | null> = {
    $library_id: libraryId,
    $limit: limit,
    $offset: offset,
  };

  if (search) {
    conditions.push("v.title LIKE $search");
    params.$search = `%${search}%`;
  }
  if (mediaType) {
    // mediaType lives on the library row, not on individual videos — filter via subquery
    conditions.push(
      "EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = $media_type)"
    );
    params.$media_type = mediaType;
  }

  const where = conditions.join(" AND ");
  return getDb()
    .prepare(
      `SELECT v.* FROM videos v WHERE ${where} ORDER BY v.title, v.filename LIMIT $limit OFFSET $offset`
    )
    .all(params) as VideoRow[];
}

export function countVideosByLibrary(libraryId: string, filter: VideoFilter = {}): number {
  const { search, mediaType } = filter;
  const conditions: string[] = ["v.library_id = $library_id"];
  const params: Record<string, string | number | null> = { $library_id: libraryId };

  if (search) {
    conditions.push("v.title LIKE $search");
    params.$search = `%${search}%`;
  }
  if (mediaType) {
    conditions.push(
      "EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = $media_type)"
    );
    params.$media_type = mediaType;
  }

  const where = conditions.join(" AND ");
  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM videos v WHERE ${where}`)
    .get(params) as { count: number };
  return row.count;
}

export interface VideosFilter {
  libraryId?: string;
  search?: string;
  mediaType?: MediaType;
}

/**
 * Fetches videos across all libraries, with optional filtering by library,
 * search string, and media type. Used by the top-level `videos` Query field
 * so the client can delegate library selection to the server.
 */
export function getVideos(limit: number, filter: VideosFilter = {}): VideoRow[] {
  const { libraryId, search, mediaType } = filter;
  const conditions: string[] = [];
  const params: Record<string, string | number | null> = { $limit: limit };

  if (libraryId) {
    conditions.push("v.library_id = $library_id");
    params.$library_id = libraryId;
  }
  if (search) {
    conditions.push("v.title LIKE $search");
    params.$search = `%${search}%`;
  }
  if (mediaType) {
    conditions.push(
      "EXISTS (SELECT 1 FROM libraries l WHERE l.id = v.library_id AND l.media_type = $media_type)"
    );
    params.$media_type = mediaType;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return getDb()
    .prepare(`SELECT v.* FROM videos v ${where} ORDER BY v.title, v.filename LIMIT $limit`)
    .all(params) as VideoRow[];
}

export function sumFileSizeByLibrary(libraryId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(file_size_bytes), 0) AS total FROM videos WHERE library_id = $library_id"
    )
    .get({ $library_id: libraryId }) as { total: number };
  return row.total;
}

export function getStreamsByVideoId(videoId: string): VideoStreamRow[] {
  return getDb()
    .prepare("SELECT * FROM video_streams WHERE video_id = $video_id")
    .all({ $video_id: videoId }) as VideoStreamRow[];
}
