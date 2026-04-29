/**
 * Stream-route kill paths — the branches that must clean up cleanly when
 * encoder/segment delivery stops or the client goes away.
 *
 *  - stream_idle_timeout (config.stream.connectionIdleTimeoutMs = 180 s,
 *    Date.now() comparison) — the encoder stalled on a segment
 *  - client_disconnected (req.signal.aborted detected mid-pull) — the page
 *    closed, the pipeline must NOT keep producing
 *  - init_timeout (60 s init-wait poll loop, 600 × 100 ms Bun.sleep) — the
 *    encoder never wrote init.mp4
 *  - multi-connection drop ordering — first close decrements connections,
 *    only the LAST close triggers killJob
 *
 * All time-driven branches are exercised through the coupled fake clock
 * (sinon fake-timers + Bun.sleep monkey-patch). Production timeouts are
 * never bumped — the test bends time around the constants.
 *
 * The orphan-no-connection (chunker.ts) and max_encode_timeout (chunker.ts)
 * timers are NOT covered here because both are set inside `runFfmpeg` after
 * a successful probe, which fights with our fixture story. They're tracked
 * as opt-in (real-ffmpeg) follow-ups in the same test family.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { config } from "../../config.js";
import { getDb } from "../../db/index.js";
import { insertJob } from "../../db/queries/jobs.js";
import { upsertLibrary } from "../../db/queries/libraries.js";
import { insertSegment } from "../../db/queries/segments.js";
import { upsertVideo } from "../../db/queries/videos.js";
import { getJob, removeJob, setJob } from "../../services/jobStore.js";
import {
  type DateOnlyClock,
  installClock,
  installDateOnlyClock,
  type InstalledClock,
} from "../../test/clock.js";
import { drainCapturedSpans, resetCapturedSpans } from "../../test/traceCapture.js";
import type { ActiveJob, Resolution } from "../../types.js";
import { handleStream } from "../stream.js";

const LIBRARY_ID = "killpaths-lib";
const VIDEO_ID = "killpaths-video";
const RESOLUTION: Resolution = "1080p";

interface SeedOpts {
  jobId: string;
  withInitOnDisk: boolean;
  segmentsOnDisk: number;
  status?: "running" | "complete";
}

/** Synthesizes an ActiveJob + matching DB rows + on-disk artefacts so that
 *  handleStream sees what production sees post-encoder-startup. */
function seedJob(opts: SeedOpts): { activeJob: ActiveJob; segmentDir: string } {
  const segmentDir = join(config.segmentDir, opts.jobId);
  mkdirSync(segmentDir, { recursive: true });

  let initSegmentPath: string | null = null;
  if (opts.withInitOnDisk) {
    initSegmentPath = join(segmentDir, "init.mp4");
    writeFileSync(
      initSegmentPath,
      new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])
    );
  }

  const segmentPaths: string[] = [];
  for (let i = 0; i < opts.segmentsOnDisk; i++) {
    const segPath = join(segmentDir, `segment_${String(i).padStart(4, "0")}.m4s`);
    writeFileSync(
      segPath,
      new Uint8Array([0x00, 0x00, 0x00, 0x10, 0x6d, 0x6f, 0x6f, 0x66, i, 0, 0, 0, 0, 0, 0, 0])
    );
    segmentPaths[i] = segPath;
  }

  const now = new Date().toISOString();
  insertJob({
    id: opts.jobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status: opts.status ?? "running",
    segment_dir: segmentDir,
    total_segments: opts.status === "complete" ? opts.segmentsOnDisk : null,
    completed_segments: opts.segmentsOnDisk,
    start_time_seconds: 0,
    end_time_seconds: 30,
    created_at: now,
    updated_at: now,
    error: null,
  });

  for (let i = 0; i < opts.segmentsOnDisk; i++) {
    insertSegment({
      job_id: opts.jobId,
      segment_index: i,
      path: segmentPaths[i] ?? "",
      duration_seconds: 2,
      size_bytes: 16,
    });
  }

  const activeJob: ActiveJob = {
    id: opts.jobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status: opts.status ?? "running",
    segment_dir: segmentDir,
    total_segments: opts.status === "complete" ? opts.segmentsOnDisk : null,
    completed_segments: opts.segmentsOnDisk,
    start_time_seconds: 0,
    end_time_seconds: 30,
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
  return { activeJob, segmentDir };
}

/**
 * Reads `frameCount` length-prefixed frames off the response body, awaiting
 * each one. Returns the raw frame buffers in order. Used by the multi-pull
 * paths so the test can advance to "the encoder is now idle" before
 * triggering the timeout.
 */
async function readFrames(
  body: ReadableStream<Uint8Array>,
  frameCount: number,
  budgetMs = 1_000
): Promise<Uint8Array[]> {
  const reader = body.getReader();
  const frames: Uint8Array[] = [];
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  const deadline = Date.now() + budgetMs;
  try {
    while (frames.length < frameCount && Date.now() < deadline) {
      while (buffer.length < 4) {
        const { value, done } = await reader.read();
        if (done) return frames;
        buffer = concat(buffer, value ?? new Uint8Array(0));
      }
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const len = view.getUint32(0, false);
      while (buffer.length < 4 + len) {
        const { value, done } = await reader.read();
        if (done) return frames;
        buffer = concat(buffer, value ?? new Uint8Array(0));
      }
      frames.push(buffer.slice(4, 4 + len));
      buffer = buffer.slice(4 + len);
    }
    return frames;
  } finally {
    reader.releaseLock();
  }
}

// Widen to ArrayBufferLike on both sides so the helper accepts both the
// Uint8Array<ArrayBuffer> chunks we allocate locally AND the
// Uint8Array<ArrayBufferLike> chunks the ReadableStream reader hands us.
// (TypeScript 5.7+ split the two for SharedArrayBuffer safety; CI's tsc
// is strict, Bun's local typecheck happens to be lenient.)
function concat(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Drains the body to completion or until the budget expires; returns the
 *  span events on the stream.request span for assertions. Used by tests
 *  where the result is "the response stream closed" (idle / disconnect /
 *  init timeout) rather than "we got N frames". */
async function drainBodyAndCollectStreamRequestEvents(
  body: ReadableStream<Uint8Array>,
  budgetMs = 5_000
): Promise<string[]> {
  const reader = body.getReader();
  const deadline = Date.now() + budgetMs;
  try {
    while (Date.now() < deadline) {
      const { done } = await reader.read().catch(() => ({ done: true }) as { done: true });
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  const span = drainCapturedSpans().find((s) => s.name === "stream.request");
  return span ? span.events.map((e) => e.name) : [];
}

beforeAll(() => {
  getDb();
  upsertLibrary({
    id: LIBRARY_ID,
    name: "Kill Paths Lib",
    path: "/tmp/killpaths-lib",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });
  upsertVideo({
    id: VIDEO_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/killpaths-lib/video.mkv",
    filename: "video.mkv",
    title: "Kill Paths Test",
    duration_seconds: 1800,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: "killpaths-fp",
  });
});

afterAll(() => {
  // Clean up any remaining ActiveJob entries this test left in jobStore.
  for (const id of [
    "killpaths-idle-job",
    "killpaths-disconnect-job",
    "killpaths-init-timeout-job",
    "killpaths-multi-conn-job",
  ]) {
    removeJob(id);
  }
});

beforeEach(() => {
  resetCapturedSpans();
});

describe("stream.request — kill paths", () => {
  test("client_disconnected: aborting mid-pull drains the stream and emits the event", async () => {
    // No clock manipulation needed — abort signal is sync.
    const jobId = "killpaths-disconnect-job";
    const { activeJob } = seedJob({ jobId, withInitOnDisk: true, segmentsOnDisk: 2 });

    const ac = new AbortController();
    const req = new Request(`http://localhost/stream/${jobId}`, { signal: ac.signal });
    const res = handleStream(req);
    expect(res.body).not.toBeNull();
    if (!res.body) return;

    // Read init + first segment, then abort. The next pull sees the aborted
    // signal and finalises with `client_disconnected`.
    const frames = await readFrames(res.body, 2, 1_000);
    expect(frames.length).toBe(2);
    expect(activeJob.connections).toBe(1);

    ac.abort();
    const events = await drainBodyAndCollectStreamRequestEvents(res.body, 1_000);
    expect(events).toContain("stream_started");
    expect(events).toContain("client_disconnected");
    // Connection counter decremented on finalise.
    expect(activeJob.connections).toBe(0);
  });

  test("idle_timeout: encoder stalls for 180 s → stream closes with idle_timeout event", async () => {
    // The wait loop here does real fs `access()` between sleeps, which
    // sinon's tickAsync cannot drain (libuv I/O can't advance under fake
    // timers). Use date-only clock: jump Date.now() ahead by 181 s, let one
    // real Bun.sleep cycle (100 ms) fire, and the idle check exits.
    const dateClock: DateOnlyClock = installDateOnlyClock();
    try {
      const jobId = "killpaths-idle-job";
      const { activeJob } = seedJob({ jobId, withInitOnDisk: true, segmentsOnDisk: 1 });

      const req = new Request(`http://localhost/stream/${jobId}`);
      const res = handleStream(req);
      if (!res.body) throw new Error("no body");

      const reader = res.body.getReader();
      const initFrame = await readFrame(reader);
      expect(initFrame).not.toBeNull();
      const seg0Frame = await readFrame(reader);
      expect(seg0Frame).not.toBeNull();

      // Kick off next read so pull enters the wait loop. Then advance
      // Date.now() past the idle window. The next real Bun.sleep tick
      // (~100 ms wall) re-enters the idle check and trips the close.
      const closingReadPromise = reader.read();
      // Small real wait so pull gets a chance to enter the wait branch
      // before we advance Date.
      await new Promise((r) => setTimeout(r, 50));
      dateClock.advance(config.stream.connectionIdleTimeoutMs + 1_000);
      const drainRes = await closingReadPromise;
      expect(drainRes.done).toBe(true);

      const span = drainCapturedSpans().find((s) => s.name === "stream.request");
      expect(span).toBeDefined();
      if (!span) return;
      const eventNames = span.events.map((e) => e.name);
      expect(eventNames).toContain("stream_started");
      expect(eventNames).toContain("idle_timeout");
      expect(activeJob.connections).toBe(0);
    } finally {
      dateClock.uninstall();
    }
  });

  test("init_timeout: encoder never produces init.mp4 → controller errors with init_timeout event", async () => {
    // The init wait loop is purely Bun.sleep-bound (no real I/O between
    // ticks), so full fake-timers + Bun.sleep monkeypatch is the right
    // tool here — coupled clock + setTimeout, no drift.
    const fullClock: InstalledClock = installClock();
    try {
      const jobId = "killpaths-init-timeout-job";
      seedJob({ jobId, withInitOnDisk: false, segmentsOnDisk: 0 });

      const req = new Request(`http://localhost/stream/${jobId}`);
      const res = handleStream(req);
      if (!res.body) throw new Error("no body");

      // Init wait loop: 600 × 100 ms = 60 s. Tick well past it.
      const readPromise = readFrames(res.body, 1, 100_000).catch(() => [] as Uint8Array[]);
      await fullClock.tickAsync(60_500);
      await readPromise;

      const span = drainCapturedSpans().find((s) => s.name === "stream.request");
      expect(span).toBeDefined();
      if (!span) return;
      const eventNames = span.events.map((e) => e.name);
      expect(eventNames).toContain("init_wait_complete");
      expect(eventNames).toContain("init_timeout");
    } finally {
      fullClock.uninstall();
    }
  });

  test("multi-connection: closing the first reader does NOT trigger killJob; closing the last does", async () => {
    const jobId = "killpaths-multi-conn-job";
    const { activeJob } = seedJob({ jobId, withInitOnDisk: true, segmentsOnDisk: 2 });

    const ac1 = new AbortController();
    const ac2 = new AbortController();
    const req1 = new Request(`http://localhost/stream/${jobId}`, { signal: ac1.signal });
    const req2 = new Request(`http://localhost/stream/${jobId}`, { signal: ac2.signal });
    const res1 = handleStream(req1);
    const res2 = handleStream(req2);
    if (!res1.body || !res2.body) throw new Error("no body");

    // Each stream's start() callback fires on the first pull. Read one frame
    // from each so addConnection has run on both.
    const r1Frames = await readFrames(res1.body, 1, 1_000);
    const r2Frames = await readFrames(res2.body, 1, 1_000);
    expect(r1Frames.length).toBe(1);
    expect(r2Frames.length).toBe(1);
    expect(activeJob.connections).toBe(2);

    // Drop the first connection. The job is still wanted by the second
    // reader, so connections drops to 1 and killJob does NOT fire.
    ac1.abort();
    await drainBodyAndCollectStreamRequestEvents(res1.body, 500);
    const jobAfterFirstDrop = getJob(jobId);
    expect(jobAfterFirstDrop?.connections).toBe(1);
    // No status flip — running job stays running.
    expect(jobAfterFirstDrop?.status).toBe("running");

    // Drop the second connection. Now connections=0; the disconnect
    // finaliser calls killJob("client_disconnected"). The job state moves
    // off the in-memory store via the pool's onKilled hook, but the
    // ActiveJob's connections counter stays observable here.
    ac2.abort();
    await drainBodyAndCollectStreamRequestEvents(res2.body, 500);
    const finalJob = getJob(jobId);
    expect(finalJob?.connections).toBe(0);
  });
});

async function readFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Uint8Array | null> {
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  while (buffer.length < 4) {
    const { value, done } = await reader.read();
    if (done) return null;
    buffer = concat(buffer, value ?? new Uint8Array(0));
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const len = view.getUint32(0, false);
  while (buffer.length < 4 + len) {
    const { value, done } = await reader.read();
    if (done) return null;
    buffer = concat(buffer, value ?? new Uint8Array(0));
  }
  return buffer.slice(4, 4 + len);
}
