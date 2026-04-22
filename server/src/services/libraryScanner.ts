import { createHash } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { createReadStream } from "fs";
import { access, readdir, stat } from "fs/promises";
import { basename, extname, join } from "path";

import { getAllLibraries, upsertLibrary } from "../db/queries/libraries.js";
import { getUnmatchedVideoIds, upsertVideoMetadata } from "../db/queries/videoMetadata.js";
import { replaceVideoStreams, upsertVideo } from "../db/queries/videos.js";
import { getVideoById } from "../db/queries/videos.js";
import { getOtelLogger, getTracer } from "../telemetry/index.js";
import type {
  LibraryRow,
  MediaLibraryEntry,
  VideoMetadataRow,
  VideoRow,
  VideoStreamRow,
} from "../types.js";
import { DEFAULT_VIDEO_EXTENSIONS } from "../types.js";
import { isOmdbConfigured, searchOmdb } from "./omdbService.js";
import { isScanRunning, markScanEnded, markScanProgress, markScanStarted } from "./scanStore.js";

const log = getOtelLogger("scanner");
const scannerTracer = getTracer("scanner");

// fluent-ffmpeg's binary paths are wired once at startup by the resolver call
// in `index.ts` (see server/src/services/ffmpegPath.ts::resolveFfmpegPaths).
// Do NOT call setFfmpegPath/setFfprobePath here — fluent-ffmpeg's cache is
// module-global, so a stale per-module write would clobber the startup setting.

// Maximum number of files probed/fingerprinted simultaneously.
// Keeps file-descriptor and CPU usage bounded on large libraries.
const SCAN_CONCURRENCY = 4;

/** Runs task functions with at most `limit` executing concurrently. */
async function runConcurrently(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function deriveTitle(filename: string): string {
  return basename(filename, extname(filename)).replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
}

async function probeVideo(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/**
 * Reads the first 64 KB of a file and returns a fingerprint string of the form
 * `<sizeBytes>:<sha1hex>`. Stable across renames and moves; changes only when
 * file content changes.
 */
async function computeContentFingerprint(filePath: string, sizeBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha1");
    const stream = createReadStream(filePath, { start: 0, end: 65535 });
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("end", () => resolve(`${sizeBytes}:${hash.digest("hex")}`));
    stream.on("error", reject);
  });
}

/** Yields every matching file path found under dir, depth-first. */
async function* walkDirectory(dir: string, extensions: Set<string>): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    log.warn("Cannot read directory", { dir });
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDirectory(fullPath, extensions);
    } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      yield fullPath;
    }
  }
}

function evalFraction(fraction: string): number {
  const [num, den] = fraction.split("/").map(Number);
  return den ? num / den : num;
}

async function processFile(filePath: string, libraryId: string): Promise<void> {
  try {
    // stat is cheap; probe + fingerprint run concurrently once we have the file size
    const fileStat = await stat(filePath);
    const [probe, content_fingerprint] = await Promise.all([
      probeVideo(filePath),
      computeContentFingerprint(filePath, fileStat.size),
    ]);

    const format = probe.format;
    const streams = probe.streams;
    const videoId = sha1(filePath);
    const title = (format.tags?.title as string | undefined) ?? deriveTitle(filePath);

    const videoRow: VideoRow = {
      id: videoId,
      library_id: libraryId,
      path: filePath,
      filename: basename(filePath),
      title,
      duration_seconds: Number(format.duration ?? 0),
      file_size_bytes: fileStat.size,
      bitrate: Number(format.bit_rate ?? 0),
      scanned_at: new Date().toISOString(),
      content_fingerprint,
    };
    const isNew = !getVideoById(videoId);
    upsertVideo(videoRow);

    const streamRows: Omit<VideoStreamRow, "id">[] = streams
      .filter((s) => s.codec_type === "video" || s.codec_type === "audio")
      .map((s) => ({
        video_id: videoId,
        stream_type: s.codec_type as "video" | "audio",
        codec: s.codec_name ?? "unknown",
        width: s.width ?? null,
        height: s.height ?? null,
        fps: s.r_frame_rate ? evalFraction(s.r_frame_rate) : null,
        channels: s.channels ?? null,
        sample_rate: s.sample_rate ? Number(s.sample_rate) : null,
      }));
    replaceVideoStreams(videoId, streamRows);
    if (isNew) {
      log.info(`New video discovered: ${basename(filePath)}`, {
        filename: basename(filePath),
        path: filePath,
      });
    }
  } catch (err) {
    log.warn("Failed to probe file", { path: filePath, message: (err as Error).message });
  }
}

async function scanLibraryEntry(entry: MediaLibraryEntry): Promise<LibraryRow> {
  const libraryId = sha1(entry.path);
  const libraryRow: LibraryRow = {
    id: libraryId,
    name: entry.name,
    path: entry.path,
    media_type: entry.mediaType,
    env: entry.env,
    video_extensions: JSON.stringify(entry.videoExtensions ?? DEFAULT_VIDEO_EXTENSIONS),
  };
  upsertLibrary(libraryRow);

  const extensions = new Set(
    (entry.videoExtensions ?? DEFAULT_VIDEO_EXTENSIONS).map((e) => e.toLowerCase())
  );

  // Collect all file paths first, then process with bounded concurrency.
  const filePaths: string[] = [];
  for await (const filePath of walkDirectory(entry.path, extensions)) {
    filePaths.push(filePath);
  }

  const total = filePaths.length;
  let done = 0;

  // Emit immediately so the client sees this library enter scanning state.
  markScanProgress(libraryId, 0, total);
  log.info("Library scan started", { library_name: entry.name, files_found: total });

  // Wrap each file task to emit a progress event after it completes.
  const taskFns = filePaths.map((filePath) => async () => {
    await processFile(filePath, libraryId);
    done += 1;
    markScanProgress(libraryId, done, total);
  });

  await runConcurrently(taskFns, SCAN_CONCURRENCY);

  return libraryRow;
}

/**
 * Parses a typical torrent filename to extract a human-readable title and
 * optional release year. Handles common patterns:
 *   Dune.Part.Two.2024.2160p.mkv  →  "Dune Part Two", 2024
 *   The.Shining.1980.1080p.mkv    →  "The Shining", 1980
 *   Parasite.Korean.2019.mkv      →  "Parasite", 2019
 */
export function parseTitleFromFilename(filename: string): {
  title: string;
  year: number | undefined;
} {
  // Strip extension
  const base = basename(filename, extname(filename));

  // Try to find a year (4-digit number between 1900 and 2099).
  // Handles: "Title (2024) 4K", "Title.2024.1080p", "Title 2024" (year at end).
  // Allows ( and ) as separators in addition to . _ - and whitespace.
  const yearMatch = base.match(/(?:[.\s_(-])((19|20)\d{2})(?:[.\s_)-]|$)/);
  let title: string;
  let year: number | undefined;

  if (yearMatch?.index !== undefined) {
    title = base.slice(0, yearMatch.index);
    year = parseInt(yearMatch[1], 10);
  } else {
    // No year — strip quality/codec tokens that follow a resolution pattern
    const resMatch = base.match(/[.\s_-]\d{3,4}[pP]/);
    title = resMatch?.index !== undefined ? base.slice(0, resMatch.index) : base;
    year = undefined;
  }

  // Replace separators with spaces and normalise
  return {
    title: title.replace(/[._]/g, " ").replace(/\s+/g, " ").trim(),
    year,
  };
}

/**
 * Attempts to auto-match all unmatched videos in a library against OMDb.
 * Only runs if OMDB_API_KEY is configured. Emits progress via scanStore.
 */
async function autoMatchLibrary(libraryId: string, libraryName: string): Promise<void> {
  if (!isOmdbConfigured()) return;

  const unmatchedIds = getUnmatchedVideoIds(libraryId);
  if (unmatchedIds.length === 0) return;

  log.info("Auto-matching unmatched videos", {
    library_name: libraryName,
    unmatched_count: unmatchedIds.length,
  });

  let done = 0;
  const total = unmatchedIds.length;

  const tasks = unmatchedIds.map((videoId) => async () => {
    const video = getVideoById(videoId);
    if (!video) return;

    const { title, year } = parseTitleFromFilename(video.filename);
    const result = await searchOmdb(title, year);

    if (result) {
      const metadata: VideoMetadataRow = {
        video_id: videoId,
        imdb_id: result.imdbId,
        title: result.title,
        year: result.year,
        genre: result.genre,
        director: result.director,
        cast_list: result.actors.length > 0 ? JSON.stringify(result.actors) : null,
        rating: result.imdbRating,
        plot: result.plot,
        poster_url: result.posterUrl,
        matched_at: new Date().toISOString(),
      };
      upsertVideoMetadata(metadata);
      log.info("Video matched", {
        filename: video.filename,
        matched_title: result.title,
        imdb_id: result.imdbId,
      });
    }

    done++;
    markScanProgress(libraryId, done, total);
  });

  await runConcurrently(tasks, SCAN_CONCURRENCY);
}

/**
 * Scans all configured media libraries. No-ops if a scan is already in progress.
 * Notifies scan subscribers (via scanStore) on start and completion so that
 * clients subscribed to libraryScanUpdated receive live status.
 */
export async function scanLibraries(): Promise<LibraryRow[]> {
  if (isScanRunning()) {
    log.info("Scan already in progress, skipping");
    return getAllLibraries();
  }

  // Mark started synchronously before any await — Node.js is single-threaded
  // so this is atomic with respect to concurrent callers (e.g. multiple
  // simultaneous library queries each triggering a background scan).
  markScanStarted();

  const scanSpan = scannerTracer.startSpan("library.scan");

  try {
    const existingLibraries = getAllLibraries();
    const entries: MediaLibraryEntry[] = existingLibraries.map((lib) => ({
      name: lib.name,
      path: lib.path,
      mediaType: lib.media_type,
      env: lib.env as "dev" | "prod" | "user",
      videoExtensions: (() => {
        try {
          return JSON.parse(lib.video_extensions) as string[];
        } catch {
          return DEFAULT_VIDEO_EXTENSIONS;
        }
      })(),
    }));

    scanSpan.setAttribute("library.count", entries.length);
    const results: LibraryRow[] = [];

    for (const entry of entries) {
      try {
        await access(entry.path);
      } catch {
        log.warn("Library path not accessible", { path: entry.path });
        scanSpan.addEvent("library_skipped", { path: entry.path });
        continue;
      }
      const row = await scanLibraryEntry(entry);
      results.push(row);
      scanSpan.addEvent("library_scanned", { library_name: entry.name });
      // Auto-match unmatched videos after each library is fully indexed
      await autoMatchLibrary(row.id, row.name);
    }

    scanSpan.addEvent("scan_complete", { library_count: results.length });
    return results;
  } finally {
    scanSpan.end();
    markScanEnded();
  }
}

export function getActiveLibraries(): LibraryRow[] {
  return getAllLibraries();
}
