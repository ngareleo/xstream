import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createHash } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { createReadStream } from "fs";
import { access, readdir, stat } from "fs/promises";
import { basename, extname, join } from "path";

import { loadMediaConfig } from "../config.js";
import { getAllLibraries, upsertLibrary } from "../db/queries/libraries.js";
import { replaceVideoStreams, upsertVideo } from "../db/queries/videos.js";
import type { LibraryRow, MediaLibraryEntry, VideoRow, VideoStreamRow } from "../types.js";
import { DEFAULT_VIDEO_EXTENSIONS } from "../types.js";
import { isScanRunning, markScanEnded, markScanStarted } from "./scanStore.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

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
    console.warn(`[scanner] Cannot read directory: ${dir}`);
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

    console.log(`[scanner] Indexed: ${basename(filePath)}`);
  } catch (err) {
    console.warn(`[scanner] Failed to probe ${filePath}:`, (err as Error).message);
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
  };
  upsertLibrary(libraryRow);

  const extensions = new Set(
    (entry.videoExtensions ?? DEFAULT_VIDEO_EXTENSIONS).map((e) => e.toLowerCase())
  );

  // Collect all file paths first, then process with bounded concurrency.
  // probeVideo + computeContentFingerprint run concurrently within each task;
  // at most SCAN_CONCURRENCY tasks run simultaneously to avoid exhausting
  // file descriptors and CPU on large libraries.
  const taskFns: (() => Promise<void>)[] = [];
  for await (const filePath of walkDirectory(entry.path, extensions)) {
    taskFns.push(() => processFile(filePath, libraryId));
  }

  console.log(`[scanner] Found ${taskFns.length} video(s) in "${entry.name}"`);
  await runConcurrently(taskFns, SCAN_CONCURRENCY);

  return libraryRow;
}

/**
 * Scans all configured media libraries. No-ops if a scan is already in progress.
 * Notifies scan subscribers (via scanStore) on start and completion so that
 * clients subscribed to libraryScanUpdated receive live status.
 */
export async function scanLibraries(): Promise<LibraryRow[]> {
  if (isScanRunning()) {
    console.log("[scanner] Scan already in progress, skipping");
    return getAllLibraries();
  }

  // Mark started synchronously before any await — Node.js is single-threaded
  // so this is atomic with respect to concurrent callers (e.g. multiple
  // simultaneous library queries each triggering a background scan).
  markScanStarted();

  try {
    const entries = loadMediaConfig();
    const results: LibraryRow[] = [];

    for (const entry of entries) {
      try {
        await access(entry.path);
      } catch {
        console.warn(`[scanner] Path not accessible, skipping: ${entry.path}`);
        continue;
      }
      const row = await scanLibraryEntry(entry);
      results.push(row);
    }

    return results;
  } finally {
    markScanEnded();
  }
}

export function getActiveLibraries(): LibraryRow[] {
  return getAllLibraries();
}
