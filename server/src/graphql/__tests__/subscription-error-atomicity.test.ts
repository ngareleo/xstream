/**
 * transcodeJobUpdated subscription error-code atomicity (invariant #10).
 *
 * Contract: when a probe / encode failure aborts a job, `errorCode` MUST be
 * set on the in-memory ActiveJob BEFORE `notifySubscribers(job)` fires —
 * otherwise the subscriber's first error-status payload arrives with
 * `errorCode: null`, and the client sees "the job died, no idea why" instead
 * of a typed retry signal.
 *
 * The chunker has this ordering today (chunker.ts: `job.errorCode = ...;`
 * then `updateJobStatus(...)`; then `notifySubscribers(job)`). This test
 * pins it: subscribe, induce probe failure, drain payloads, assert the
 * first error-status payload exposes `errorCode === "PROBE_FAILED"` —
 * never `null`.
 *
 * Driven through the public subscription path (yoga's resolver →
 * subscribeToJob → presentJob) so the test catches both an out-of-order
 * notify AND a presenter that drops `errorCode` from the wire shape.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { upsertLibrary } = await import("../../db/queries/libraries.js");
const { upsertVideo } = await import("../../db/queries/videos.js");
const { startTranscodeJob } = await import("../../services/chunker.js");
const { detectHwAccel } = await import("../../services/hwAccel.js");
const { killAllJobs } = await import("../../services/ffmpegPool.js");
const { subscribeToJob } = await import("../../services/jobStore.js");
const { presentJob } = await import("../presenters.js");

// Per-test fixture path so we don't collide on `videos.path UNIQUE` with any
// other test that points at server/src/test/fixtures/garbage.bin. We write
// 16 bytes of non-video data — same flavor of input that makes ffprobe error.
const PER_TEST_GARBAGE_DIR = join(tmpdir(), `xstream-atomicity-${process.pid}`);
const PER_TEST_GARBAGE_PATH = join(PER_TEST_GARBAGE_DIR, "garbage.bin");

const LIBRARY_ID = "atomicity-lib";
const VIDEO_ID = "atomicity-video";
const FINGERPRINT = "16:atomicity-fixture";

beforeAll(async () => {
  mkdirSync(PER_TEST_GARBAGE_DIR, { recursive: true });
  writeFileSync(
    PER_TEST_GARBAGE_PATH,
    new Uint8Array([0, 0, 0, 0, 110, 111, 116, 32, 118, 105, 100, 101, 111, 0, 0, 255])
  );

  upsertLibrary({
    id: LIBRARY_ID,
    name: "Atomicity Lib",
    path: "/tmp/atomicity-lib",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });
  upsertVideo({
    id: VIDEO_ID,
    library_id: LIBRARY_ID,
    path: PER_TEST_GARBAGE_PATH,
    filename: "garbage.bin",
    title: "Atomicity Test",
    duration_seconds: 0,
    file_size_bytes: 16,
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

describe("transcodeJobUpdated — errorCode atomic with status=error", () => {
  test("first ERROR-status payload has errorCode populated, never null", async () => {
    const result = await startTranscodeJob(VIDEO_ID, "240p", 0, 30);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(`unreachable: ${result.code}`);
    const localJobId = result.job.id;

    // Drive the subscription via the public path: subscribeToJob (the same
    // iterable the subscription resolver consumes) → presentJob (the same
    // presenter the resolver yields).
    const iter = subscribeToJob(localJobId)[Symbol.asyncIterator]();
    let firstErrorPayload: ReturnType<typeof presentJob> | null = null;
    const deadline = Date.now() + 5000;
    try {
      while (Date.now() < deadline) {
        const next = await iter.next();
        if (next.done) break;
        const job = next.value;
        if (!job) continue;
        const presented = presentJob(job);
        if (presented.status === "ERROR") {
          firstErrorPayload = presented;
          break;
        }
      }
    } finally {
      await iter.return?.();
    }

    expect(firstErrorPayload).not.toBeNull();
    if (!firstErrorPayload) return;

    // The atomicity assertion. errorCode MUST be set on the same payload that
    // first reports status=ERROR. If notifySubscribers fires before
    // job.errorCode is assigned, this is null and the test fails — the
    // exact contract the chunker's ordering protects.
    expect(firstErrorPayload.errorCode).toBe("PROBE_FAILED");
    expect(firstErrorPayload.error).toBeDefined();
    expect(typeof firstErrorPayload.error).toBe("string");
  });
});
