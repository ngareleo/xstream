/**
 * GraphQL presenters — pure functions that map internal DB/service types to
 * the shape expected by GraphQL resolvers (global ID, camelCase fields, enum
 * conversion). Keeping this logic here means resolvers stay thin and the
 * presentation format is testable in isolation.
 *
 * Resolver files should import from here instead of calling toGlobalId or
 * the mapper functions directly.
 */
import type { LibraryRow, TranscodeJobRow, VideoRow } from "../types.js";
import type { ActiveJob } from "../types.js";
import { internalMediaTypeToGql, internalResolutionToGql, internalStatusToGql } from "./mappers.js";
import { toGlobalId } from "./relay.js";

// ── Output shapes (GraphQL field names, for resolver return values) ──────────

export interface GQLLibrary {
  id: string;
  name: string;
  path: string;
  mediaType: string;
  /** Internal row — available to sub-resolvers via parent argument */
  _raw: LibraryRow;
}

export interface GQLVideo {
  id: string;
  title: string;
  filename: string;
  durationSeconds: number;
  fileSizeBytes: number;
  bitrate: number;
  _raw: VideoRow;
}

export interface GQLTranscodeJob {
  id: string;
  resolution: string;
  status: string;
  totalSegments: number | null;
  completedSegments: number;
  startTimeSeconds: number | null;
  endTimeSeconds: number | null;
  createdAt: string;
  error: string | null;
  _raw: TranscodeJobRow | ActiveJob;
}

// ── Presenter functions ───────────────────────────────────────────────────────

export function presentLibrary(row: LibraryRow): GQLLibrary {
  return {
    id: toGlobalId("Library", row.id),
    name: row.name,
    path: row.path,
    mediaType: internalMediaTypeToGql(row.media_type),
    _raw: row,
  };
}

export function presentVideo(row: VideoRow): GQLVideo {
  return {
    id: toGlobalId("Video", row.id),
    title: row.title ?? row.filename,
    filename: row.filename,
    durationSeconds: row.duration_seconds,
    fileSizeBytes: row.file_size_bytes,
    bitrate: row.bitrate,
    _raw: row,
  };
}

export function presentJob(row: TranscodeJobRow | ActiveJob): GQLTranscodeJob {
  return {
    id: toGlobalId("TranscodeJob", row.id),
    resolution: internalResolutionToGql(row.resolution),
    status: internalStatusToGql(row.status),
    totalSegments: row.total_segments,
    completedSegments: row.completed_segments,
    startTimeSeconds: row.start_time_seconds,
    endTimeSeconds: row.end_time_seconds,
    createdAt: row.created_at,
    error: row.error,
    _raw: row,
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
