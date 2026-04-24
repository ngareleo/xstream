/**
 * GraphQL presenters — pure functions that map internal DB/service types to
 * the shape expected by GraphQL resolvers (global ID, camelCase fields, enum
 * conversion). Keeping this logic here means resolvers stay thin and the
 * presentation format is testable in isolation.
 *
 * Resolver files should import from here instead of calling toGlobalId or
 * the mapper functions directly.
 */
import type { PlaybackHistoryRow } from "../db/queries/playbackHistory.js";
import type {
  LibraryRow,
  PlaybackErrorCode,
  TranscodeJobRow,
  VideoMetadataRow,
  VideoRow,
  WatchlistItemRow,
} from "../types.js";
import type { ActiveJob, Resolution } from "../types.js";
import { internalMediaTypeToGql, internalResolutionToGql, internalStatusToGql } from "./mappers.js";
import { toGlobalId } from "./relay.js";

// ── Output shapes (GraphQL field names, for resolver return values) ──────────

export interface GQLLibrary {
  id: string;
  name: string;
  path: string;
  mediaType: string;
  videoExtensions: string[];
  /** Internal row — available to sub-resolvers via parent argument */
  _raw: LibraryRow;
}

export interface GQLVideoMetadata {
  imdbId: string;
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  cast: string[];
  rating: number | null;
  plot: string | null;
  posterUrl: string | null;
}

export interface GQLVideo {
  id: string;
  title: string;
  filename: string;
  durationSeconds: number;
  fileSizeBytes: number;
  bitrate: number;
  matched: boolean;
  _raw: VideoRow;
}

export interface GQLWatchlistItem {
  id: string;
  addedAt: string;
  progressSeconds: number;
  notes: string | null;
  _raw: WatchlistItemRow;
}

export interface GQLTranscodeJob {
  __typename: "TranscodeJob";
  id: string;
  resolution: string;
  status: string;
  totalSegments: number | null;
  completedSegments: number;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  createdAt: string;
  error: string | null;
  errorCode: PlaybackErrorCode | null;
  _raw: TranscodeJobRow | ActiveJob;
}

export interface GQLPlaybackError {
  __typename: "PlaybackError";
  code: PlaybackErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
}

// ── Presenter functions ───────────────────────────────────────────────────────

export function presentLibrary(row: LibraryRow): GQLLibrary {
  let videoExtensions: string[] = [];
  try {
    videoExtensions = JSON.parse(row.video_extensions) as string[];
  } catch {
    // Fall through with empty array
  }
  return {
    id: toGlobalId("Library", row.id),
    name: row.name,
    path: row.path,
    mediaType: internalMediaTypeToGql(row.media_type),
    videoExtensions,
    _raw: row,
  };
}

export function presentVideo(row: VideoRow, matched = false): GQLVideo {
  return {
    id: toGlobalId("Video", row.id),
    title: row.title ?? row.filename,
    filename: row.filename,
    durationSeconds: row.duration_seconds,
    fileSizeBytes: row.file_size_bytes,
    bitrate: row.bitrate,
    matched,
    _raw: row,
  };
}

export function presentVideoMetadata(row: VideoMetadataRow): GQLVideoMetadata {
  let cast: string[] = [];
  try {
    if (row.cast_list) cast = JSON.parse(row.cast_list) as string[];
  } catch {
    // Fall through
  }
  return {
    imdbId: row.imdb_id,
    title: row.title,
    year: row.year,
    genre: row.genre,
    director: row.director,
    cast,
    rating: row.rating,
    plot: row.plot,
    posterUrl: row.poster_url,
  };
}

export function presentWatchlistItem(row: WatchlistItemRow): GQLWatchlistItem {
  return {
    id: toGlobalId("WatchlistItem", row.id),
    addedAt: row.added_at,
    progressSeconds: row.progress_seconds,
    notes: row.notes,
    _raw: row,
  };
}

export function presentJob(row: TranscodeJobRow | ActiveJob): GQLTranscodeJob {
  // errorCode lives only on ActiveJob (the in-memory state); restored TranscodeJobRow
  // entries don't carry it because the DB row is just `error: text`. That's fine for
  // the subscription path — only the in-memory job (which is what `transcodeJobUpdated`
  // emits) needs the typed code.
  const errorCode = "errorCode" in row ? row.errorCode : null;
  return {
    __typename: "TranscodeJob",
    id: toGlobalId("TranscodeJob", row.id),
    resolution: internalResolutionToGql(row.resolution),
    status: internalStatusToGql(row.status),
    totalSegments: row.total_segments,
    completedSegments: row.completed_segments,
    startTimeSeconds: row.start_time_seconds,
    endTimeSeconds: row.end_time_seconds,
    createdAt: row.created_at,
    error: row.error,
    errorCode,
    _raw: row,
  };
}

export function presentPlaybackError(args: {
  code: PlaybackErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}): GQLPlaybackError {
  return {
    __typename: "PlaybackError",
    code: args.code,
    message: args.message,
    retryable: args.retryable,
    retryAfterMs: args.retryAfterMs ?? null,
  };
}

export interface GQLPlaybackSession {
  id: string;
  traceId: string;
  videoTitle: string;
  resolution: string;
  startedAt: string;
}

export function presentPlaybackSession(row: PlaybackHistoryRow): GQLPlaybackSession {
  return {
    id: row.id,
    traceId: row.trace_id,
    videoTitle: row.video_title,
    resolution: internalResolutionToGql(row.resolution as Resolution),
    startedAt: row.started_at,
  };
}

// ── Cursor helpers (pagination) ───────────────────────────────────────────────

export function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString("base64");
}

export function decodeCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  if (!decoded.startsWith("offset:")) {
    throw new Error(`Invalid pagination cursor: "${cursor}"`);
  }
  const value = parseInt(decoded.slice("offset:".length), 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid pagination cursor offset in: "${cursor}"`);
  }
  return value;
}
