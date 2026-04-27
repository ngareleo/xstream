import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BufferManager } from "~/services/bufferManager.js";
import { type ChunkOpts, ChunkPipeline } from "~/services/chunkPipeline.js";
import type * as PlaybackSessionModule from "~/services/playbackSession.js";

/* ── Module mocks ────────────────────────────────────────────────────────── */

// Capture every StreamingService instance so tests can drive segment delivery
// + lifecycle callbacks. vi.hoisted lets the closure reference survive the
// vi.mock hoisting.
const { createdServices } = vi.hoisted(() => ({
  createdServices: [] as FakeStreamingService[],
}));

interface FakeStreamingService {
  jobId: string | null;
  paused: boolean;
  cancelled: boolean;
  onSegment: ((data: ArrayBuffer, isInit: boolean) => Promise<void>) | null;
  onError: ((err: Error) => void) | null;
  onDone: (() => void) | null;
  start(
    jobId: string,
    fromIndex: number,
    onSegment: (data: ArrayBuffer, isInit: boolean) => Promise<void>,
    onError: (err: Error) => void,
    onDone: () => void
  ): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
  /** Test helpers — drive the slot's segment/lifecycle callbacks. */
  deliverInit(data?: Uint8Array): Promise<void>;
  deliverMedia(data?: Uint8Array): Promise<void>;
  finish(): void;
  fail(err: Error): void;
}

vi.mock("~/services/streamingService.js", () => {
  class StreamingService implements FakeStreamingService {
    jobId: string | null = null;
    paused = false;
    cancelled = false;
    onSegment: ((data: ArrayBuffer, isInit: boolean) => Promise<void>) | null = null;
    onError: ((err: Error) => void) | null = null;
    onDone: (() => void) | null = null;

    constructor() {
      createdServices.push(this);
    }

    start(
      jobId: string,
      _fromIndex: number,
      onSegment: (data: ArrayBuffer, isInit: boolean) => Promise<void>,
      onError: (err: Error) => void,
      onDone: () => void
    ): Promise<void> {
      this.jobId = jobId;
      this.onSegment = onSegment;
      this.onError = onError;
      this.onDone = onDone;
      // Real start() returns a Promise that resolves when the stream ends.
      // Tests drive that ending via finish() / fail() / cancel(); the returned
      // Promise here just stays unresolved (the Pipeline doesn't await it).
      return new Promise(() => {});
    }

    pause(): void {
      this.paused = true;
    }
    resume(): void {
      this.paused = false;
    }
    cancel(): void {
      this.cancelled = true;
    }

    async deliverInit(data: Uint8Array = new Uint8Array(64)): Promise<void> {
      if (!this.onSegment) throw new Error("not started");
      await this.onSegment(data.buffer.slice(0) as ArrayBuffer, true);
    }
    async deliverMedia(data: Uint8Array = new Uint8Array(2048)): Promise<void> {
      if (!this.onSegment) throw new Error("not started");
      await this.onSegment(data.buffer.slice(0) as ArrayBuffer, false);
    }
    finish(): void {
      this.onDone?.();
    }
    fail(err: Error): void {
      this.onError?.(err);
    }
  }
  return { StreamingService };
});

vi.mock("~/services/playbackSession.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PlaybackSessionModule>();
  return {
    ...actual,
    getSessionContext: vi.fn(actual.getSessionContext),
  };
});

/* ── Test helpers ────────────────────────────────────────────────────────── */

function makeMockSpan(): {
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  addEvent: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  spanContext: () => { traceId: string; spanId: string; traceFlags: number };
} {
  return {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    addEvent: vi.fn(),
    end: vi.fn(),
    spanContext: () => ({ traceId: "0".repeat(32), spanId: "0".repeat(16), traceFlags: 0 }),
  };
}

interface FakeBuffer {
  appendCalls: Array<{ bytes: number; resolve: () => void; reject: (err: Error) => void }>;
  /** Records every `setTimestampOffset(N)` call in order — exercised by
   *  ChunkPipeline.processSegment on every chunk's init. */
  setTimestampOffsetCalls: number[];
  markStreamDoneCalls: number;
  bufferedAheadSeconds: number;
  /** Set true to make `waitIfPaused` block until `releasePause()` is called. */
  paused: boolean;
  releasePause(): void;
  appendSegment(data: ArrayBuffer): Promise<void>;
  setTimestampOffset(offsetS: number): Promise<void>;
  markStreamDone(): void;
  getBufferedAheadSeconds(_currentTime: number): number;
  waitIfPaused(): Promise<void>;
}

function makeFakeBuffer(): FakeBuffer {
  let resumeResolve: (() => void) | null = null;
  const buf: FakeBuffer = {
    appendCalls: [],
    setTimestampOffsetCalls: [],
    markStreamDoneCalls: 0,
    bufferedAheadSeconds: 20,
    paused: false,
    releasePause(): void {
      buf.paused = false;
      resumeResolve?.();
      resumeResolve = null;
    },
    appendSegment(data: ArrayBuffer): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        buf.appendCalls.push({ bytes: data.byteLength, resolve, reject });
        // Default: resolve immediately so tests don't have to drain manually
        // unless they want to inspect ordering. Tests that care about ordering
        // can pop from appendCalls before the microtask runs.
        queueMicrotask(resolve);
      });
    },
    setTimestampOffset(offsetS: number): Promise<void> {
      buf.setTimestampOffsetCalls.push(offsetS);
      return Promise.resolve();
    },
    markStreamDone(): void {
      buf.markStreamDoneCalls += 1;
    },
    getBufferedAheadSeconds(_currentTime: number): number {
      return buf.bufferedAheadSeconds;
    },
    waitIfPaused(): Promise<void> {
      if (!buf.paused) return Promise.resolve();
      return new Promise<void>((r) => {
        resumeResolve = r;
      });
    },
  };
  return buf;
}

// Minimal shape of @opentelemetry/api Tracer that ChunkPipeline actually calls.
// Cast through unknown because the production type wants a Tracer with many
// methods — only startSpan is exercised at runtime.
function makePipeline(buffer: FakeBuffer): ChunkPipeline {
  const tracer = { startSpan: vi.fn(makeMockSpan) };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const videoEl = { currentTime: 100 } as unknown as HTMLVideoElement;
  return new ChunkPipeline(
    buffer as unknown as BufferManager,
    tracer as unknown as ConstructorParameters<typeof ChunkPipeline>[1],
    log,
    videoEl
  );
}

function baseOpts(overrides: Partial<ChunkOpts> = {}): ChunkOpts {
  return {
    jobId: "job-1",
    chunkStartS: 0,
    isFirstChunk: false,
    resolution: "4k",
    onStreamEnded: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  createdServices.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe("ChunkPipeline", () => {
  it("startForeground constructs a StreamingService and calls start with the jobId", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);

    pipeline.startForeground(baseOpts({ jobId: "fg-1", chunkStartS: 0, isFirstChunk: true }));

    expect(createdServices).toHaveLength(1);
    expect(createdServices[0].jobId).toBe("fg-1");
  });

  it("openLookahead opens a SECOND StreamingService — fetch is in flight before foreground completes", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);

    pipeline.startForeground(baseOpts({ jobId: "fg", chunkStartS: 0, isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300 }));

    // This is the bug fix: BOTH services exist simultaneously, so the server
    // sees connections > 0 for the prefetched job and the orphan timer is
    // satisfied.
    expect(createdServices).toHaveLength(2);
    expect(createdServices[0].jobId).toBe("fg");
    expect(createdServices[1].jobId).toBe("la");
    expect(createdServices[0].cancelled).toBe(false);
    expect(createdServices[1].cancelled).toBe(false);
  });

  it("hasLookahead reflects the lookahead slot state", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);

    expect(pipeline.hasLookahead()).toBe(false);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    expect(pipeline.hasLookahead()).toBe(false);
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300 }));
    expect(pipeline.hasLookahead()).toBe(true);
  });

  it("pauseAll pauses BOTH foreground and lookahead readers", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300 }));

    pipeline.pauseAll();
    expect(createdServices[0].paused).toBe(true);
    expect(createdServices[1].paused).toBe(true);

    pipeline.resumeAll();
    expect(createdServices[0].paused).toBe(false);
    expect(createdServices[1].paused).toBe(false);
  });

  it("cancel cancels BOTH slots", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300 }));

    pipeline.cancel("teardown");
    expect(createdServices[0].cancelled).toBe(true);
    expect(createdServices[1].cancelled).toBe(true);
    expect(pipeline.hasLookahead()).toBe(false);
  });

  it("cancelLookahead cancels only the lookahead", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300 }));

    pipeline.cancelLookahead("seek");
    expect(createdServices[0].cancelled).toBe(false);
    expect(createdServices[1].cancelled).toBe(true);
    expect(pipeline.hasLookahead()).toBe(false);
  });

  it("opening a second lookahead cancels the first one", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la-1", chunkStartS: 300 }));
    pipeline.openLookahead(baseOpts({ jobId: "la-2", chunkStartS: 600 }));

    expect(createdServices).toHaveLength(3);
    expect(createdServices[1].cancelled).toBe(true); // old lookahead cancelled
    expect(createdServices[2].cancelled).toBe(false);
  });

  it("startForeground with an existing foreground replaces it", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ jobId: "fg-1", isFirstChunk: true }));
    pipeline.startForeground(baseOpts({ jobId: "fg-2", isFirstChunk: false }));

    expect(createdServices[0].cancelled).toBe(true);
    expect(createdServices[1].cancelled).toBe(false);
  });

  it("promoteLookahead throws if there is no lookahead", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));

    expect(() => pipeline.promoteLookahead()).toThrow();
  });

  it("promoteLookahead clears the lookahead slot and returns its chunkStartS", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300 }));

    const result = pipeline.promoteLookahead();
    expect(result.chunkStartS).toBe(300);
    expect(result.drain).toBeInstanceOf(Promise);
    expect(pipeline.hasLookahead()).toBe(false);
    await result.drain; // empty drain on no queued segments
  });

  it("init segment is QUEUED for lookahead, then appended on promotion-drain", async () => {
    // Each chunk's init carries its own elst; the lookahead defers it (and
    // every segment) until promotion so the foreground's in-flight segments
    // never get re-parented against the wrong edit list. See the
    // architect.md "Lookahead buffers segments locally" section.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300, isFirstChunk: false }));

    const lookaheadSlot = createdServices[1];
    const fgAppendsBefore = buffer.appendCalls.length;
    await lookaheadSlot.deliverInit();
    // Pre-promotion: no new appends from the lookahead's init
    expect(buffer.appendCalls.length).toBe(fgAppendsBefore);

    // Promotion drains the queued init into the SourceBuffer.
    const { drain } = pipeline.promoteLookahead();
    await drain;
    expect(buffer.appendCalls.length).toBe(fgAppendsBefore + 1);
  });

  it("init segment is APPENDED for the first chunk", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ jobId: "fg", chunkStartS: 0, isFirstChunk: true }));

    const slot = createdServices[0];
    await slot.deliverInit();
    expect(buffer.appendCalls).toHaveLength(1);
  });

  it("setTimestampOffset fires with chunkStartS on every chunk's init append", async () => {
    // Anchors the relative-tfdt → playback-time mapping. Without this call
    // post-seek segments land at playback time `tfdt` (e.g. 160s) instead of
    // `chunkStart + tfdt` (e.g. 4360s). See `02-Chunk-Pipeline-Invariants.md`
    // Invariant #1.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ jobId: "fg-0", chunkStartS: 0, isFirstChunk: true }));
    await createdServices[0].deliverInit();
    expect(buffer.setTimestampOffsetCalls).toEqual([0]);

    // A continuation chunk at 4200s must offset by 4200 BEFORE the init's
    // appendSegment is called.
    pipeline.startForeground(baseOpts({ jobId: "fg-1", chunkStartS: 4200 }));
    await createdServices[1].deliverInit();
    expect(buffer.setTimestampOffsetCalls).toEqual([0, 4200]);
  });

  it("setTimestampOffset is NOT called for media segments — only init", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ jobId: "fg", chunkStartS: 300, isFirstChunk: false }));

    const slot = createdServices[0];
    await slot.deliverInit();
    await slot.deliverMedia();
    await slot.deliverMedia();
    expect(buffer.setTimestampOffsetCalls).toEqual([300]);
  });

  it("onFirstChunkInit fires after the first chunk's init segment is appended", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onFirstChunkInit = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onFirstChunkInit }));

    const slot = createdServices[0];
    await slot.deliverInit();
    // Wait for the appendSegment microtask to drain
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(onFirstChunkInit).toHaveBeenCalledTimes(1);
  });

  it("onFirstMediaSegmentArrived fires on the first media segment of a continuation chunk (after promotion-drain)", async () => {
    // Lookahead defers ALL appends + side-effects until promotion. The
    // first-media callback fires when the first media segment is actually
    // appended to the SourceBuffer, which now means during the drain.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onFirstMediaSegmentArrived = vi.fn();
    // Need a foreground slot so openLookahead doesn't replace it as foreground.
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(
      baseOpts({
        jobId: "la",
        chunkStartS: 300,
        isFirstChunk: false,
        onFirstMediaSegmentArrived,
      })
    );

    const lookaheadSlot = createdServices[1];
    await lookaheadSlot.deliverInit(); // queued, no append yet
    await lookaheadSlot.deliverMedia(); // queued
    await lookaheadSlot.deliverMedia(); // queued

    // Still nothing should have fired — we're a lookahead.
    expect(onFirstMediaSegmentArrived).not.toHaveBeenCalled();

    const { drain } = pipeline.promoteLookahead();
    await drain;

    // After drain: first media seg fires the callback exactly once.
    expect(onFirstMediaSegmentArrived).toHaveBeenCalledTimes(1);
  });

  it("foreground stream completion calls onStreamEnded with 'completed' when there is real content", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onStreamEnded = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onStreamEnded }));

    const slot = createdServices[0];
    // Deliver enough media bytes to clear MIN_REAL_CHUNK_BYTES
    await slot.deliverMedia(new Uint8Array(8_192));
    slot.finish();

    expect(onStreamEnded).toHaveBeenCalledWith("completed");
    expect(buffer.markStreamDoneCalls).toBe(0); // 'completed' does not call markStreamDone
  });

  it("foreground stream completion with no real content calls onStreamEnded with 'no_real_content' AND markStreamDone", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onStreamEnded = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onStreamEnded }));

    const slot = createdServices[0];
    // No media delivered — totalMediaBytes stays at 0 → no_real_content
    slot.finish();

    expect(onStreamEnded).toHaveBeenCalledWith("no_real_content");
    expect(buffer.markStreamDoneCalls).toBe(1);
  });

  it("LOOKAHEAD stream completion is DEFERRED — onStreamEnded does NOT fire until promotion", async () => {
    // The critical invariant: a lookahead's stream ending while the foreground
    // is still appending must NOT call markStreamDone (would call
    // MediaSource.endOfStream and break MSE) and must NOT call onStreamEnded
    // (would chain to the next chunk while the current one is still playing).
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));

    const lookaheadOnStreamEnded = vi.fn();
    pipeline.openLookahead(
      baseOpts({
        jobId: "la",
        chunkStartS: 300,
        onStreamEnded: lookaheadOnStreamEnded,
      })
    );
    const lookaheadSlot = createdServices[1];
    await lookaheadSlot.deliverMedia(new Uint8Array(8_192));
    lookaheadSlot.finish(); // stream ends naturally before promotion

    // Deferred — should NOT fire yet
    expect(lookaheadOnStreamEnded).not.toHaveBeenCalled();

    // Now promote — drain runs first, THEN the deferred outcome fires
    // (chaining to the next chunk before the SourceBuffer reflects the
    // queued segments would race PlaybackController.handleChunkEnded).
    const { drain } = pipeline.promoteLookahead();
    await drain;
    expect(lookaheadOnStreamEnded).toHaveBeenCalledWith("completed");
  });

  it("LOOKAHEAD no_real_content does NOT call markStreamDone until promotion", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));

    const lookaheadOnStreamEnded = vi.fn();
    pipeline.openLookahead(
      baseOpts({
        jobId: "la",
        chunkStartS: 300,
        onStreamEnded: lookaheadOnStreamEnded,
      })
    );
    const lookaheadSlot = createdServices[1];
    lookaheadSlot.finish(); // no media → no_real_content

    // Deferred — markStreamDone NOT called yet (foreground still appending)
    expect(buffer.markStreamDoneCalls).toBe(0);
    expect(lookaheadOnStreamEnded).not.toHaveBeenCalled();

    // Promotion drains (no segments to drain here) then fires the deferred
    // outcome — markStreamDone + onStreamEnded both fire after `drain`.
    const { drain } = pipeline.promoteLookahead();
    await drain;
    expect(buffer.markStreamDoneCalls).toBe(1);
    expect(lookaheadOnStreamEnded).toHaveBeenCalledWith("no_real_content");
  });

  it("a stream error from the foreground reports through onError", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onError = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onError }));

    const slot = createdServices[0];
    slot.fail(new Error("network down"));

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe("network down");
  });

  it("cancel before stream completion does not fire onStreamEnded", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onStreamEnded = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onStreamEnded }));

    pipeline.cancel("teardown");

    expect(onStreamEnded).not.toHaveBeenCalled();
  });

  it("drainAndDispatch halts between segments when BufferManager reports paused", async () => {
    // Trace e699c0ae… failure mode: at chunk handover, drainAndDispatch
    // previously appended ALL queued lookahead segments in a tight loop —
    // bypassing backpressure and flooding MSE by 200-400 MB. With
    // waitIfPaused() between iterations, only 1 segment appends before the
    // pause blocks the drain; resume releases and the rest flow through.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);

    pipeline.startForeground(baseOpts({ jobId: "fg", chunkStartS: 0, isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300, isFirstChunk: false }));

    const la = createdServices[1];
    // Queue an init + 4 media segments on the lookahead.
    await la.deliverInit(new Uint8Array([1, 2, 3, 4]));
    for (let i = 0; i < 4; i++) {
      await la.deliverMedia(new Uint8Array(32));
    }
    la.finish();

    // Lookahead's appends should be QUEUED (not called yet) — foreground is
    // still active, queueing path applies. The fakeBuffer captures appendSegment
    // calls, so this lets us count actual drain-time appends precisely.
    const beforePromote = buffer.appendCalls.length;

    // Flip the buffer to paused BEFORE promotion so the very first
    // waitIfPaused() call inside drainAndDispatch blocks the loop.
    buffer.paused = true;
    const { drain } = pipeline.promoteLookahead();

    // Let any microtasks settle — waitIfPaused blocks the first iteration
    // immediately, so at most 0 or 1 segments may process depending on where
    // the await lands in the scheduler. Either way, NOT all 5 should land.
    await new Promise((r) => setTimeout(r, 10));
    const duringPause = buffer.appendCalls.length - beforePromote;
    expect(duringPause).toBeLessThan(5);

    // Resume — drain resumes and appends the remaining queued segments.
    buffer.releasePause();
    await drain;
    const totalDrained = buffer.appendCalls.length - beforePromote;
    expect(totalDrained).toBe(5); // init + 4 media segments
  });
});
