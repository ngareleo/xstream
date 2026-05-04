import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackTimeline, type PlaybackTimelineDrift } from "~/services/playbackTimeline.js";

/** Reads the contract `DRIFT_THRESHOLD_MS = 5000` from the module. */
const DRIFT_THRESHOLD_MS = 5000;

let nowMs = 0;

beforeEach(() => {
  nowMs = 1000;
  vi.stubGlobal("performance", { now: () => nowMs });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeTimeline(): { tl: PlaybackTimeline; drifts: PlaybackTimelineDrift[] } {
  const drifts: PlaybackTimelineDrift[] = [];
  const tl = new PlaybackTimeline({ onDrift: (d) => drifts.push(d) });
  return { tl, drifts };
}

describe("PlaybackTimeline", () => {
  it("snapshot is mostly null on a fresh instance", () => {
    const { tl } = makeTimeline();
    const snap = tl.snapshot(null);
    expect(snap).toEqual({
      foregroundChunkStartS: null,
      foregroundChunkEndS: null,
      expectedSeamAtMs: null,
      lookaheadJobId: null,
      lookaheadOpenedAtMs: null,
      expectedFirstByteAtMs: null,
      rollingAvgFirstByteLatencyMs: null,
    });
  });

  it("setForegroundChunk surfaces start/end in snapshot", () => {
    const { tl } = makeTimeline();
    tl.setForegroundChunk(300, 600);
    const snap = tl.snapshot(null);
    expect(snap.foregroundChunkStartS).toBe(300);
    expect(snap.foregroundChunkEndS).toBe(600);
  });

  it("expectedSeamAtMs projects from currentTime at 1× rate", () => {
    const { tl } = makeTimeline();
    tl.setForegroundChunk(0, 300);
    nowMs = 5000;
    const snap = tl.snapshot(240);
    expect(snap.expectedSeamAtMs).toBe(5000 + 60_000);
  });

  it("expectedSeamAtMs is null when currentTime is null (no playhead)", () => {
    const { tl } = makeTimeline();
    tl.setForegroundChunk(0, 300);
    expect(tl.snapshot(null).expectedSeamAtMs).toBeNull();
  });

  it("first lookahead has no prediction → no drift event regardless of latency", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 11_000; // 10s after open — would be huge drift if there were a prediction
    tl.recordLookaheadFirstByte("job-1", nowMs);
    expect(drifts).toEqual([]);
  });

  it("subsequent lookahead with stable latency does not fire drift", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 3_000;
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    nowMs = 5000;
    tl.recordLookaheadOpened("job-2");
    nowMs = 7_500;
    tl.recordLookaheadFirstByte("job-2", nowMs);

    expect(drifts).toEqual([]);
  });

  it("subsequent lookahead with latency exceeding threshold fires drift", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 3_000;
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    nowMs = 10_000;
    tl.recordLookaheadOpened("job-2");
    nowMs = 18_000;
    tl.recordLookaheadFirstByte("job-2", nowMs);

    expect(drifts).toHaveLength(1);
    const drift = drifts[0];
    expect(drift.dimension).toBe("lookahead_first_byte");
    expect(drift.jobId).toBe("job-2");
    expect(drift.actualAtMs).toBe(18_000);
    expect(drift.predictedAtMs).toBe(10_000 + 2_000);
    expect(drift.driftMs).toBe(6_000);
  });

  it("drift fires for early arrivals too (negative drift), if it exceeds threshold", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 11_000; // 10_000ms baseline
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    // Second arrives 2_000ms after open — way faster than baseline.
    nowMs = 20_000;
    tl.recordLookaheadOpened("job-2");
    nowMs = 22_000;
    tl.recordLookaheadFirstByte("job-2", nowMs);

    expect(drifts).toHaveLength(1);
    expect(drifts[0].driftMs).toBe(-8_000);
  });

  it("rolling window caps at 5 — older latencies fall out", () => {
    const { tl, drifts } = makeTimeline();
    for (let i = 0; i < 6; i++) {
      nowMs = i * 100_000;
      tl.recordLookaheadOpened(`job-${i}`);
      nowMs += 1_000;
      tl.recordLookaheadFirstByte(`job-${i}`, nowMs);
      tl.clearLookahead();
    }
    expect(drifts).toEqual([]);

    nowMs = 700_000;
    tl.recordLookaheadOpened("job-out");
    nowMs += 10_000;
    tl.recordLookaheadFirstByte("job-out", nowMs);

    expect(drifts).toHaveLength(1);
    expect(drifts[0].jobId).toBe("job-out");
  });

  it("recordLookaheadFirstByte with mismatched jobId is a no-op", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 3_000;
    tl.recordLookaheadFirstByte("job-WRONG", nowMs);
    expect(drifts).toEqual([]);

    tl.recordLookaheadFirstByte("job-1", nowMs);
    expect(drifts).toEqual([]);

    tl.clearLookahead();
    nowMs = 10_000;
    tl.recordLookaheadOpened("job-2");
    nowMs += 20_000;
    tl.recordLookaheadFirstByte("job-2", nowMs);
    expect(drifts).toHaveLength(1);
  });

  it("recordLookaheadFirstByte without a recordLookaheadOpened first is a no-op", () => {
    const { tl, drifts } = makeTimeline();
    tl.recordLookaheadFirstByte("ghost", performance.now());
    expect(drifts).toEqual([]);
  });

  it("clearLookahead resets lookahead state but preserves rolling window", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 3_000;
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    expect(tl.snapshot(null).lookaheadJobId).toBeNull();
    expect(tl.snapshot(null).lookaheadOpenedAtMs).toBeNull();
    expect(tl.snapshot(null).rollingAvgFirstByteLatencyMs).toBe(2_000);

    nowMs = 5000;
    tl.recordLookaheadOpened("job-2");
    nowMs += 10_000;
    tl.recordLookaheadFirstByte("job-2", nowMs);
    expect(drifts).toHaveLength(1);
  });

  it("expectedFirstByteAtMs uses rolling avg + open instant", () => {
    const { tl } = makeTimeline();
    nowMs = 1000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 4_000; // 3_000ms latency
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    nowMs = 10_000;
    tl.recordLookaheadOpened("job-2");
    const snap = tl.snapshot(null);
    expect(snap.expectedFirstByteAtMs).toBe(10_000 + 3_000);
    expect(snap.rollingAvgFirstByteLatencyMs).toBe(3_000);
  });

  it("drift exactly at threshold does not fire (boundary is exclusive)", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1_000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 2_000;
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    nowMs = 10_000;
    tl.recordLookaheadOpened("job-2");
    nowMs = 10_000 + 1_000 + DRIFT_THRESHOLD_MS;
    tl.recordLookaheadFirstByte("job-2", nowMs);
    expect(drifts).toEqual([]);
  });

  it("drift one ms over threshold fires", () => {
    const { tl, drifts } = makeTimeline();
    nowMs = 1_000;
    tl.recordLookaheadOpened("job-1");
    nowMs = 2_000;
    tl.recordLookaheadFirstByte("job-1", nowMs);
    tl.clearLookahead();

    nowMs = 10_000;
    tl.recordLookaheadOpened("job-2");
    nowMs = 10_000 + 1_000 + DRIFT_THRESHOLD_MS + 1;
    tl.recordLookaheadFirstByte("job-2", nowMs);
    expect(drifts).toHaveLength(1);
  });
});
