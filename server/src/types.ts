export type Resolution = "240p" | "360p" | "480p" | "720p" | "1080p" | "4k";

export type MediaType = "movies" | "tvShows";

export type JobStatus = "pending" | "running" | "complete" | "error";

export interface ResolutionProfile {
  label: Resolution;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  h264Level: string;
  segmentDuration: number;
}

export interface MediaLibraryEntry {
  name: string;
  path: string;
  mediaType: MediaType;
  env: "dev" | "prod" | "user";
  /** File extensions to scan. Defaults to DEFAULT_VIDEO_EXTENSIONS if omitted. */
  videoExtensions?: string[];
}

export const DEFAULT_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm", ".ts"];

// DB row shapes (snake_case mirrors column names)
export interface LibraryRow {
  id: string;
  name: string;
  path: string;
  media_type: MediaType;
  env: string;
  /** JSON-encoded string array of file extensions, e.g. '[\".mkv\",\".mp4\"]' */
  video_extensions: string;
}

export interface VideoMetadataRow {
  video_id: string;
  imdb_id: string;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  /** JSON-encoded string array of cast names */
  cast_list: string | null;
  rating: number | null;
  plot: string | null;
  poster_url: string | null;
  matched_at: string;
}

export interface WatchlistItemRow {
  id: string;
  video_id: string;
  added_at: string;
  progress_seconds: number;
  notes: string | null;
}

export interface UserSettingRow {
  key: string;
  value: string;
}

export interface VideoRow {
  id: string;
  library_id: string;
  path: string;
  filename: string;
  title: string | null;
  duration_seconds: number;
  file_size_bytes: number;
  bitrate: number;
  scanned_at: string;
  /** SHA-1 of the first 64 KB of the file, prefixed with file size. Stable across renames/moves. */
  content_fingerprint: string;
}

export interface VideoStreamRow {
  id: number;
  video_id: string;
  stream_type: "video" | "audio";
  codec: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  channels: number | null;
  sample_rate: number | null;
}

export interface TranscodeJobRow {
  id: string;
  video_id: string;
  resolution: Resolution;
  status: JobStatus;
  segment_dir: string;
  total_segments: number | null;
  completed_segments: number;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface SegmentRow {
  id: number;
  job_id: string;
  segment_index: number;
  path: string;
  duration_seconds: number | null;
  size_bytes: number | null;
}

/**
 * Typed code for known playback failure modes. Mirrors the GraphQL
 * `PlaybackErrorCode` enum 1:1 — keep in sync with `schema.ts` /
 * `schema.graphql`. The chunker emits these on `ActiveJob.errorCode` for
 * mid-job failures; the resolver returns them in the `StartTranscodeResult`
 * union for chunk-start failures.
 */
export type PlaybackErrorCode =
  | "CAPACITY_EXHAUSTED"
  | "VIDEO_NOT_FOUND"
  | "PROBE_FAILED"
  | "ENCODE_FAILED"
  | "INTERNAL";

// In-memory job state (superset of DB row, tracks live ffmpeg process)
export interface ActiveJob extends TranscodeJobRow {
  segments: string[]; // ordered list of completed segment paths
  initSegmentPath: string | null;
  subscribers: Set<ReadableStreamDefaultController>;
  /** Number of active /stream/:jobId HTTP connections consuming this job. */
  connections: number;
  /** Set when the job fails mid-flight (probe / encode); null otherwise. */
  errorCode: PlaybackErrorCode | null;
}
