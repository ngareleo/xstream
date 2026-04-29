/**
 * stream.request telemetry contract — full per-branch event surface.
 *
 * Locks down the EXHAUSTIVE list of events the `stream.request` span emits
 * for each terminal branch, plus the attribute keys on each event. The Rust
 * port has to reproduce this surface so existing Seq queries that filter by
 * event name + read attribute keys keep working.
 *
 * Branches covered here:
 *  - 404 Job not found            : `job_not_found` (no body)
 *  - 500 Job in error state       : `job_errored` (no body)
 *  - Happy-path completion        : stream_started → init_wait_complete →
 *                                   init_sent → stream_complete
 *
 * The kill-path branches (idle / disconnect / init-timeout / multi-conn)
 * are already pinned with attribute-key checks in stream.kill-paths.test.ts.
 *
 * Asserts via spanAssertions helper — never log strings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { insertJob, updateJobStatus } from "../../db/queries/jobs.js";
import { upsertLibrary } from "../../db/queries/libraries.js";
import { insertSegment } from "../../db/queries/segments.js";
import { upsertVideo } from "../../db/queries/videos.js";
import { removeJob, setJob } from "../../services/jobStore.js";
import {
  expectEvent,
  expectEventsInOrder,
  expectSpanAttrs,
  findSpan,
} from "../../test/spanAssertions.js";
import { resetCapturedSpans } from "../../test/traceCapture.js";
import type { ActiveJob, Resolution } from "../../types.js";
import { handleStream } from "../stream.js";

const LIBRARY_ID = "telemetry-lib";
const VIDEO_ID = "telemetry-video";
const RESOLUTION: Resolution = "1080p";

function seedRunningJob(
  jobId: string,
  segmentCount: number,
  status: "running" | "complete" = "complete"
): ActiveJob {
  const segmentDir = join(config.segmentDir, jobId);
  mkdirSync(segmentDir, { recursive: true });
  const initSegmentPath = join(segmentDir, "init.mp4");
  writeFileSync(initSegmentPath, new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]));

  const segmentPaths: string[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const segPath = join(segmentDir, `segment_${String(i).padStart(4, "0")}.m4s`);
    writeFileSync(
      segPath,
      new Uint8Array([0, 0, 0, 0x10, 0x6d, 0x6f, 0x6f, 0x66, i, 0, 0, 0, 0, 0, 0, 0])
    );
    segmentPaths[i] = segPath;
  }
  const now = new Date().toISOString();
  insertJob({
    id: jobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status,
    segment_dir: segmentDir,
    total_segments: segmentCount,
    completed_segments: segmentCount,
    start_time_seconds: 0,
    end_time_seconds: segmentCount * 2,
    created_at: now,
    updated_at: now,
    error: null,
  });
  for (let i = 0; i < segmentCount; i++) {
    insertSegment({
      job_id: jobId,
      segment_index: i,
      path: segmentPaths[i] ?? "",
      duration_seconds: 2,
      size_bytes: 16,
    });
  }
  const activeJob: ActiveJob = {
    id: jobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status,
    segment_dir: segmentDir,
    total_segments: segmentCount,
    completed_segments: segmentCount,
    start_time_seconds: 0,
    end_time_seconds: segmentCount * 2,
    created_at: now,
    updated_at: now,
    error: null,
    segments: segmentPaths,
    initSegmentPath,
    subscribers: new Set(),
    connections: 0,
    errorCode: null,
  };
  setJob(activeJob);
  return activeJob;
}

beforeAll(() => {
  getDb();
  upsertLibrary({
    id: LIBRARY_ID,
    name: "Telemetry Lib",
    path: "/tmp/telemetry-lib",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });
  upsertVideo({
    id: VIDEO_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/telemetry-lib/video.mkv",
    filename: "video.mkv",
    title: "Telemetry Test",
    duration_seconds: 1800,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: "telemetry-fp",
  });
});

afterAll(() => {
  for (const id of ["telemetry-happy", "telemetry-errored"]) removeJob(id);
});

beforeEach(() => {
  resetCapturedSpans();
});

async function drainBody(body: ReadableStream<Uint8Array>, budgetMs = 5_000): Promise<void> {
  const reader = body.getReader();
  const deadline = Date.now() + budgetMs;
  try {
    while (Date.now() < deadline) {
      const { done } = await reader.read().catch(() => ({ done: true }) as { done: true });
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

describe("stream.request span — exhaustive event + attribute contract", () => {
  test("404 job_not_found: span emits job_not_found terminal event, span attribute job.id present", async () => {
    const res = handleStream(new Request("http://localhost/stream/no-such-job"));
    expect(res.status).toBe(404);
    if (res.body) await drainBody(res.body, 100);

    const span = findSpan("stream.request");
    expectSpanAttrs(span, ["job.id"]);
    expectEvent(span, "job_not_found");
    // No stream_started event for the 404 path — handler short-circuits before
    // creating the ReadableStream.
    expect(span.events.find((e) => e.name === "stream_started")).toBeUndefined();
  });

  test("500 job_errored: span emits job_errored when DB job is in error state", async () => {
    const jobId = "telemetry-errored";
    seedRunningJob(jobId, 0, "complete");
    updateJobStatus(jobId, "error", { error: "synthetic-error-for-telemetry-test" });
    // The handler reads from getJobById; we removed the in-memory active job so
    // the path goes through the DB.
    removeJob(jobId);

    const res = handleStream(new Request(`http://localhost/stream/${jobId}`));
    expect(res.status).toBe(500);
    if (res.body) await drainBody(res.body, 100);

    const span = findSpan("stream.request");
    expectSpanAttrs(span, ["job.id"]);
    expectEvent(span, "job_errored");
    expect(span.events.find((e) => e.name === "stream_started")).toBeUndefined();
  });

  test("happy-path completion: stream_started → init_wait_complete → init_sent → stream_complete in order", async () => {
    const jobId = "telemetry-happy";
    seedRunningJob(jobId, 1, "complete");

    const res = handleStream(new Request(`http://localhost/stream/${jobId}`));
    expect(res.status).toBe(200);
    if (!res.body) throw new Error("no body");
    await drainBody(res.body, 5_000);

    const span = findSpan("stream.request");
    expectSpanAttrs(span, ["job.id"]);

    expectEventsInOrder(span, [
      { name: "stream_started" },
      { name: "init_wait_complete", attrs: ["init_wait_ms", "attempts", "has_init"] },
      { name: "init_sent", attrs: ["bytes"] },
      {
        name: "stream_complete",
        attrs: ["segments_sent", "total_bytes_sent", "duration_ms", "transfer_rate_kbps"],
      },
    ]);
  });
});
