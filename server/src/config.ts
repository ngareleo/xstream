import { resolve } from "path";

import type { Resolution, ResolutionProfile } from "./types.js";

export interface TranscodeConfig {
  /** Maximum number of concurrently encoding ffmpeg jobs. Cap is enforced by
   *  ffmpegPool; jobs that have been killed (SIGTERM dispatched, exit pending)
   *  do not count toward this limit. */
  maxConcurrentJobs: number;
  /** SIGTERM grace period before escalating to SIGKILL on a per-job kill.
   *  Software 4 K encodes can hold a fragment buffer for tens of seconds
   *  after SIGTERM while flushing; this caps the dying-zombie window. */
  forceKillTimeoutMs: number;
  /** Total wait for live ffmpeg processes to exit during server shutdown.
   *  Greater than forceKillTimeoutMs so the per-job escalation has already
   *  SIGKILLed laggards by the time this fires. */
  shutdownTimeoutMs: number;
  /** If a transcode job has zero stream connections after this long, kill
   *  ffmpeg (covers prefetched chunks where the user seeks away before
   *  the stream connection opens). */
  orphanTimeoutMs: number;
  /** Wall-clock encode budget multiplier — actual budget = chunk_duration_s
   *  × this × 1_000 ms. Realistic worst case on this system is software
   *  libx264 at 1080p (~10 min for a 5-min chunk); 3× gives ~5 min headroom. */
  maxEncodeRateMultiplier: number;
  /** Hint sent back to the client orchestrator on a CAPACITY_EXHAUSTED
   *  rejection so it knows when to retry. Kept short — the cap typically
   *  clears as soon as the next chunk's notifySubscribers fires. */
  capacityRetryHintMs: number;
  /** Max time a concurrent caller polls jobStore waiting for a peer to
   *  finish initializing the same job before falling through. */
  inflightDedupTimeoutMs: number;
}

export interface StreamConfig {
  /** Idle window before /stream/:jobId assumes the connection is dead and
   *  kills the job. Must be larger than the widest back-pressure halt the
   *  client can induce (~60 s with forwardTargetS=60); 180 s leaves
   *  defensive margin for real network blips. */
  connectionIdleTimeoutMs: number;
}

export interface AppConfig {
  port: number;
  segmentDir: string;
  dbPath: string;
  /** Milliseconds between automatic library rescans. */
  scanIntervalMs: number;
  /** "auto" probes HW acceleration at startup and exits on failure; "off"
   *  forces software encode (benchmarking / hardware-less environments).
   *  Set via HW_ACCEL env var. */
  hardwareAcceleration: "auto" | "off";
  transcode: TranscodeConfig;
  stream: StreamConfig;
}

const root = resolve(import.meta.dir, "../..");

function readHwAccel(): "auto" | "off" {
  return process.env.HW_ACCEL === "off" ? "off" : "auto";
}

const transcodeDefaults: TranscodeConfig = {
  maxConcurrentJobs: 3,
  forceKillTimeoutMs: 2_000,
  shutdownTimeoutMs: 5_000,
  orphanTimeoutMs: 30_000,
  maxEncodeRateMultiplier: 3,
  capacityRetryHintMs: 1_000,
  inflightDedupTimeoutMs: 5_000,
};

const streamDefaults: StreamConfig = {
  connectionIdleTimeoutMs: 180_000,
};

const dev: AppConfig = {
  port: 3001,
  // Allow SEGMENT_DIR + DB_PATH overrides so integration tests can write to
  // a per-PID temp dir without colliding with the dev `tmp/segments`.
  segmentDir: process.env.SEGMENT_DIR ?? resolve(root, "tmp/segments"),
  dbPath: process.env.DB_PATH ?? resolve(root, "tmp/xstream.db"),
  scanIntervalMs: 30_000,
  hardwareAcceleration: readHwAccel(),
  transcode: transcodeDefaults,
  stream: streamDefaults,
};

const prod: AppConfig = {
  port: Number(process.env.PORT ?? 8080),
  segmentDir: process.env.SEGMENT_DIR ?? resolve(root, "tmp/segments"),
  dbPath: process.env.DB_PATH ?? resolve(root, "tmp/xstream.db"),
  scanIntervalMs: (() => {
    const raw = Number(process.env.SCAN_INTERVAL_MS ?? 30_000);
    return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
  })(),
  hardwareAcceleration: readHwAccel(),
  transcode: transcodeDefaults,
  stream: streamDefaults,
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
