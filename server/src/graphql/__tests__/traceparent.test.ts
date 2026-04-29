/**
 * traceparent header propagation through the GraphQL handler.
 *
 * Contract: when a request arrives with a W3C traceparent header, every
 * span the handler emits must inherit the inbound traceId, and the
 * topmost server span must list the inbound spanId as its parent. If
 * propagation drops or fails, every Seq query that filters by traceId
 * loses its connection between the client's `chunk.stream` span (which
 * the client created) and the server's `job.resolve` span — debugging
 * playback regressions becomes impossible.
 *
 * Drives the public path: yoga.fetch → context extracts traceparent →
 * resolver receives ctx.otelCtx → chunker startSpan(parent=ctx.otelCtx).
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { yoga } = await import("../../routes/graphql.js");
const { config } = await import("../../config.js");
const { upsertLibrary } = await import("../../db/queries/libraries.js");
const { upsertVideo } = await import("../../db/queries/videos.js");
const { insertJob } = await import("../../db/queries/jobs.js");
const { insertSegment } = await import("../../db/queries/segments.js");
const { detectHwAccel } = await import("../../services/hwAccel.js");
const { killAllJobs } = await import("../../services/ffmpegPool.js");
const { toGlobalId } = await import("../relay.js");
const { drainCapturedSpans, resetCapturedSpans } = await import("../../test/traceCapture.js");

const LIBRARY_ID = "traceparent-lib";
const VIDEO_ID = "traceparent-video";
const FINGERPRINT = "1024:traceparent-fp";

function computeJobId(contentKey: string, resolution: string, start: number, end: number): string {
  return createHash("sha1").update(`v3|${contentKey}|${resolution}|${start}|${end}`).digest("hex");
}

const RESOLUTION = "1080p";
const START = 0;
const END = 30;
const expectedJobId = computeJobId(FINGERPRINT, RESOLUTION, START, END);

beforeAll(async () => {
  upsertLibrary({
    id: LIBRARY_ID,
    name: "Traceparent Lib",
    path: "/tmp/traceparent",
    media_type: "movies",
    env: "dev",
    video_extensions: "[]",
  });
  upsertVideo({
    id: VIDEO_ID,
    library_id: LIBRARY_ID,
    path: "/tmp/traceparent/video.mkv",
    filename: "video.mkv",
    title: "Traceparent Test",
    duration_seconds: 1800,
    file_size_bytes: 0,
    bitrate: 0,
    scanned_at: new Date().toISOString(),
    content_fingerprint: FINGERPRINT,
  });

  // Seed a "complete" job so startTranscode hits the restore path — opens
  // job.resolve span, emits job_restored_from_db, returns without spawning
  // ffmpeg. Same shape as chunker.cache-stability uses.
  const segmentDir = join(config.segmentDir, expectedJobId);
  mkdirSync(segmentDir, { recursive: true });
  writeFileSync(join(segmentDir, "init.mp4"), "");
  writeFileSync(join(segmentDir, "segment_0000.m4s"), "");
  const now = new Date().toISOString();
  insertJob({
    id: expectedJobId,
    video_id: VIDEO_ID,
    resolution: RESOLUTION,
    status: "complete",
    segment_dir: segmentDir,
    total_segments: 1,
    completed_segments: 1,
    start_time_seconds: START,
    end_time_seconds: END,
    created_at: now,
    updated_at: now,
    error: null,
  });
  insertSegment({
    job_id: expectedJobId,
    segment_index: 0,
    path: join(segmentDir, "segment_0000.m4s"),
    duration_seconds: 2,
    size_bytes: 0,
  });

  // "off" mode caches { kind: "software" } without touching the binary;
  // sentinel path keeps the test green on CI runners without jellyfin-ffmpeg.
  await detectHwAccel("/dev/null/no-ffmpeg-needed-in-off-mode", "off");
});

afterAll(async () => {
  await killAllJobs();
});

describe("traceparent propagation", () => {
  test("inbound traceparent is inherited by spans the handler emits", async () => {
    // Generate a deterministic but unique traceparent. The trace flag `01`
    // means "sampled" — production exporters honour this; the in-memory
    // exporter records all spans regardless, so the assertions below just
    // need the trace IDs to line up.
    const inboundTraceId = "0123456789abcdef0123456789abcdef";
    const inboundSpanId = "1122334455667788";
    const traceparent = `00-${inboundTraceId}-${inboundSpanId}-01`;

    resetCapturedSpans();

    const globalId = toGlobalId("Video", VIDEO_ID);
    const res = await yoga.fetch(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          traceparent,
        },
        body: JSON.stringify({
          query: `mutation ($videoId: ID!, $res: Resolution!, $s: Float!, $e: Float!) {
            startTranscode(videoId: $videoId, resolution: $res, startTimeSeconds: $s, endTimeSeconds: $e) {
              __typename
              ... on TranscodeJob { id }
              ... on PlaybackError { code }
            }
          }`,
          variables: { videoId: globalId, res: "RESOLUTION_1080P", s: START, e: END },
        }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { startTranscode: { __typename: string } };
    };
    expect(body.data.startTranscode.__typename).toBe("TranscodeJob");

    // Drain spans and assert traceId propagation. We don't drain at the start
    // because other tests may have left spans in the buffer; instead, filter
    // for spans on our trace id and verify they're not empty.
    const all = drainCapturedSpans();
    const ourSpans = all.filter((s) => s.spanContext().traceId === inboundTraceId);
    expect(ourSpans.length).toBeGreaterThan(0);

    // Every span emitted under this request inherits the trace id. Sample
    // expectation: at least one job.resolve span (opened by chunker for the
    // restore path) is on this trace.
    const resolveSpan = ourSpans.find((s) => s.name === "job.resolve");
    expect(resolveSpan).toBeDefined();
    if (!resolveSpan) return;
    expect(resolveSpan.spanContext().traceId).toBe(inboundTraceId);
    // job.resolve is a child of the inbound span; OTel records the parent
    // span id in `parentSpanContext` (or `parentSpanId` on older SDKs). The
    // restore-from-db path opens the span with `parentOtelCtx` set to the
    // request's extracted context — so the parent points back to the inbound
    // spanId.
    const parentId =
      resolveSpan.parentSpanContext?.spanId ??
      (resolveSpan as unknown as { parentSpanId?: string }).parentSpanId;
    expect(parentId).toBe(inboundSpanId);
  });
});
