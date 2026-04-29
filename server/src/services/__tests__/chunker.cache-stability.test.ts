/**
 * content_fingerprint cache stability across rename / re-add.
 *
 * Job cache key = sha1("v3|{content_fingerprint}|{resolution}|{start}|{end}").
 * The fingerprint is `{file_size}:{sha1-of-first-64KB}` — derived from the
 * file's bytes, NOT its path. So renaming `Movie (2020).mkv` to
 * `Movie.2020.mkv` (or moving it between libraries) must keep the same
 * jobId — otherwise every rename re-encodes the entire ladder, defeating
 * the cache.
 *
 * This test pins that contract: insert two distinct video rows pointing at
 * different paths but sharing one fingerprint; assert `startTranscodeJob`
 * resolves both to the same cached job without touching ffmpeg.
 *
 * Trace context: the inflight test exercised "same video, same chunk =>
 * cache hit". This one extends to "different video row, same fingerprint
 * => cache hit", which is the path-agnostic contract the Rust port has
 * to preserve.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "bun:test";

import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { insertJob } from "../../db/queries/jobs.js";
import { upsertLibrary } from "../../db/queries/libraries.js";
import { insertSegment } from "../../db/queries/segments.js";
import { upsertVideo } from "../../db/queries/videos.js";
import type { Resolution } from "../../types.js";
import { startTranscodeJob } from "../chunker.js";
import { killAllJobs } from "../ffmpegPool.js";

// Mirrors `chunker.ts::jobId` — must match exactly. Bump the version prefix
// here in lockstep with any production change.
function computeJobId(
  contentKey: string,
  resolution: Resolution,
  start: number,
  end: number
): string {
  return createHash("sha1").update(`v3|${contentKey}|${resolution}|${start}|${end}`).digest("hex");
}

function seedCompleteJob(
  videoId: string,
  contentFingerprint: string,
  resolution: Resolution,
  start: number,
  end: number
): string {
  const id = computeJobId(contentFingerprint, resolution, start, end);
  const segmentDir = join(config.segmentDir, id);
  mkdirSync(segmentDir, { recursive: true });
  // Empty file is enough — chunker's restore checks access(initPath), not size.
  writeFileSync(join(segmentDir, "init.mp4"), "");
  const segmentPath = join(segmentDir, "segment_0000.m4s");
  writeFileSync(segmentPath, "");
  const now = new Date().toISOString();
  insertJob({
    id,
    video_id: videoId,
    resolution,
    status: "complete",
    segment_dir: segmentDir,
    total_segments: 1,
    completed_segments: 1,
    start_time_seconds: start,
    end_time_seconds: end,
    created_at: now,
    updated_at: now,
    error: null,
  });
  insertSegment({
    job_id: id,
    segment_index: 0,
    path: segmentPath,
    duration_seconds: 2,
    size_bytes: 0,
  });
  return id;
}

describe("chunker — content_fingerprint cache stability across rename", () => {
  getDb();

  const LIBRARY_ID = "cache-stability-lib";
  const SHARED_FINGERPRINT = "1024:cachestability-shared-fp";
  const RESOLUTION: Resolution = "1080p";
  const START = 0;
  const END = 30;

  upsertLibrary({
    id: LIBRARY_ID,
    name: "Cache Stability Lib",
    path: "/tmp/cache-stability",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });

  // Two distinct video rows pointing at different paths, same fingerprint —
  // the canonical "user renamed the file and the scanner re-added it" shape.
  const VIDEO_A_ID = "cache-stability-video-A";
  const VIDEO_B_ID = "cache-stability-video-B";

  upsertVideo({
    id: VIDEO_A_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/cache-stability/Movie (2020).mkv",
    filename: "Movie (2020).mkv",
    title: "Movie",
    duration_seconds: 1800,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: SHARED_FINGERPRINT,
  });

  upsertVideo({
    id: VIDEO_B_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/cache-stability/Movie.2020.mkv",
    filename: "Movie.2020.mkv",
    title: "Movie",
    duration_seconds: 1800,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: SHARED_FINGERPRINT,
  });

  const expectedJobId = computeJobId(SHARED_FINGERPRINT, RESOLUTION, START, END);
  seedCompleteJob(VIDEO_A_ID, SHARED_FINGERPRINT, RESOLUTION, START, END);

  afterAll(async () => {
    // Defensive — the test should never spawn ffmpeg, but if a regression does
    // we want it killed before the suite moves on.
    await killAllJobs();
  });

  it("two video rows sharing one fingerprint resolve to the same jobId", async () => {
    const r1 = await startTranscodeJob(VIDEO_A_ID, RESOLUTION, START, END);
    expect(r1.kind).toBe("ok");
    if (r1.kind !== "ok") throw new Error(`unreachable: ${r1.code}`);
    expect(r1.job.id).toBe(expectedJobId);
    expect(r1.job.status).toBe("complete");

    const r2 = await startTranscodeJob(VIDEO_B_ID, RESOLUTION, START, END);
    expect(r2.kind).toBe("ok");
    if (r2.kind !== "ok") throw new Error(`unreachable: ${r2.code}`);
    expect(r2.job.id).toBe(expectedJobId);
    expect(r2.job.status).toBe("complete");

    // Same job id ⇒ same in-memory ActiveJob instance from jobStore.
    expect(r2.job.id).toBe(r1.job.id);
  });

  it("a different fingerprint produces a different jobId (negative control)", async () => {
    // Confirms the test above isn't accidentally hitting a global cache —
    // fingerprint really is the key.
    const VIDEO_C_ID = "cache-stability-video-C";
    const DIFFERENT_FINGERPRINT = "2048:cachestability-different-fp";
    upsertVideo({
      id: VIDEO_C_ID,
      library_id: LIBRARY_ID,
      path: "/tmp/cache-stability/Other.mkv",
      filename: "Other.mkv",
      title: "Other",
      duration_seconds: 1800,
      file_size_bytes: 0,
      bitrate: 0,
      scanned_at: new Date().toISOString(),
      content_fingerprint: DIFFERENT_FINGERPRINT,
    });

    const expectedDifferentId = computeJobId(DIFFERENT_FINGERPRINT, RESOLUTION, START, END);
    expect(expectedDifferentId).not.toBe(expectedJobId);

    // Pre-seed so the call doesn't try to spawn ffmpeg (which would fail on
    // the missing real movie file).
    seedCompleteJob(VIDEO_C_ID, DIFFERENT_FINGERPRINT, RESOLUTION, START, END);
    const r = await startTranscodeJob(VIDEO_C_ID, RESOLUTION, START, END);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error(`unreachable: ${r.code}`);
    expect(r.job.id).toBe(expectedDifferentId);
  });
});
