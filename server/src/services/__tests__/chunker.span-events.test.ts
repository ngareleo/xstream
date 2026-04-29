/**
 * job.resolve single-event invariant + chunker span-event surface.
 *
 * Every entry into `startTranscodeJob` for a known video opens a single
 * `job.resolve` span. Before returning, the span MUST emit exactly one of
 * the well-known terminal events:
 *
 *   - `job_cache_hit`            — in-memory ActiveJob already running/complete
 *   - `job_inflight_resolved`    — concurrent call waited for our setJob
 *   - `concurrency_cap_reached`  — pool refused a new slot (CAPACITY_EXHAUSTED)
 *   - `job_restored_from_db`     — DB has a complete job + on-disk segments
 *   - `job_started`              — fresh job, ffmpeg spawned (or about to)
 *
 * The Rust port has to emit the same five (and only those five) so existing
 * Seq queries that filter by event keep working.
 *
 * VIDEO_NOT_FOUND is deliberately NOT in the list — that path returns before
 * the span opens, by design (no span overhead for a missing-row error). The
 * test below pins that contract by asserting no `job.resolve` span fires
 * when the video lookup fails.
 *
 * `transcode_silent_failure` (sec.9) needs a real ffmpeg run on a real fixture
 * to provoke the segment_count=0 clean exit (VAAPI HDR / past-EOF). Gated
 * behind XSTREAM_TEST_MEDIA_DIR — see the conditional describe at the bottom.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { insertJob } from "../../db/queries/jobs.js";
import { upsertLibrary } from "../../db/queries/libraries.js";
import { insertSegment } from "../../db/queries/segments.js";
import { upsertVideo } from "../../db/queries/videos.js";
import { drainCapturedSpans, resetCapturedSpans } from "../../test/traceCapture.js";
import type { Resolution } from "../../types.js";
import { startTranscodeJob } from "../chunker.js";
import { killAllJobs, snapshotCap, tryReserveSlot } from "../ffmpegPool.js";
import { detectHwAccel } from "../hwAccel.js";

const RESOLUTION: Resolution = "1080p";

function computeJobId(
  contentKey: string,
  resolution: Resolution,
  start: number,
  end: number
): string {
  return createHash("sha1").update(`v3|${contentKey}|${resolution}|${start}|${end}`).digest("hex");
}

function seedCompleteJobRow(
  videoId: string,
  jobIdToSeed: string,
  start: number,
  end: number
): void {
  const segmentDir = join(config.segmentDir, jobIdToSeed);
  mkdirSync(segmentDir, { recursive: true });
  writeFileSync(join(segmentDir, "init.mp4"), "");
  const segPath = join(segmentDir, "segment_0000.m4s");
  writeFileSync(segPath, "");
  const now = new Date().toISOString();
  insertJob({
    id: jobIdToSeed,
    video_id: videoId,
    resolution: RESOLUTION,
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
    job_id: jobIdToSeed,
    segment_index: 0,
    path: segPath,
    duration_seconds: 2,
    size_bytes: 0,
  });
}

const LIBRARY_ID = "spanevents-lib";
const VIDEO_ID = "spanevents-video";
const FINGERPRINT = "1024:spanevents-fp";

beforeAll(async () => {
  getDb();
  upsertLibrary({
    id: LIBRARY_ID,
    name: "Span Events Lib",
    path: "/tmp/spanevents",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });
  upsertVideo({
    id: VIDEO_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/spanevents/video.mkv",
    filename: "video.mkv",
    title: "Span Events Test",
    duration_seconds: 1800,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: FINGERPRINT,
  });
  // "off" mode caches { kind: "software" } without touching the binary;
  // sentinel path keeps the test green on CI runners without jellyfin-ffmpeg.
  await detectHwAccel("/dev/null/no-ffmpeg-needed-in-off-mode", "off");
});

afterAll(async () => {
  await killAllJobs();
});

const TERMINAL_EVENTS = [
  "job_cache_hit",
  "job_inflight_resolved",
  "concurrency_cap_reached",
  "job_restored_from_db",
  "job_started",
] as const;

function findResolveSpansForJob(jobId: string): ReturnType<typeof drainCapturedSpans> {
  return drainCapturedSpans().filter(
    (s) => s.name === "job.resolve" && s.attributes["job.id"] === jobId
  );
}

function terminalEventsOnSpan(span: ReturnType<typeof drainCapturedSpans>[number]): string[] {
  return span.events.filter((e) => TERMINAL_EVENTS.includes(e.name as never)).map((e) => e.name);
}

describe("job.resolve span — exactly one terminal event per call", () => {
  test("job_restored_from_db fires when the DB has a complete job + on-disk segments", async () => {
    const start = 1000;
    const end = 1030;
    const jobId = computeJobId(FINGERPRINT, RESOLUTION, start, end);
    seedCompleteJobRow(VIDEO_ID, jobId, start, end);

    resetCapturedSpans();
    const r = await startTranscodeJob(VIDEO_ID, RESOLUTION, start, end);
    expect(r.kind).toBe("ok");

    const spans = findResolveSpansForJob(jobId);
    expect(spans.length).toBe(1);
    expect(terminalEventsOnSpan(spans[0]!)).toEqual(["job_restored_from_db"]);
  });

  test("job_cache_hit fires when an in-memory ActiveJob already exists for the id", async () => {
    // Seed + first call → puts the restored job into jobStore. Second call
    // for the same id finds it via getJob() and emits job_cache_hit.
    const start = 2000;
    const end = 2030;
    const jobId = computeJobId(FINGERPRINT, RESOLUTION, start, end);
    seedCompleteJobRow(VIDEO_ID, jobId, start, end);

    const first = await startTranscodeJob(VIDEO_ID, RESOLUTION, start, end);
    expect(first.kind).toBe("ok");

    resetCapturedSpans();
    const second = await startTranscodeJob(VIDEO_ID, RESOLUTION, start, end);
    expect(second.kind).toBe("ok");

    const spans = findResolveSpansForJob(jobId);
    expect(spans.length).toBe(1);
    expect(terminalEventsOnSpan(spans[0]!)).toEqual(["job_cache_hit"]);
  });

  test("concurrency_cap_reached fires when the pool refuses a slot", async () => {
    // Take all 3 cap slots via raw reservations so no real ffmpeg work
    // happens. The next startTranscodeJob call gets refused.
    const limit = snapshotCap().limit;
    const reservations: Array<ReturnType<typeof tryReserveSlot>> = [];
    for (let i = 0; i < limit; i++) {
      const r = tryReserveSlot(`spanevents-cap-${i}`);
      reservations.push(r);
    }
    try {
      const start = 3000;
      const end = 3030;
      const jobId = computeJobId(FINGERPRINT, RESOLUTION, start, end);

      resetCapturedSpans();
      const r = await startTranscodeJob(VIDEO_ID, RESOLUTION, start, end);
      expect(r.kind).toBe("error");
      if (r.kind !== "error") return;
      expect(r.code).toBe("CAPACITY_EXHAUSTED");

      const spans = findResolveSpansForJob(jobId);
      expect(spans.length).toBe(1);
      expect(terminalEventsOnSpan(spans[0]!)).toEqual(["concurrency_cap_reached"]);
    } finally {
      for (const r of reservations) r?.release();
    }
  });

  test("VIDEO_NOT_FOUND does NOT open a job.resolve span", async () => {
    resetCapturedSpans();
    const r = await startTranscodeJob("does-not-exist-video", RESOLUTION, 0, 30);
    expect(r.kind).toBe("error");
    if (r.kind !== "error") return;
    expect(r.code).toBe("VIDEO_NOT_FOUND");

    const resolveSpans = drainCapturedSpans().filter((s) => s.name === "job.resolve");
    expect(resolveSpans.length).toBe(0);
  });
});

// ── transcode_silent_failure — gated on real ffmpeg + media fixtures ─────────
//
// Provoking the VAAPI HDR / past-EOF segment_count=0 clean-exit needs a real
// movie file the chunker can probe successfully. Skip when no fixtures.
//
// (Implementation deferred to a follow-up that uses encodeHarness + a fixture
// past EOF — same shape as chunker.encode.test.ts but asserting the silent-
// failure event explicitly.)
const HAVE_MEDIA_FIXTURES = !!process.env.XSTREAM_TEST_MEDIA_DIR;
describe.skipIf(!HAVE_MEDIA_FIXTURES)("transcode_silent_failure event (real ffmpeg)", () => {
  // TODO(real-fixture): request a chunk past EOF on a real fixture, drain
  // spans, assert transcode_silent_failure event present + span status
  // ERROR. bun-types' test.todo signature requires a function in this
  // version, so the placeholder lives here as a comment until the real
  // assertion lands alongside an XSTREAM_TEST_MEDIA_DIR fixture.
  test.skip("transcode_silent_failure on a chunk past EOF — see TODO above", () => {
    /* placeholder */
  });
});
