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
    priv.firstFrameRecorded = true;
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("playing");
  });

  it("restores playing status on seek-resume auto-resume (hasStartedPlayback=false, firstFrameRecorded=true)", () => {
    // Seek-resume bug: video element auto-resumes as soon as the new buffer
    // is available, firing DOM `playing` BEFORE tryPlay's startup-buffer
    // threshold is met. handleSeeking has reset hasStartedPlayback to false,
    // so the previous `&& hasStartedPlayback` guard kept status="loading"
    // for the whole startup-fill window — user saw spinner over playing
    // video. firstFrameRecorded persists across seeks (only reset on
    // resetForNewSession), so it correctly admits this case.
    const { controller } = makeController();
    const priv = controller as unknown as PrivateController;
    priv.isHandlingSeek = false;
    priv.hasStartedPlayback = false; // reset by handleSeeking
    priv.firstFrameRecorded = true; // set by cold-start tryPlay earlier in the session
    priv.status = "loading";

    priv.handlePlaying();

    expect(priv.status).toBe("playing");
  });

  it("does NOT restore playing status during cold-start before any frame has rendered", () => {
    // Cold-start, before tryPlay's threshold has been met. Video element is
    // paused (videoEl.play() not called yet), so no spurious DOM `playing`
    // event would actually fire — but if one did, status must remain
    // "loading" until the proper cold-start gate (tryPlay → onPlay).
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
    seekTarget: number | null;
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
    videoEl: HTMLVideoElement;
  } {
    const { controller, videoEl } = makeController({ currentTime });
    (videoEl as unknown as { currentTime: number; paused: boolean }).currentTime = currentTime;
    (videoEl as unknown as { paused: boolean }).paused = false;
    const priv = controller as unknown as SeekableController;
    priv.status = "playing";
    priv.hasStartedPlayback = true;
    const buf = makeFakeBuffer();
    priv.buffer = buf;
    priv.pipeline = makeFakePipeline();
    priv.timeline = { clearLookahead: vi.fn() };
    priv.chunkEnd = 900; // stale value from a prior chunk — must be reset on seek
    priv.startChunkSeries = vi.fn();
    return { controller, priv, buf, videoEl };
  }

  it("passes the user's intended seekTime to buf.seek (NOT a snapped chunk boundary)", () => {
    // The slider snap-back bug: clicking at 720s used to call buf.seek(600)
    // (the chunk boundary), which then set videoEl.currentTime = 600 and the
    // playhead visually jumped backward. Fix: pass seekTime so currentTime
    // stays at the user's intended position.
    const { controller, priv, buf } = setUpSeekable(720);

    controller.seekTo(720);
    priv.handleSeeking();

    expect(buf.seekCalls).toEqual([720]);
  });

  it("sets chunkEnd to the small seek-chunk window so RAF prefetch fires immediately", () => {
    // Pre-fix: chunkEnd was reset to 0 to gate out a stale prefetch race
    // (trace 5d5b5137…). Then chunkEnd was set to nextSnap synchronously,
    // which works but leaves the seek chunk up to 300s long. Now chunkEnd is
    // clamped to seekTime + FIRST_CHUNK_DURATION_S (capped by nextSnap) so
    // the prefetch RAF threshold (PREFETCH_THRESHOLD_S = 90) trips immediately
    // and a continuation chunk eager-warms ffmpeg in parallel.
    const { controller, priv } = setUpSeekable(1500);
    expect(priv.chunkEnd).toBe(900); // baseline: stale value from prior chunk

    controller.seekTo(1500);
    priv.handleSeeking();

    // seekChunkEnd = min(1500 + 30, nextSnap=1800, dur) = 1530
    expect(priv.chunkEnd).toBe(1530);
  });

  it("anchors the chunk REQUEST at seekTime — no longer snaps to chunk boundary", () => {
    // Inversion of the previous "snap-aligned cache key" assertion. The 300s
    // grid was forcing ffmpeg to encode segments 0..K-1 the user didn't need
    // before reaching their first useful one (16-60s wall-clock for fresh
    // 4K seeks, trace 9da5539d…). Now the chunk request anchors at seekTime
    // directly so ffmpeg's `-ss seekTime` produces the user's first segment
    // in ~1-2s. Continuation chunks return to the canonical grid.
    const { controller, priv, buf } = setUpSeekable(720);

    controller.seekTo(720);
    priv.handleSeeking();
    // Resolve the in-flight buf.seek so the .then() body fires.
    buf.resolveSeek();

    return Promise.resolve().then(() => {
      expect(priv.startChunkSeries).toHaveBeenCalledTimes(1);
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      // call args: (res, chunkStartS, buf, isFirstChunk, override)
      expect(call[1]).toBe(720); // chunkStartS = seekTime, not snapTime (600)
    });
  });

  it("anchors at seekTime even when it lands exactly on a chunk boundary", () => {
    // Edge case: with the +0.001 nudge in nextSnap derivation, a seek to
    // exactly 600 still produces a non-degenerate seek chunk
    // (NOT [600, 600) zero-length).
    const { controller, priv, buf } = setUpSeekable(600);

    controller.seekTo(600);
    priv.handleSeeking();
    buf.resolveSeek();

    return Promise.resolve().then(() => {
      const call = (priv.startChunkSeries as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toBe(600); // chunkStartS = seekTime
      // seekChunkEnd = min(600 + 30, nextSnap=900, dur) = 630
      expect(priv.chunkEnd).toBe(630);
    });
  });

  it("re-entrancy guard uses seekTime — distinct in-chunk seeks are NOT collapsed", () => {
    // Pre-fix the dedup compared against snapTime, which would silently let
    // two rapid in-chunk seeks both slip through (architect catch). Now the
    // guard uses seekTime — only the spurious second `seeking` event from
    // BufferManager.seek()'s own currentTime reassign is filtered out.
    const { controller, priv } = setUpSeekable(564.9);

    controller.seekTo(564.9);
    priv.handleSeeking();

    expect(priv.seekTarget).toBe(564.9); // not 300 (the old snapTime)
  });

  it("does NOT call videoEl.play() after seek when user was paused", async () => {
    // Pre-fix: handleSeeking's onPlay callback unconditionally called
    // videoEl.play(), auto-resuming a user who had intentionally paused
    // before seeking. Fix: respect videoEl.paused at onPlay time.
    const { controller, priv, buf, videoEl } = setUpSeekable(720);
    (videoEl as unknown as { paused: boolean }).paused = true; // user is paused

    controller.seekTo(720);
    priv.handleSeeking();
    buf.resolveSeek();
    // Yield so buf.seek().then() runs and waitForStartupBuffer wires up.
    await Promise.resolve();
    await Promise.resolve();

    // Drive tryPlay's threshold: STARTUP_BUFFER_S["240p"] = 2 (default).
    buf.bufferedAhead = 5;
    buf.triggerAppend();

    expect(videoEl.play).not.toHaveBeenCalled();
    expect(priv.status).toBe("playing"); // spinner still hides
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
});
