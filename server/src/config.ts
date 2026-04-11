import { readFileSync } from "fs";
import { resolve } from "path";

import type {
  MediaFilesConfig,
  MediaLibraryEntry,
  Resolution,
  ResolutionProfile,
} from "./types.js";

export interface AppConfig {
  port: number;
  segmentDir: string;
  dbPath: string;
  mediaConfigPath: string;
  /** Milliseconds between automatic library rescans. */
  scanIntervalMs: number;
}

const root = resolve(import.meta.dir, "../..");

const dev: AppConfig = {
  port: 3001,
  segmentDir: resolve(root, "tmp/segments"),
  // Allow DB_PATH override so integration tests can use a temp database
  dbPath: process.env.DB_PATH ?? resolve(root, "tmp/tvke.db"),
  mediaConfigPath: resolve(root, "mediaFiles.json"),
  scanIntervalMs: 30_000,
};

const prod: AppConfig = {
  port: Number(process.env.PORT ?? 8080),
  segmentDir: process.env.SEGMENT_DIR ?? resolve(root, "tmp/segments"),
  dbPath: process.env.DB_PATH ?? resolve(root, "tmp/tvke.db"),
  mediaConfigPath: resolve(root, "mediaFiles.json"),
  scanIntervalMs: (() => {
    const raw = Number(process.env.SCAN_INTERVAL_MS ?? 30_000);
    return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
  })(),
};

export const config: AppConfig = process.env.NODE_ENV === "production" ? prod : dev;

export const RESOLUTION_PROFILES: Record<Resolution, ResolutionProfile> = {
  "240p": {
    label: "240p",
    width: 426,
    height: 240,
    videoBitrate: "300k",
    audioBitrate: "96k",
    h264Level: "3.0",
    segmentDuration: 2,
  },
  "360p": {
    label: "360p",
    width: 640,
    height: 360,
    videoBitrate: "800k",
    audioBitrate: "128k",
    h264Level: "3.0",
    segmentDuration: 2,
  },
  "480p": {
    label: "480p",
    width: 854,
    height: 480,
    videoBitrate: "1500k",
    audioBitrate: "128k",
    h264Level: "3.0",
    segmentDuration: 2,
  },
  "720p": {
    label: "720p",
    width: 1280,
    height: 720,
    videoBitrate: "2500k",
    audioBitrate: "192k",
    h264Level: "3.1",
    segmentDuration: 2,
  },
  "1080p": {
    label: "1080p",
    width: 1920,
    height: 1080,
    videoBitrate: "4000k",
    audioBitrate: "192k",
    h264Level: "4.0",
    segmentDuration: 2,
  },
  "4k": {
    label: "4k",
    width: 3840,
    height: 2160,
    videoBitrate: "15000k",
    audioBitrate: "192k",
    h264Level: "5.1",
    segmentDuration: 2,
  },
};

export function loadMediaConfig(): MediaLibraryEntry[] {
  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
  let raw: MediaFilesConfig;

  try {
    raw = JSON.parse(readFileSync(config.mediaConfigPath, "utf8")) as MediaFilesConfig;
  } catch {
    console.error(`[config] Failed to read mediaFiles.json at ${config.mediaConfigPath}`);
    return [];
  }

  const seen = new Set<string>();
  const active: MediaLibraryEntry[] = [];

  for (const entry of raw.libraries) {
    if (entry.env !== env) continue;
    if (seen.has(entry.path)) {
      console.warn(`[config] Duplicate path skipped: ${entry.path}`);
      continue;
    }
    seen.add(entry.path);
    active.push(entry);
  }

  return active;
}
