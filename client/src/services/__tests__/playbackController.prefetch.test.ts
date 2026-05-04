/**
 * Tests for the dual-gate prefetch policy on PlaybackController.
 *
 * Two gates control when chunk N+1's `startTranscode` mutation fires from
 * the prefetch RAF loop:
 *
 *   1. Serial primary — `foregroundTranscodeComplete` flips true when the
 *      `transcodeJobUpdated` subscription emits `status: COMPLETE` for the
 *      current foreground's job. This caps speculative parallelism at "one
 *      prefetched lookahead in flight at a time" so a seek can't queue
 *      behind an old prefetched chunk in the ffmpeg pool.
 *
 *   2. RAF safety net — `timeUntilEnd ≤ prefetchThresholdS` (90 s) keeps
 *      firing if the foreground's COMPLETE hasn't arrived yet but the
 *      playhead is about to catch the buffer. Catches the rare case where
 *      ffmpeg falls below realtime; preferred over hiding the regression
 *      behind the strict serial gate.
 *
 * The two gates are OR-combined inside the RAF body. Tests below exercise
 * each independently.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackController } from "~/services/playbackController.js";

// Stub rAF; we drive the loop manually via priv.ticker.tick().
beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    (
      globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }
    ).requestAnimationFrame = (): number => 0;
    (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
      (): void => {};
  }
});

interface FakePipeline {
  hasLookahead: () => boolean;
  openLookahead: ReturnType<typeof vi.fn>;
  pauseLookahead: ReturnType<typeof vi.fn>;
  cancel: () => void;
  setHasLookahead: (b: boolean) => void;
}

function makeFakePipeline(): FakePipeline {
  let hasLA = false;
  return {
    hasLookahead: (): boolean => hasLA,
    openLookahead: vi.fn(),
    pauseLookahead: vi.fn(),
    cancel: vi.fn(),
    setHasLookahead: (b: boolean): void => {
      hasLA = b;
    },
  };
}

interface FakeBuffer {
  getBufferedAheadSeconds: () => number | null;
  bufferedEnd: number;
}

interface FakeTicker {
  register: (cb: () => boolean) => () => void;
  tick: () => void;
}

function makeFakeTicker(): FakeTicker {
  const callbacks: Array<() => boolean> = [];
  return {
    register: (cb: () => boolean): (() => void) => {
      callbacks.push(cb);
      return (): void => {
        const idx = callbacks.indexOf(cb);
        if (idx >= 0) callbacks.splice(idx, 1);
      };
    },
    tick: (): void => {
      for (const cb of [...callbacks]) {
        const keep = cb();
        if (!keep) {
          const idx = callbacks.indexOf(cb);
          if (idx >= 0) callbacks.splice(idx, 1);
        }
      }
    },
  };
}

interface PrivateController {
  buffer: FakeBuffer | null;
  pipeline: FakePipeline;
  chunkEnd: number;
  prefetchFired: boolean;
  foregroundTranscodeComplete: boolean;
  foregroundJobId: string | null;
  ticker: FakeTicker;
  rampController: { reset: () => void; next: () => number };
  startPrefetchLoop: (res: string) => void;
  requestChunk: ReturnType<typeof vi.fn>;
}

function setupPrefetchHarness(currentTime: number): {
  controller: PlaybackController;
  priv: PrivateController;
  startTranscodeChunk: ReturnType<typeof vi.fn>;
} {
  const startTranscodeChunk = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve({ rawJobId: "next-job", globalJobId: "VHJh:next-job" })
    );
  const fakeVideo = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime,
  } as unknown as HTMLVideoElement;
  const controller = new PlaybackController(
    {
      videoEl: fakeVideo,
      getVideoId: () => "v-1",
      getVideoDurationS: () => 7200,
      startTranscodeChunk,
      cancelTranscodeChunks: vi.fn(),
      recordSession: vi.fn(),
    },
    { onStatusChange: vi.fn(), onError: vi.fn(), onJobCreated: vi.fn() }
  );
  const priv = controller as unknown as PrivateController;
  priv.buffer = {
    getBufferedAheadSeconds: () => 5,
    bufferedEnd: currentTime + 5,
  };
  priv.pipeline = makeFakePipeline();
  priv.ticker = makeFakeTicker();
  priv.requestChunk = vi.fn(() => Promise.resolve("next-job"));
  return { controller, priv, startTranscodeChunk };
}

describe("PlaybackController prefetch dual-gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  it("serial gate fires prefetch when foreground COMPLETE arrives well before threshold", () => {
    const { controller, priv } = setupPrefetchHarness(0);
    priv.chunkEnd = 1500;
    priv.foregroundJobId = "fg-job";

    priv.startPrefetchLoop("4k");
    priv.ticker.tick();
    expect(priv.prefetchFired).toBe(false);
    expect(priv.requestChunk).not.toHaveBeenCalled();

    controller.onTranscodeComplete("fg-job");
    expect(priv.foregroundTranscodeComplete).toBe(true);

    priv.ticker.tick();
    expect(priv.prefetchFired).toBe(true);
    expect(priv.requestChunk).toHaveBeenCalledTimes(1);
    const callArgs = (priv.requestChunk as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1]).toBe(1500);
    expect(callArgs[3]).toBe(true);
  });

  it("RAF safety net still fires when foreground hasn't completed yet", () => {
    // chunkEnd is close; timeUntilEnd ≤ 90s. No COMPLETE update — encode lags.
    const { priv } = setupPrefetchHarness(50);
    priv.chunkEnd = 60;
    priv.foregroundJobId = "fg-job";
    priv.foregroundTranscodeComplete = false;

    priv.startPrefetchLoop("4k");
    priv.ticker.tick();

    expect(priv.prefetchFired).toBe(true);
    expect(priv.requestChunk).toHaveBeenCalledTimes(1);
  });

  it("ignores stale COMPLETE updates for a previous chunk's job ID", () => {
    // Late-arriving COMPLETE for old job should not open gate.
    const { controller, priv } = setupPrefetchHarness(0);
    priv.chunkEnd = 1500;
    priv.foregroundJobId = "current-fg-job";

    controller.onTranscodeComplete("stale-prev-job");
    expect(priv.foregroundTranscodeComplete).toBe(false);

    priv.startPrefetchLoop("4k");
    priv.ticker.tick();

    expect(priv.prefetchFired).toBe(false);
    expect(priv.requestChunk).not.toHaveBeenCalled();
  });

  it("does not double-fire when both gates open in the same tick", () => {
    // prefetchFired guards against second mutation in same/next tick.
    const { controller, priv } = setupPrefetchHarness(50);
    priv.chunkEnd = 60;
    priv.foregroundJobId = "fg-job";

    controller.onTranscodeComplete("fg-job");
    priv.startPrefetchLoop("4k");
    priv.ticker.tick();
    priv.ticker.tick();
    priv.ticker.tick();

    expect(priv.requestChunk).toHaveBeenCalledTimes(1);
  });
});
