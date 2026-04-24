/**
 * Test harness for the chunker encode pipeline.
 *
 * Centralises:
 *  - Resolving fixture paths from $XSTREAM_TEST_MEDIA_DIR (returns null when
 *    unset so the caller can skip the entire suite cleanly).
 *  - Wiring fluent-ffmpeg to the pinned binary and probing HW accel via the
 *    production code path. The HW-accel probe mode is gated by a pre-flight
 *    check (Linux + /dev/dri/renderD128 exists) so we don't trip the
 *    detectHwAccel `process.exit(1)` on hosts without a usable GPU.
 *  - Defeating the chunker's 30 s orphan-no-connection kill so a real test
 *    has time to finish encoding before the safety SIGTERMs the ffmpeg job.
 *  - Capturing OTel spans into an in-memory exporter so tests can assert on
 *    span attributes / events (e.g. "no `transcode_fallback_to_software`
 *    event for 4K").
 *  - Concatenating init.mp4 + segment_0000.m4s and ffprobing the first PTS
 *    to verify the chunkStartSeconds offset contract.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { upsertLibrary } from "../db/queries/libraries.js";
import { upsertVideo } from "../db/queries/videos.js";
import { startTranscodeJob } from "../services/chunker.js";
import { resolveFfmpegPaths } from "../services/ffmpegPath.js";
import { detectHwAccel, type HwAccelConfig } from "../services/hwAccel.js";
import { getJob } from "../services/jobStore.js";
import type { ActiveJob, Resolution } from "../types.js";
import { ALL_FIXTURES, type MediaFixture } from "./fixtures/media.js";

// ── Fixture resolution ──────────────────────────────────────────────────────

export interface ResolvedFixture {
  spec: MediaFixture;
  absolutePath: string;
  contentFingerprint: string;
  videoId: string;
}

const TEST_LIBRARY_ID = "encode-test-lib";

/**
 * Returns resolved fixtures for files that exist on disk, or null when
 * $XSTREAM_TEST_MEDIA_DIR is unset (the caller skips the whole suite).
 *
 * Side effect: upserts a library + one video row per resolved fixture into
 * the (per-PID test) database, so `startTranscodeJob` can look the videos up.
 */
export function resolveFixturesOrSkip(): ResolvedFixture[] | null {
  const dir = process.env.XSTREAM_TEST_MEDIA_DIR;
  if (!dir) return null;
  if (!existsSync(dir)) return null;

  upsertLibrary({
    id: TEST_LIBRARY_ID,
    name: "Encode Test Library",
    path: dir,
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });

  const resolved: ResolvedFixture[] = [];
  for (const spec of ALL_FIXTURES) {
    const absolutePath = resolve(dir, spec.filename);
    if (!existsSync(absolutePath)) continue;
    const fingerprint = computeFingerprint(absolutePath);
    const videoId = `encode-test-${createHash("sha1").update(absolutePath).digest("hex").slice(0, 16)}`;
    upsertVideo({
      id: videoId,
      library_id: TEST_LIBRARY_ID,
      path: absolutePath,
      filename: spec.filename,
      title: spec.filename,
      duration_seconds: 0, // not used by the chunker code path under test
      file_size_bytes: statSync(absolutePath).size,
      bitrate: 0,
      scanned_at: new Date().toISOString(),
      content_fingerprint: fingerprint,
    });
    resolved.push({ spec, absolutePath, contentFingerprint: fingerprint, videoId });
  }
  return resolved;
}

/** `${size}:${sha1-of-first-64KB}` — matches the production library scanner.
 *  Uses an open/read pair so we never load multi-GB movie files into memory. */
function computeFingerprint(path: string): string {
  const size = statSync(path).size;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(65536);
    const bytesRead = readSync(fd, buf, 0, buf.length, 0);
    const sha1 = createHash("sha1").update(buf.subarray(0, bytesRead)).digest("hex");
    return `${size}:${sha1}`;
  } finally {
    closeSync(fd);
  }
}

// ── HW accel + ffmpeg wiring ─────────────────────────────────────────────────

let hwConfig: HwAccelConfig | null = null;

/**
 * Wires fluent-ffmpeg to the pinned binary and runs the production HW probe.
 *
 * Pre-flight: only ask for `auto` when a probe is reasonable (Linux + the
 * VAAPI device file exists). On any other host we pass `off` so detectHwAccel
 * returns `{ kind: "software" }` instead of calling process.exit(1) — that
 * uncatchable exit would kill the test runner.
 *
 * The returned config's `kind` is the production GPU discriminant — the test
 * gates the 4K-no-fallback assertion on `kind !== "software"`.
 */
export async function setupChunkerForTest(): Promise<HwAccelConfig> {
  if (hwConfig) return hwConfig;
  const ffmpegPaths = resolveFfmpegPaths();
  const probeReasonable = process.platform === "linux" && existsSync("/dev/dri/renderD128");
  const mode: "auto" | "off" = probeReasonable ? "auto" : "off";
  hwConfig = await detectHwAccel(ffmpegPaths.ffmpeg, mode);
  return hwConfig;
}

/** True only when the production probe selected a hardware backend. */
export function hasHardwareEncode(): boolean {
  if (!hwConfig) {
    throw new Error("hasHardwareEncode() called before setupChunkerForTest()");
  }
  return hwConfig.kind !== "software";
}

// ── Job orchestration ───────────────────────────────────────────────────────

/**
 * Starts a transcode job and immediately bumps `connections` so the
 * 30 s orphan-no-connection safety doesn't SIGTERM the encode mid-test.
 */
export async function runChunk(
  fixture: ResolvedFixture,
  resolution: Resolution,
  startS: number,
  endS: number
): Promise<ActiveJob> {
  const result = await startTranscodeJob(fixture.videoId, resolution, startS, endS);
  if (result.kind === "error") {
    throw new Error(`startTranscodeJob failed: [${result.code}] ${result.message}`);
  }
  result.job.connections += 1;
  return result.job;
}

/**
 * Polls until `getJob(id).status` becomes `complete` (success) or `error`
 * (rejects with the captured error message). Also fails on timeout.
 */
export async function waitForCompletion(job: ActiveJob, budgetMs: number): Promise<ActiveJob> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const current = getJob(job.id);
    if (!current) {
      throw new Error(`Job ${job.id} disappeared from store`);
    }
    if (current.status === "complete") return current;
    if (current.status === "error") {
      throw new Error(`Job ${job.id} failed: ${current.error ?? "(no error message)"}`);
    }
    await Bun.sleep(200);
  }
  throw new Error(
    `Job ${job.id} did not complete within ${budgetMs}ms (last status: ${getJob(job.id)?.status ?? "missing"})`
  );
}

// ── PTS verification ─────────────────────────────────────────────────────────

/**
 * Returns the first packet's pts_time (in seconds) for a job's first segment,
 * by concatenating init.mp4 + segment_0000.m4s into a temp file and ffprobing.
 * Used to assert the chunkStartSeconds offset contract.
 */
export async function firstPacketPts(job: ActiveJob): Promise<number> {
  const { ffmpeg, ffprobe } = resolveFfmpegPaths();
  void ffmpeg; // ffprobe is the only one we need here

  const segmentDir = process.env.SEGMENT_DIR;
  if (!segmentDir) throw new Error("SEGMENT_DIR not set — test preload must run first");
  const jobDir = join(segmentDir, job.id);
  const initPath = join(jobDir, "init.mp4");
  const seg0Path = join(jobDir, "segment_0000.m4s");
  if (!existsSync(initPath) || !existsSync(seg0Path)) {
    throw new Error(`Expected init.mp4 + segment_0000.m4s in ${jobDir}`);
  }

  const tmp = mkdtempSync(join(tmpdir(), "xstream-pts-"));
  try {
    const concat = join(tmp, "concat.mp4");
    const initBytes = readFileSync(initPath);
    const segBytes = readFileSync(seg0Path);
    const buf = new Uint8Array(initBytes.length + segBytes.length);
    buf.set(initBytes, 0);
    buf.set(segBytes, initBytes.length);
    writeFileSync(concat, buf);

    const result = spawnSync(
      ffprobe,
      ["-v", "error", "-show_entries", "packet=pts_time", "-of", "csv=p=0", concat],
      { encoding: "utf8", timeout: 10_000 }
    );
    if (result.status !== 0) {
      throw new Error(`ffprobe failed: ${result.stderr ?? ""}`);
    }
    const firstLine = (result.stdout ?? "").split("\n").find((l) => l.trim().length > 0);
    if (!firstLine) throw new Error("ffprobe returned no PTS rows");
    const value = parseFloat(firstLine.trim());
    if (!Number.isFinite(value)) throw new Error(`Unparseable pts_time: ${firstLine}`);
    return value;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Misc helpers ─────────────────────────────────────────────────────────────

/** Helper for tests that want to copy/inspect the segments dir of a finished job. */
export function copyJobSegments(job: ActiveJob, dest: string): void {
  const segmentDir = process.env.SEGMENT_DIR;
  if (!segmentDir) throw new Error("SEGMENT_DIR not set — test preload must run first");
  const src = join(segmentDir, job.id);
  mkdirSync(dest, { recursive: true });
  for (const name of ["init.mp4", "segment_0000.m4s"]) {
    const from = join(src, name);
    if (existsSync(from)) copyFileSync(from, join(dest, name));
  }
}
