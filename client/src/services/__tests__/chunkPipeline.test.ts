import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BufferManager } from "~/services/bufferManager.js";
import { type ChunkOpts, ChunkPipeline } from "~/services/chunkPipeline.js";
import type * as PlaybackSessionModule from "~/services/playbackSession.js";

/* ── Module mocks ────────────────────────────────────────────────────────── */

// vi.hoisted preserves closure references through vi.mock hoisting.
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
    onSegment: (data: ArrayBuffer, isInit: boolean) => Promise<void>,
    onError: (err: Error) => void,
    onDone: () => void
  ): Promise<void>;
  pause(): void;
  resume(): void;
  cancel(): void;
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
      onSegment: (data: ArrayBuffer, isInit: boolean) => Promise<void>,
      onError: (err: Error) => void,
      onDone: () => void
    ): Promise<void> {
      this.jobId = jobId;
      this.onSegment = onSegment;
      this.onError = onError;
      this.onDone = onDone;
      // Real start() resolves when stream ends; tests drive via finish/fail/cancel.
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
  setTimestampOffsetCalls: number[];
  markStreamDoneCalls: number;
  bufferedAheadSeconds: number;
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

// Minimal Tracer shape; only startSpan is exercised at runtime.
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
    chunkEndS: 10,
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

    // Both services exist simultaneously; server sees connections > 0.
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
    // Lookahead defers all segments until promotion to prevent foreground
    // segments re-parenting against wrong edit lists.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300, isFirstChunk: false }));

    const lookaheadSlot = createdServices[1];
    const fgAppendsBefore = buffer.appendCalls.length;
    await lookaheadSlot.deliverInit();
    expect(buffer.appendCalls.length).toBe(fgAppendsBefore);

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
    // Maps relative-tfdt to playback time. See docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    pipeline.startForeground(baseOpts({ jobId: "fg-0", chunkStartS: 0, isFirstChunk: true }));
    await createdServices[0].deliverInit();
    expect(buffer.setTimestampOffsetCalls).toEqual([0]);

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
    await new Promise((r) => queueMicrotask(() => r(undefined)));
    expect(onFirstChunkInit).toHaveBeenCalledTimes(1);
  });

  it("onFirstMediaSegmentArrived fires on the first media segment of a continuation chunk (after promotion-drain)", async () => {
    // Lookahead defers all appends until promotion-drain.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onFirstMediaSegmentArrived = vi.fn();
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
    await lookaheadSlot.deliverInit();
    await lookaheadSlot.deliverMedia();
    await lookaheadSlot.deliverMedia();

    expect(onFirstMediaSegmentArrived).not.toHaveBeenCalled();

    const { drain } = pipeline.promoteLookahead();
    await drain;

    expect(onFirstMediaSegmentArrived).toHaveBeenCalledTimes(1);
  });

  it("foreground stream completion calls onStreamEnded with 'completed' when there is real content", async () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onStreamEnded = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onStreamEnded }));

    const slot = createdServices[0];
    await slot.deliverMedia(new Uint8Array(8_192));
    slot.finish();

    expect(onStreamEnded).toHaveBeenCalledWith("completed");
    expect(buffer.markStreamDoneCalls).toBe(0);
  });

  it("foreground stream completion with no real content calls onStreamEnded with 'no_real_content' AND markStreamDone", () => {
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);
    const onStreamEnded = vi.fn();
    pipeline.startForeground(baseOpts({ isFirstChunk: true, onStreamEnded }));

    const slot = createdServices[0];
    slot.finish();

    expect(onStreamEnded).toHaveBeenCalledWith("no_real_content");
    expect(buffer.markStreamDoneCalls).toBe(1);
  });

  it("LOOKAHEAD stream completion is DEFERRED — onStreamEnded does NOT fire until promotion", async () => {
    // Lookahead's stream ending before foreground finish must defer markStreamDone
    // and onStreamEnded to avoid race with PlaybackController.handleChunkEnded.
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
    lookaheadSlot.finish();

    expect(lookaheadOnStreamEnded).not.toHaveBeenCalled();

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
    lookaheadSlot.finish();

    expect(buffer.markStreamDoneCalls).toBe(0);
    expect(lookaheadOnStreamEnded).not.toHaveBeenCalled();

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
    // Old code appended all queued lookahead segments in a tight loop,
    // bypassing backpressure and flooding MSE. See trace e699c0ae.
    const buffer = makeFakeBuffer();
    const pipeline = makePipeline(buffer);

    pipeline.startForeground(baseOpts({ jobId: "fg", chunkStartS: 0, isFirstChunk: true }));
    pipeline.openLookahead(baseOpts({ jobId: "la", chunkStartS: 300, isFirstChunk: false }));

    const la = createdServices[1];
    await la.deliverInit(new Uint8Array([1, 2, 3, 4]));
    for (let i = 0; i < 4; i++) {
      await la.deliverMedia(new Uint8Array(32));
    }
    la.finish();

    const beforePromote = buffer.appendCalls.length;

    buffer.paused = true;
    const { drain } = pipeline.promoteLookahead();

    await new Promise((r) => setTimeout(r, 10));
    const duringPause = buffer.appendCalls.length - beforePromote;
    expect(duringPause).toBeLessThan(5);

    buffer.releasePause();
    await drain;
    const totalDrained = buffer.appendCalls.length - beforePromote;
    expect(totalDrained).toBe(5);
  });
});
