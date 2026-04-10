export type Resolution =
  | "240p"
  | "360p"
  | "480p"
  | "720p"
  | "1080p"
  | "4k";

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
  env: "dev" | "prod";
  /** File extensions to scan. Defaults to DEFAULT_VIDEO_EXTENSIONS if omitted. */
  videoExtensions?: string[];
}

export const DEFAULT_VIDEO_EXTENSIONS = [".mp4", ".mkv", ".mov", ".avi", ".m4v", ".webm", ".ts"];

export interface MediaFilesConfig {
  libraries: MediaLibraryEntry[];
}

// DB row shapes (snake_case mirrors column names)
export interface LibraryRow {
  id: string;
  name: string;
  path: string;
  media_type: MediaType;
  env: string;
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

// In-memory job state (superset of DB row, tracks live ffmpeg process)
export interface ActiveJob extends TranscodeJobRow {
  segments: string[]; // ordered list of completed segment paths
  initSegmentPath: string | null;
  subscribers: Set<ReadableStreamDefaultController>;
}
