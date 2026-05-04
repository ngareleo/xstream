/**
 * Tests for the seek + spinner + user-pause wiring on PlaybackController.
 * Covers three fixes that landed together:
 *
 *   - waitForStartupBuffer must compare buffered-AHEAD-of-currentTime, not
 *     absolute bufferedEnd, so a seek to 600s that lands a single 2s segment
 *     does NOT trivially satisfy a 5s startup target and trigger an immediate
 *     stall (Change B).
 *   - handleSeeking must reset hasStartedPlayback synchronously, before the
 *     buf.seek().then() runs, so a residual `playing` event fired by the
 *     pre-flush playhead does not flip status back to "playing" via
 *     handlePlaying (Change A).
 *   - handlePlaying must short-circuit while a seek is in flight — defence
 *     in depth against any other code path that fires `playing` mid-seek.
 *   - User pause/play wires a 1s poller (via setInterval) so backpressure
 *     ticks while `timeupdate` is silent (Change D V1).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackController } from "~/services/playbackController.js";

// vitest's `environment: node` lacks rAF, but PlaybackTicker references it
// inside `register`. Stub once here — the rAF body is never under test.
beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame === "undefined") {
    (
      globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }
    ).requestAnimationFrame = (): number => 0;
    (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
      (): void => {};
  }
});

interface FakeBuffer {
  bufferedEnd: number;
  bufferedAhead: number | null;
  setAfterAppend: (cb: (() => void) | null) => void;
  getBufferedAheadSeconds: (t: number) => number | null;
  tickBackpressure: () => void;
  triggerAppend: () => void;
  seek: (timeSeconds: number) => Promise<void>;
  seekCalls: number[];
  resolveSeek: () => void;
}

interface FakePipeline {
  hasLookahead: () => boolean;
  resumeLookahead: () => void;
  cancel: (reason: string) => void;
  cancelCalls: string[];
  currentJobIds: () => string[];
  setJobIds: (ids: string[]) => void;
}

interface FakeTimeline {
  clearLookahead: () => void;
}

interface PrivateController {
  buffer: FakeBuffer | null;
  pipeline: FakePipeline | { hasLookahead: () => boolean; resumeLookahead: () => void } | null;
  hasStartedPlayback: boolean;
  firstFrameRecorded: boolean;
  isHandlingSeek: boolean;
  status: "idle" | "loading" | "playing";
  userPauseInterval: ReturnType<typeof setInterval> | null;
  userPausePrefetchFired: boolean;
  chunkEnd: number;
  resolution: string;
  timeline: FakeTimeline;
  waitForStartupBuffer: (buffer: FakeBuffer, target: number, onPlay: () => void) => void;
  handlePlaying: () => void;
  handleUserPause: () => void;
  handleUserPlay: () => void;
  startChunkSeries: (res: string, startS: number, buffer: FakeBuffer, isFirst: boolean) => void;
}

function makeFakePipeline(): FakePipeline {
  const cancelCalls: string[] = [];
  let jobIds: string[] = [];
  return {
    hasLookahead: () => false,
    resumeLookahead: vi.fn(),
    cancel: (reason: string): void => {
      cancelCalls.push(reason);
    },
    cancelCalls,
    currentJobIds: (): string[] => jobIds,
    setJobIds: (ids: string[]): void => {
      jobIds = ids;
    },
  };
}

function makeFakeBuffer(): FakeBuffer {
  let appendCb: (() => void) | null = null;
  let seekResolve: (() => void) | null = null;
  const seekCalls: number[] = [];
  const buf: FakeBuffer = {
    bufferedEnd: 0,
    bufferedAhead: null,
    setAfterAppend: (cb): void => {
      appendCb = cb;
    },
    getBufferedAheadSeconds: (): number | null => buf.bufferedAhead,
    tickBackpressure: vi.fn(),
    triggerAppend: (): void => appendCb?.(),
    seek: (t: number): Promise<void> => {
      seekCalls.push(t);
      return new Promise<void>((resolve) => {
        seekResolve = resolve;
      });
    },
    seekCalls,
    resolveSeek: (): void => seekResolve?.(),
  };
  return buf;
}

function makeController(opts?: {
  currentTime?: number;
  durationS?: number;
  cancelTranscodeChunks?: ReturnType<typeof vi.fn>;
}): {
  controller: PlaybackController;
  videoEl: HTMLVideoElement;
  cancelTranscodeChunks: ReturnType<typeof vi.fn>;
} {
  const videoEl = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime: opts?.currentTime ?? 0,
    ended: false,
    // handleSeeking iterates videoEl.buffered to detect already-buffered seek
    // targets. Empty TimeRanges-shaped object means "nothing buffered" so the
    // seek path always proceeds (which is what we want when testing it).
    buffered: { length: 0, start: () => 0, end: () => 0 },
    play: vi.fn().mockResolvedValue(undefined),
  } as unknown as HTMLVideoElement;
  const cancelTranscodeChunks = opts?.cancelTranscodeChunks ?? vi.fn();
  const controller = new PlaybackController(
    {
      videoEl,
      getVideoId: () => "v-1",
      getVideoDurationS: () => opts?.durationS ?? 1800,
      startTranscodeChunk: vi.fn(),
      cancelTranscodeChunks: cancelTranscodeChunks as (jobIds: readonly string[]) => void,
      recordSession: vi.fn(),
    },
    {
      onStatusChange: vi.fn(),
      onError: vi.fn(),
      onJobCreated: vi.fn(),
    }
  );
  return { controller, videoEl, cancelTranscodeChunks };
}

describe("PlaybackController.waitForStartupBuffer (post-seek stall fix)", () => {
  it("does NOT fire onPlay when bufferedAhead < target, even if absolute bufferedEnd is large", () => {
    // Previous code compared bufferedEnd >= target; after a seek to 600,
    // bufferedEnd≈602 (≥5) but buffered-ahead is only ~2s, causing immediate stall.
    const { controller, videoEl } = makeController({ currentTime: 600 });
    (videoEl as unknown as { currentTime: number }).currentTime = 600;
    const onPlay = vi.fn();
    const buf = makeFakeBuffer();
    buf.bufferedEnd = 602;
    buf.bufferedAhead = 2;

    (controller as unknown as PrivateController).waitForStartupBuffer(buf, 5, onPlay);
    buf.triggerAppend();

    expect(onPlay).not.toHaveBeenCalled();
  });

  it("fires onPlay once bufferedAhead crosses target", () => {
    const { controller, videoEl } = makeController({ currentTime: 600 });
    (videoEl as unknown as { currentTime: number }).currentTime = 600;
    const onPlay = vi.fn();
    const buf = makeFakeBuffer();
    buf.bufferedEnd = 605;
    buf.bufferedAhead = 5; // exactly at target

    (controller as unknown as PrivateController).waitForStartupBuffer(buf, 5, onPlay);
    buf.triggerAppend();

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPlay when bufferedAhead is null (empty buffer)", () => {
    const { controller } = makeController({ currentTime: 0 });
    const onPlay = vi.fn();
    const buf = makeFakeBuffer();
    buf.bufferedAhead = null;

    (controller as unknown as PrivateController).waitForStartupBuffer(buf, 2, onPlay);
    buf.triggerAppend();

    expect(onPlay).not.toHaveBeenCalled();
  });
});

describe("PlaybackController.handlePlaying (spinner-race fix)", () => {
  it("returns early while isHandlingSeek is true, leaving status unchanged", () => {
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.isHandlingSeek = true;
    priv.hasStartedPlayback = true;
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("loading"); // would have been flipped to "playing" without guard
  });

  it("restores playing status when not seeking and playback has started", () => {
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.isHandlingSeek = false;
    priv.hasStartedPlayback = true;
    priv.firstFrameRecorded = true;
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("playing");
  });

  it("restores playing status on seek-resume auto-resume (hasStartedPlayback=false, firstFrameRecorded=true)", () => {
    // Video element auto-resumes firing DOM `playing` before tryPlay's startup-buffer
    // threshold; handleSeeking resets hasStartedPlayback=false. The old guard would keep
    // status="loading" for the startup window. firstFrameRecorded persists across seeks
    // and correctly admits this case.
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.isHandlingSeek = false;
    priv.hasStartedPlayback = false;
    priv.firstFrameRecorded = true;
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("playing");
  });

  it("does NOT restore playing status during cold-start before any frame has rendered", () => {
    // Before tryPlay's threshold; status must remain "loading" until the proper
    // cold-start gate (tryPlay → onPlay).
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.isHandlingSeek = false;
    priv.hasStartedPlayback = false;
    priv.firstFrameRecorded = false;
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("loading");
  });
});

describe("PlaybackController user-pause poller (Change D V1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("handleUserPause is a no-op until playback has started", () => {
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.hasStartedPlayback = false;
    priv.buffer = makeFakeBuffer();

    priv.handleUserPause();

    expect(priv.userPauseInterval).toBeNull();
  });

  it("handleUserPause schedules a 1s interval and ticks backpressure once immediately", () => {
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.hasStartedPlayback = true;
    const buf = makeFakeBuffer();
    priv.buffer = buf;
    priv.pipeline = { hasLookahead: () => false, resumeLookahead: vi.fn() };
    priv.chunkEnd = 0;

    priv.handleUserPause();

    expect(priv.userPauseInterval).not.toBeNull();
    // Immediate tick synchronously before the 1s interval fires.
    expect(buf.tickBackpressure).toHaveBeenCalledTimes(1);
  });

  it("handleUserPlay clears the interval and resumes the lookahead", () => {
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.hasStartedPlayback = true;
    priv.buffer = makeFakeBuffer();
    const resumeLookahead = vi.fn();
    priv.pipeline = { hasLookahead: () => false, resumeLookahead };

    priv.handleUserPause();
    expect(priv.userPauseInterval).not.toBeNull();

    priv.handleUserPlay();

    expect(priv.userPauseInterval).toBeNull();
    expect(priv.userPausePrefetchFired).toBe(false);
    expect(resumeLookahead).toHaveBeenCalledTimes(1);
  });

  it("handleUserPause does not stack multiple intervals when called twice", () => {
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.hasStartedPlayback = true;
    priv.buffer = makeFakeBuffer();
    priv.pipeline = { hasLookahead: () => false, resumeLookahead: vi.fn() };

    priv.handleUserPause();
    const first = priv.userPauseInterval;
    priv.handleUserPause();
    expect(priv.userPauseInterval).toBe(first);
  });
});

describe("PlaybackController.handleSeeking (slider snap-back + stale-prefetch fixes)", () => {
  // handleSeeking is private; we extract via type-cast and need the augmented
  // PrivateController shape with pipeline.cancel + timeline.clearLookahead.
  interface SeekableController {
    handleSeeking: () => void;
    seekTo: (t: number) => void;
    chunkEnd: number;
    seekTarget: number | null;
    status: "idle" | "loading" | "playing";
    hasStartedPlayback: boolean;
    isHandlingSeek: boolean;
    buffer: FakeBuffer | null;
    pipeline: FakePipeline;
    timeline: FakeTimeline;
    startChunkSeries: (res: string, startS: number, buffer: FakeBuffer, isFirst: boolean) => void;
  }

  function setUpSeekable(currentTime: number): {
    controller: PlaybackController;
    priv: SeekableController;
    buf: FakeBuffer;
    videoEl: HTMLVideoElement;
    cancelTranscodeChunks: ReturnType<typeof vi.fn>;
  } {
    const { controller, videoEl, cancelTranscodeChunks } = makeController({ currentTime });
    (videoEl as unknown as { currentTime: number; paused: boolean }).currentTime = currentTime;
    (videoEl as unknown as { paused: boolean }).paused = false;
    const priv = controller as unknown as SeekableController;
    priv.status = "playing";
    priv.hasStartedPlayback = true;
    const buf = makeFakeBuffer();
    priv.buffer = buf;
    priv.pipeline = makeFakePipeline();
    priv.timeline = { clearLookahead: vi.fn() };
    // stale value from a prior chunk — must be reset on seek
    priv.chunkEnd = 900;
    priv.startChunkSeries = vi.fn();
    return { controller, priv, buf, videoEl, cancelTranscodeChunks };
  }

  it("passes the user's intended seekTime to buf.seek (NOT a snapped chunk boundary)", () => {
    // Previous code snapped to chunk boundaries (buf.seek(600) when user clicked 720),
    // causing visual snap-back. Fix: pass seekTime directly.
    const { controller, priv, buf } = setUpSeekable(720);

    controller.seekTo(720);
    priv.handleSeeking();

    expect(buf.seekCalls).toEqual([720]);
  });

  it("sets chunkEnd to the ramp[0] seek-chunk window so RAF prefetch fires immediately", () => {
    // chunkEnd was reset to 0 to gate stale prefetch races (see trace 5d5b5137).
    // Now set to seekTime + ramp[0] so prefetch threshold trips immediately.
    const { controller, priv } = setUpSeekable(1500);
    expect(priv.chunkEnd).toBe(900);

    controller.seekTo(1500);
    priv.handleSeeking();

    expect(priv.chunkEnd).toBe(1510);
  });

  it("anchors the chunk REQUEST at seekTime — no chunk-grid snapping", () => {
    // The old 300s grid forced ffmpeg to encode segments 0..K-1 before reaching
    // the first useful one (16-60s wall-clock for fresh 4K seeks, see trace 9da5539d).
    const { controller, priv, buf } = setUpSeekable(720);

    controller.seekTo(720);
    priv.handleSeeking();
    buf.resolveSeek();

    return Promise.resolve().then(() => {
      expect(priv.startChunkSeries).toHaveBeenCalledTimes(1);
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toBe(720);
    });
  });

  it("anchors at seekTime even when it lands exactly on a chunk-multiple", () => {
    // Round-number seeks still produce non-degenerate chunks; no chunk boundary pitfall.
    const { controller, priv, buf } = setUpSeekable(600);

    controller.seekTo(600);
    priv.handleSeeking();
    buf.resolveSeek();

    return Promise.resolve().then(() => {
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toBe(600);
      expect(priv.chunkEnd).toBe(610);
    });
  });

  it("re-entrancy guard uses seekTime — distinct in-chunk seeks are NOT collapsed", () => {
    // Old dedup against snapTime let two rapid in-chunk seeks both slip through.
    // Guard now uses seekTime, filtering only the spurious second `seeking` event.
    const { controller, priv } = setUpSeekable(564.9);

    controller.seekTo(564.9);
    priv.handleSeeking();

    expect(priv.seekTarget).toBe(564.9);
  });

  it("does NOT call videoEl.play() after seek when user was paused", async () => {
    // Old code unconditionally called videoEl.play(), auto-resuming paused users.
    // Fix: respect videoEl.paused at onPlay time.
    const { controller, priv, buf, videoEl } = setUpSeekable(720);
    (videoEl as unknown as { paused: boolean }).paused = true;

    controller.seekTo(720);
    priv.handleSeeking();
    buf.resolveSeek();
    await Promise.resolve();
    await Promise.resolve();

    buf.bufferedAhead = 5;
    buf.triggerAppend();

    expect(videoEl.play).not.toHaveBeenCalled();
    expect(priv.status).toBe("playing");
  });

  it("DOES call videoEl.play() after seek when user was playing", async () => {
    const { controller, priv, buf, videoEl } = setUpSeekable(720);
    (videoEl as unknown as { paused: boolean }).paused = false; // user is playing

    controller.seekTo(720);
    priv.handleSeeking();
    buf.resolveSeek();
    await Promise.resolve();
    await Promise.resolve();

    buf.bufferedAhead = 5;
    buf.triggerAppend();

    expect(videoEl.play).toHaveBeenCalledTimes(1);
    expect(priv.status).toBe("playing");
  });

  it("fires cancelTranscodeChunks for the active foreground+lookahead before flushing", () => {
    // Old code queued seeks ~1.2s waiting for ffmpeg slots; old jobs kept running.
    // Cancel drops semaphore synchronously, freeing slots in <50ms (see trace 6f0ef574).
    const { controller, priv, cancelTranscodeChunks } = setUpSeekable(720);
    (priv.pipeline as FakePipeline).setJobIds(["job-fg", "job-la"]);

    controller.seekTo(720);
    priv.handleSeeking();

    expect(cancelTranscodeChunks).toHaveBeenCalledTimes(1);
    expect(cancelTranscodeChunks).toHaveBeenCalledWith(["job-fg", "job-la"]);
  });

  it("does NOT call cancelTranscodeChunks when no jobs are active", () => {
    // User seeks before first chunk mutation resolves (rare during cold-start).
    const { controller, priv, cancelTranscodeChunks } = setUpSeekable(720);
    (priv.pipeline as FakePipeline).setJobIds([]);

    controller.seekTo(720);
    priv.handleSeeking();

    expect(cancelTranscodeChunks).not.toHaveBeenCalled();
  });
});
