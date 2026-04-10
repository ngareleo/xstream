import { createHash } from "crypto";
import { readdir, stat, access } from "fs/promises";
import { join, basename, extname } from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { upsertLibrary, getAllLibraries } from "../db/queries/libraries.js";
import { upsertVideo, replaceVideoStreams } from "../db/queries/videos.js";
import { loadMediaConfig } from "../config.js";
import type { LibraryRow, VideoRow, VideoStreamRow, MediaLibraryEntry } from "../types.js";
import { DEFAULT_VIDEO_EXTENSIONS } from "../types.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function deriveTitle(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function probeVideo(filePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

async function walkDirectory(dir: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    console.warn(`[scanner] Cannot read directory: ${dir}`);
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkDirectory(fullPath, extensions);
      results.push(...nested);
    } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
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
  const filePaths = await walkDirectory(entry.path, extensions);
  console.log(`[scanner] Found ${filePaths.length} video(s) in "${entry.name}"`);

  for (const filePath of filePaths) {
    try {
      const fileStat = await stat(filePath);
      const probe = await probeVideo(filePath);
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

  return libraryRow;
}

function evalFraction(fraction: string): number {
  const [num, den] = fraction.split("/").map(Number);
  return den ? num / den : num;
}

export async function scanLibraries(): Promise<LibraryRow[]> {
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
}

export function getActiveLibraries(): LibraryRow[] {
  return getAllLibraries();
}
