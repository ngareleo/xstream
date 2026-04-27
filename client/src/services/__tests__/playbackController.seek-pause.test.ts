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
// inside `register`. Stub once here — every test in this file uses the
// controller's ticker only as a side-channel; the rAF body is never the
// thing under test.
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
  // The afterAppend callback the controller registers — exposed so tests can
  // simulate "a segment was just appended" without spinning a real timer.
  triggerAppend: () => void;
  // Seek call site is what the snap-back test asserts against. The fake
  // returns a Promise that resolves when `resolveSeek` is called, so tests
  // can inspect controller state both before and after the .then runs.
  seek: (timeSeconds: number) => Promise<void>;
  seekCalls: number[];
  resolveSeek: () => void;
}

interface FakePipeline {
  hasLookahead: () => boolean;
  resumeLookahead: () => void;
  cancel: (reason: string) => void;
  cancelCalls: string[];
}

interface FakeTimeline {
  clearLookahead: () => void;
}

interface PrivateController {
  buffer: FakeBuffer | null;
  pipeline: FakePipeline | { hasLookahead: () => boolean; resumeLookahead: () => void } | null;
  hasStartedPlayback: boolean;
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
  return {
    hasLookahead: () => false,
    resumeLookahead: vi.fn(),
    cancel: (reason: string): void => {
      cancelCalls.push(reason);
    },
    cancelCalls,
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

function makeController(opts?: { currentTime?: number; durationS?: number }): {
  controller: PlaybackController;
  videoEl: HTMLVideoElement;
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
  const controller = new PlaybackController(
    {
      videoEl,
      getVideoId: () => "v-1",
      getVideoDurationS: () => opts?.durationS ?? 1800,
      startTranscodeChunk: vi.fn(),
      recordSession: vi.fn(),
    },
    {
      onStatusChange: vi.fn(),
      onError: vi.fn(),
      onJobCreated: vi.fn(),
    }
  );
  return { controller, videoEl };
}

describe("PlaybackController.waitForStartupBuffer (post-seek stall fix)", () => {
  it("does NOT fire onPlay when bufferedAhead < target, even if absolute bufferedEnd is large", () => {
    // The bug: previous code compared `bufferedEnd >= target`. After a seek
    // to currentTime=600, the first segment lands at PTS≈600 making
    // bufferedEnd≈602 — trivially >= 5. video.play() fires with only ~2s
    // of data ahead and immediately stalls. The fix uses buffered-ahead.
    const { controller, videoEl } = makeController({ currentTime: 600 });
    (videoEl as unknown as { currentTime: number }).currentTime = 600;
    const onPlay = vi.fn();
    const buf = makeFakeBuffer();
    buf.bufferedEnd = 602; // absolute — would have passed old check
    buf.bufferedAhead = 2; // ahead of currentTime — fails new check (target=5)

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
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("playing");
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
    priv.chunkEnd = 0; // no next chunk → prefetch path bails

    priv.handleUserPause();

    expect(priv.userPauseInterval).not.toBeNull();
    // Immediate-tick contract: tickBackpressure called synchronously, so the
    // first check happens BEFORE the 1s interval fires.
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
  // handleSeeking is private; pull it via the same type-cast trick used for
  // other handlers. Defined here because it depends on the augmented
  // PrivateController shape with pipeline.cancel + timeline.clearLookahead.
  interface SeekableController {
    handleSeeking: () => void;
    seekTo: (t: number) => void;
    chunkEnd: number;
    status: "idle" | "loading" | "playing";
    hasStartedPlayback: boolean;
    isHandlingSeek: boolean;
    buffer: FakeBuffer | null;
    pipeline: FakePipeline;
    timeline: FakeTimeline;
    // We stub startChunkSeries so the test doesn't need a live ChunkPipeline
    // or `requestChunk` mock — we're only asserting state at the seek-handler
    // level, not the full chunk flow.
    startChunkSeries: (res: string, startS: number, buffer: FakeBuffer, isFirst: boolean) => void;
  }

  function setUpSeekable(currentTime: number): {
    controller: PlaybackController;
    priv: SeekableController;
    buf: FakeBuffer;
  } {
    const { controller, videoEl } = makeController({ currentTime });
    (videoEl as unknown as { currentTime: number }).currentTime = currentTime;
    const priv = controller as unknown as SeekableController;
    priv.status = "playing";
    priv.hasStartedPlayback = true;
    const buf = makeFakeBuffer();
    priv.buffer = buf;
    priv.pipeline = makeFakePipeline();
    priv.timeline = { clearLookahead: vi.fn() };
    priv.chunkEnd = 900; // stale value from a prior chunk — must be reset on seek
    priv.startChunkSeries = vi.fn();
    return { controller, priv, buf };
  }

  it("passes the user's intended seekTime to buf.seek (NOT the snapped chunk boundary)", () => {
    // The slider snap-back bug: clicking at 720s used to call buf.seek(600)
    // (the chunk boundary), which then set videoEl.currentTime = 600 and the
    // playhead visually jumped backward. Fix: pass seekTime so currentTime
    // stays at the user's intended position.
    const { controller, priv, buf } = setUpSeekable(720);

    controller.seekTo(720);
    priv.handleSeeking();

    expect(buf.seekCalls).toEqual([720]);
    // The chunk REQUEST still uses snapTime — that assertion lives in the
    // companion test below (must wait for buf.seek's .then to fire).
  });

  it("invalidates chunkEnd before buf.seek so RAF prefetch can't fire stale", () => {
    // Trace 5d5b5137… caught the regression: prefetchFired was reset to false
    // synchronously, but chunkEnd was only updated INSIDE the buf.seek().then.
    // RAF could fire between, prefetch the OLD chunk against the NEW
    // currentTime, and request chunk [900, 1200] while the seek was to 1500.
    const { controller, priv } = setUpSeekable(1500);
    expect(priv.chunkEnd).toBe(900); // baseline: stale value from prior chunk

    controller.seekTo(1500);
    priv.handleSeeking();

    // Synchronously after handleSeeking returns, chunkEnd is 0. The RAF
    // prefetch loop's gate (`chunkEnd > 0 && chunkEnd < videoDurationS`) now
    // bails until startChunkSeries restores it inside the .then().
    expect(priv.chunkEnd).toBe(0);
  });

  it("passes the snapped chunk boundary to startChunkSeries (server cache key unchanged)", () => {
    // Companion to the snap-back test — the chunk REQUEST must keep using
    // snapTime so the server's job-cache key (sha1 of contentKey|res|start|end)
    // matches across seeks within the same chunk window.
    const { controller, priv, buf } = setUpSeekable(720);

    controller.seekTo(720);
    priv.handleSeeking();
    // Resolve the in-flight buf.seek so the .then() body fires.
    buf.resolveSeek();

    // Wait one microtask for the .then to run, then assert.
    return Promise.resolve().then(() => {
      expect(priv.startChunkSeries).toHaveBeenCalledTimes(1);
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toBe(600); // snapTime, not seekTime
    });
  });

  it("computes fromIndex = floor((seekTime - snapTime) / SEGMENT_DURATION_S) for mid-chunk seeks", () => {
    // Trace 941c2a50… caught the perf bug: seek to 564.9 in chunk [300, 600]
    // streamed 132 segments (PTS 300..564) that Chrome auto-evicted because
    // they landed BEHIND currentTime in the same SourceBuffer (mode=segments
    // places them at their PTS). Fix: skip those segments server-side via
    // ?from=K. Each segment is SEGMENT_DURATION_S (=2s), so K = floor(264.9/2).
    const { controller, priv, buf } = setUpSeekable(564.9);

    controller.seekTo(564.9);
    priv.handleSeeking();
    buf.resolveSeek();

    return Promise.resolve().then(() => {
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      // call args: (res, snapTime, buf, isFirstChunk, fromIndex)
      const fromIndex = call[4];
      expect(fromIndex).toBe(132); // floor((564.9 - 300) / 2)
    });
  });

  it("fromIndex is 0 when seekTime exactly hits a chunk boundary", () => {
    const { controller, priv, buf } = setUpSeekable(600);

    controller.seekTo(600);
    priv.handleSeeking();
    buf.resolveSeek();

    return Promise.resolve().then(() => {
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toBe(600); // snapTime
      expect(call[4]).toBe(0); // fromIndex
    });
  });
});
