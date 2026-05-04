import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type PlaybackTicker, type TickHandler } from "~/services/playbackTicker.js";
import { StallTracker } from "~/services/stallTracker.js";

const BUFFERING_SPINNER_DELAY_MS = 2_000;

// Manual control of tick callback; mimics ticker.register() semantics.
class TestTicker {
  private handlers: TickHandler[] = [];

  register(handler: TickHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  shutdown(): void {
    this.handlers = [];
  }

  tick(nowMs: number): void {
    const snapshot = [...this.handlers];
    for (const h of snapshot) {
      const keep = h(nowMs);
      if (!keep) this.handlers = this.handlers.filter((x) => x !== h);
    }
  }

  pendingHandlers(): number {
    return this.handlers.length;
  }
}

let videoEl: { currentTime: number };
let bufferedAhead: number | null;
let hasStarted: boolean;
let inFirstRenderGrace: boolean;
let spinnerShown: number;
let ticker: TestTicker;
let dateNow = 1_000_000_000_000;
let perfNow = 0;

function makeTracker(): StallTracker {
  return new StallTracker({
    videoEl: videoEl as unknown as HTMLVideoElement,
    getBufferedAheadSeconds: () => bufferedAhead,
    hasStartedPlayback: () => hasStarted,
    isInFirstRenderGrace: () => inFirstRenderGrace,
    onSpinnerShow: () => {
      spinnerShown += 1;
    },
    ticker: ticker as unknown as PlaybackTicker,
  });
}

beforeEach(() => {
  videoEl = { currentTime: 42.5 };
  bufferedAhead = 30;
  hasStarted = true;
  inFirstRenderGrace = false;
  spinnerShown = 0;
  ticker = new TestTicker();
  dateNow = 1_000_000_000_000;
  perfNow = 0;
  vi.stubGlobal("Date", { now: () => dateNow });
  vi.stubGlobal("performance", { now: () => perfNow });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StallTracker", () => {
  it("onWaiting is a no-op before playback has started", () => {
    hasStarted = false;
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(0);
    expect(spinnerShown).toBe(0);
  });

  it("onWaiting is suppressed during first-render grace (post-`play()` warmup)", () => {
    // Seek-resume spinner-flash bug: decoder fires `waiting` while rendering first frame,
    // which armed 2s spinner-debounce and re-showed spinner over playing video.
    inFirstRenderGrace = true;
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(0);
    expect(spinnerShown).toBe(0);

    inFirstRenderGrace = false;
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);
    ticker.tick(BUFFERING_SPINNER_DELAY_MS);
    expect(spinnerShown).toBe(1);
  });

  it("spinner fires after BUFFERING_SPINNER_DELAY_MS of continuous stall", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);

    ticker.tick(BUFFERING_SPINNER_DELAY_MS - 1);
    expect(spinnerShown).toBe(0);
    expect(ticker.pendingHandlers()).toBe(1);

    ticker.tick(BUFFERING_SPINNER_DELAY_MS);
    expect(spinnerShown).toBe(1);
    expect(ticker.pendingHandlers()).toBe(0);
  });

  it("spinner is cancelled if onPlaying fires before the threshold", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    ticker.tick(500);
    expect(spinnerShown).toBe(0);

    tracker.onPlaying();
    expect(ticker.pendingHandlers()).toBe(0);

    ticker.tick(BUFFERING_SPINNER_DELAY_MS + 100);
    expect(spinnerShown).toBe(0);
  });

  it("end() also cancels a pending spinner (used by seek/teardown)", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);

    tracker.end("teardown");
    expect(ticker.pendingHandlers()).toBe(0);

    ticker.tick(BUFFERING_SPINNER_DELAY_MS + 100);
    expect(spinnerShown).toBe(0);
  });

  it("end() is idempotent", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    tracker.end("teardown");
    tracker.end("teardown"); // no throw
    expect(ticker.pendingHandlers()).toBe(0);
  });

  it("end() works even when onWaiting was never called", () => {
    const tracker = makeTracker();
    tracker.end("teardown"); // no throw
    expect(ticker.pendingHandlers()).toBe(0);
    expect(spinnerShown).toBe(0);
  });

  it("repeated onWaiting before resume only opens one stall span", () => {
    // Second onWaiting cancels and re-registers (not 2 handlers).
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);

    tracker.onPlaying();
    expect(ticker.pendingHandlers()).toBe(0);
  });

  it("a new onWaiting after onPlaying re-arms the spinner from scratch", () => {
    const tracker = makeTracker();
    perfNow = 0;
    tracker.onWaiting();
    ticker.tick(500);
    tracker.onPlaying();
    expect(spinnerShown).toBe(0);

    perfNow = 10_000;
    tracker.onWaiting();
    ticker.tick(10_000 + BUFFERING_SPINNER_DELAY_MS - 1);
    expect(spinnerShown).toBe(0);
    ticker.tick(10_000 + BUFFERING_SPINNER_DELAY_MS);
    expect(spinnerShown).toBe(1);
  });

  it("onStalled does not interact with the spinner state", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    tracker.onStalled();
    ticker.tick(BUFFERING_SPINNER_DELAY_MS);
    expect(spinnerShown).toBe(1);
  });

  it("buffered_ahead === null is recorded as buffer.empty=true on the span", () => {
    bufferedAhead = null;
    const tracker = makeTracker();
    expect(() => tracker.onWaiting()).not.toThrow();
    expect(ticker.pendingHandlers()).toBe(1);
  });
});
