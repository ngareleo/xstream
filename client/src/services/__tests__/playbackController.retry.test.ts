/**
 * Tests for `PlaybackController.requestChunk()`'s retry policy. Mocks
 * `startTranscodeChunk` to return typed `PlaybackError` rejections and
 * verifies the orchestration-level retry contract:
 *
 *  - Retryable rejections are retried up to MAX_RECOVERY_ATTEMPTS with
 *    `retryAfterMs` honoured (when present).
 *  - Non-retryable rejections short-circuit immediately.
 *  - The final outcome reaches the consumer either as a successful chunk
 *    or as the original PlaybackError after attempts exhausted.
 *
 * We exercise the retry loop directly via `runStartChunkWithRetry` (made
 * accessible by typecasting the controller). This keeps the test focused
 * on the retry semantics and avoids the MSE / DOM scaffolding the full
 * controller pipeline needs.
 */
import { describe, expect, it, vi } from "vitest";

import { PlaybackController } from "~/services/playbackController.js";
import { PlaybackError } from "~/services/playbackErrors.js";

interface RetryHarness {
  controller: PlaybackController;
  startTranscodeChunk: ReturnType<typeof vi.fn>;
}

function makeHarness(): RetryHarness {
  const startTranscodeChunk = vi.fn();
  const fakeVideo = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLVideoElement;
  const controller = new PlaybackController(
    {
      videoEl: fakeVideo,
      getVideoId: () => "video-1",
      getVideoDurationS: () => 1800,
      startTranscodeChunk,
      cancelTranscodeChunks: vi.fn(),
      recordSession: vi.fn(),
    },
    {
      onStatusChange: vi.fn(),
      onError: vi.fn(),
      onJobCreated: vi.fn(),
    }
  );
  return { controller, startTranscodeChunk };
}

interface RetryEntryPoint {
  runStartChunkWithRetry: (
    res: string,
    startS: number,
    endS: number,
    span: { addEvent: (name: string, attrs?: Record<string, unknown>) => void }
  ) => Promise<{ rawJobId: string; globalJobId: string }>;
}

function privateRetry(controller: PlaybackController): RetryEntryPoint {
  return controller as unknown as RetryEntryPoint;
}

interface FakeSpan {
  addEvent: (name: string, attrs?: Record<string, unknown>) => void;
  events: string[];
}

function fakeSpan(): FakeSpan {
  const events: string[] = [];
  return {
    addEvent: (name: string): void => {
      events.push(name);
    },
    events,
  };
}

// Real timers + tiny backoff to avoid fake-timer unhandled-rejection noise.
const TINY_BACKOFF_MS = 5;

describe("PlaybackController retry policy", () => {
  it("retries CAPACITY_EXHAUSTED twice then succeeds", async () => {
    const { controller, startTranscodeChunk } = makeHarness();
    const transient = (): PlaybackError =>
      new PlaybackError({
        code: "CAPACITY_EXHAUSTED",
        message: "cap",
        retryable: true,
        retryAfterMs: TINY_BACKOFF_MS,
      });
    startTranscodeChunk
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(transient())
      .mockResolvedValueOnce({ rawJobId: "abc", globalJobId: "VHJh" });

    const span = fakeSpan();
    const result = await privateRetry(controller).runStartChunkWithRetry("1080p", 0, 300, span);

    expect(result).toEqual({ rawJobId: "abc", globalJobId: "VHJh" });
    expect(startTranscodeChunk).toHaveBeenCalledTimes(3);
    expect(span.events.filter((e) => e === "playback.recovery_attempt")).toHaveLength(2);
    expect(span.events).not.toContain("recovery.outcome");
  });

  it("propagates VIDEO_NOT_FOUND immediately without retrying", async () => {
    const { controller, startTranscodeChunk } = makeHarness();
    startTranscodeChunk.mockRejectedValueOnce(
      new PlaybackError({
        code: "VIDEO_NOT_FOUND",
        message: "missing",
        retryable: false,
        retryAfterMs: null,
      })
    );

    const span = fakeSpan();
    await expect(
      privateRetry(controller).runStartChunkWithRetry("1080p", 0, 300, span)
    ).rejects.toMatchObject({ code: "VIDEO_NOT_FOUND" });
    expect(startTranscodeChunk).toHaveBeenCalledTimes(1);
    expect(span.events).toContain("recovery.outcome");
    expect(span.events).not.toContain("playback.recovery_attempt");
  });

  it("gives up after MAX_RECOVERY_ATTEMPTS retryable failures", async () => {
    const { controller, startTranscodeChunk } = makeHarness();
    const transient = (): PlaybackError =>
      new PlaybackError({
        code: "CAPACITY_EXHAUSTED",
        message: "cap",
        retryable: true,
        retryAfterMs: TINY_BACKOFF_MS,
      });
    startTranscodeChunk
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(transient())
      .mockRejectedValueOnce(transient());

    const span = fakeSpan();
    await expect(
      privateRetry(controller).runStartChunkWithRetry("1080p", 0, 300, span)
    ).rejects.toMatchObject({ code: "CAPACITY_EXHAUSTED" });
    expect(startTranscodeChunk).toHaveBeenCalledTimes(3);
    expect(span.events.filter((e) => e === "playback.recovery_attempt")).toHaveLength(2);
    expect(span.events).toContain("recovery.outcome");
  });
});

interface PrivateRecovery {
  mseRecreatesRemaining: number;
  handleMseDetached: (res: string) => void;
}

describe("PlaybackController MSE recovery", () => {
  it("surfaces fatal MSE_DETACHED error when recreate budget is exhausted", () => {
    // Budget-exhausted branch only; 4th detach in session must fail fast.
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    const controller = new PlaybackController(
      {
        videoEl: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          currentTime: 425,
        } as unknown as HTMLVideoElement,
        getVideoId: () => "v-1",
        getVideoDurationS: () => 1800,
        startTranscodeChunk: vi.fn(),
        cancelTranscodeChunks: vi.fn(),
        recordSession: vi.fn(),
      },
      { onStatusChange, onError, onJobCreated: vi.fn() }
    );
    const priv = controller as unknown as PrivateRecovery;
    priv.mseRecreatesRemaining = 0;

    priv.handleMseDetached("4k");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/MSE_DETACHED/);
    expect(onStatusChange).toHaveBeenCalledWith("idle");
  });
});
