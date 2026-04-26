/**
 * End-to-end verification of the pull-based streaming endpoint.
 *
 * The refactor from `new ReadableStream({ start })` to `new ReadableStream({ pull })`
 * is invariant-preserving — the wire contract (length-prefixed binary frames,
 * init segment first, media segments in index order) is unchanged. This test
 * pre-seeds a fully-restored job on disk + in jobStore and consumes the
 * response body to confirm the framing still round-trips, and that the
 * demand-driven path reaches every segment.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "bun:test";

import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { insertJob } from "../../db/queries/jobs.js";
import { upsertLibrary } from "../../db/queries/libraries.js";
import { insertSegment } from "../../db/queries/segments.js";
import { upsertVideo } from "../../db/queries/videos.js";
import { setJob } from "../../services/jobStore.js";
import type { ActiveJob, Resolution } from "../../types.js";
import { handleStream } from "../stream.js";

const LIBRARY_ID = "pull-test-lib";
const VIDEO_ID = "pull-test-video";
const CONTENT_FINGERPRINT = "pull-test-fingerprint";
const RESOLUTION: Resolution = "1080p";

function computeJobId(
  contentKey: string,
  resolution: Resolution,
  start: number,
  end: number
): string {
  return createHash("sha1").update(`${contentKey}|${resolution}|${start}|${end}`).digest("hex");
}

/** Seeds a restored-from-DB job with N fake segments on disk + matching
 *  jobStore entry so `handleStream` resolves paths immediately without
 *  waiting for an encoder. */
function seedRestoredJob(segmentCount: number): {
  jobId: string;
  initBytes: Uint8Array;
  segBytes: Uint8Array[];
} {
  const start = 0;
  const end = segmentCount * 2;
  const jobId = computeJobId(CONTENT_FINGERPRINT, RESOLUTION, start, end);
  const segmentDir = join(config.segmentDir, `pull-test-${jobId}`);
  mkdirSync(segmentDir, { recursive: true });

  const initBytes = new Uint8Array(Array.from({ length: 64 }, (_, i) => i));
  const initPath = join(segmentDir, "init.mp4");
  writeFileSync(initPath, initBytes);

  const now = new Date().toISOString();
  // insertJob must run BEFORE insertSegment — segments rows have a FK on job_id.
  insertJob({
    id: jobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status: "complete",
    segment_dir: segmentDir,
    total_segments: segmentCount,
    completed_segments: segmentCount,
    start_time_seconds: start,
    end_time_seconds: end,
    created_at: now,
    updated_at: now,
    error: null,
  });

  const segBytes: Uint8Array[] = [];
  const segments: string[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const bytes = new Uint8Array(Array.from({ length: 32 }, (_, b) => (b + i) & 0xff));
    segBytes.push(bytes);
    const segPath = join(segmentDir, `segment_${String(i).padStart(4, "0")}.m4s`);
    writeFileSync(segPath, bytes);
    segments[i] = segPath;
    insertSegment({
      job_id: jobId,
      segment_index: i,
      path: segPath,
      duration_seconds: 2,
      size_bytes: bytes.byteLength,
    });
  }

  const activeJob: ActiveJob = {
    id: jobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status: "complete",
    segment_dir: segmentDir,
    total_segments: segmentCount,
    completed_segments: segmentCount,
    start_time_seconds: start,
    end_time_seconds: end,
    created_at: now,
    updated_at: now,
    error: null,
    errorCode: null,
    segments,
    initSegmentPath: initPath,
    subscribers: new Set(),
    connections: 0,
  };
  setJob(activeJob);
  return { jobId, initBytes, segBytes };
}

/** Parses length-prefixed frames from the response body. Returns the list of
 *  payload byte-arrays in order (init first, then media). Drains the stream
 *  fully before returning. */
async function drainFrames(body: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = body.getReader();
  let buf = new Uint8Array(0);
  const frames: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const merged = new Uint8Array(buf.length + value.length);
    merged.set(buf, 0);
    merged.set(value, buf.length);
    buf = merged;
    while (buf.length >= 4) {
      const view = new DataView(buf.buffer, buf.byteOffset);
      const len = view.getUint32(0, false);
      if (buf.length < 4 + len) break;
      frames.push(buf.slice(4, 4 + len));
      buf = buf.slice(4 + len);
    }
  }
  return frames;
}

beforeAll(() => {
  getDb();
  upsertLibrary({
    id: LIBRARY_ID,
    name: "Pull Test Library",
    path: "/tmp/pull-test",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });
  upsertVideo({
    id: VIDEO_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/pull-test/fixture.mkv",
    filename: "fixture.mkv",
    title: "Pull Test Fixture",
    duration_seconds: 60,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: CONTENT_FINGERPRINT,
  });
});

describe("handleStream pull-based delivery", () => {
  it("delivers init + all media segments in order through the pull path", async () => {
    const { jobId, initBytes, segBytes } = seedRestoredJob(4);
    const req = new Request(`http://test/stream/${jobId}`);
    const res = handleStream(req);
    expect(res.status).toBe(200);
    expect(res.body).not.toBeNull();
    const frames = await drainFrames(res.body!);

    // Expect 1 init + 4 media frames, in order.
    expect(frames).toHaveLength(5);
    expect(Array.from(frames[0])).toEqual(Array.from(initBytes));
    for (let i = 0; i < segBytes.length; i++) {
      expect(Array.from(frames[i + 1])).toEqual(Array.from(segBytes[i]));
    }
  });

  it("closes the stream cleanly when all segments have been sent", async () => {
    const { jobId } = seedRestoredJob(2);
    const req = new Request(`http://test/stream/${jobId}`);
    const res = handleStream(req);
    const frames = await drainFrames(res.body!);
    // 3 = init + 2 segments. No more frames after — drainFrames returning
    // means the stream closed; if the pull loop had leaked, this would have
    // hung instead of returning.
    expect(frames).toHaveLength(3);
  });
});
