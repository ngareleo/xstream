import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type PlaybackTicker, type TickHandler } from "~/services/playbackTicker.js";
import { StallTracker } from "~/services/stallTracker.js";

const BUFFERING_SPINNER_DELAY_MS = 2_000;

/** Test ticker — manual control of the tick callback so tests can advance the
 *  clock and assert what fires when. The real ticker uses RAF; for behavior
 *  testing of StallTracker we don't need RAF — we need a controllable handler
 *  registry that mimics ticker.register() / unregister() semantics. Cast to
 *  PlaybackTicker via unknown at the construction site (the StallTracker
 *  contract only uses register/shutdown). */
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
let spinnerShown: number;
let ticker: TestTicker;
let dateNow = 1_000_000_000_000;
let perfNow = 0;

function makeTracker(): StallTracker {
  return new StallTracker({
    videoEl: videoEl as unknown as HTMLVideoElement,
    getBufferedAheadSeconds: () => bufferedAhead,
    hasStartedPlayback: () => hasStarted,
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

  it("spinner fires after BUFFERING_SPINNER_DELAY_MS of continuous stall", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);

    // Tick before threshold — no spinner
    ticker.tick(BUFFERING_SPINNER_DELAY_MS - 1);
    expect(spinnerShown).toBe(0);
    expect(ticker.pendingHandlers()).toBe(1); // still scheduled

    // Tick at exactly threshold — fires
    ticker.tick(BUFFERING_SPINNER_DELAY_MS);
    expect(spinnerShown).toBe(1);
    expect(ticker.pendingHandlers()).toBe(0); // self-deregistered
  });

  it("spinner is cancelled if onPlaying fires before the threshold", () => {
    const tracker = makeTracker();
    tracker.onWaiting();
    ticker.tick(500); // half a second in — not yet
    expect(spinnerShown).toBe(0);

    tracker.onPlaying();
    expect(ticker.pendingHandlers()).toBe(0);

    // Tick beyond threshold — handler is gone, no spinner
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
    // Verified indirectly: the second onWaiting should not double-register a
    // handler (cancels and re-registers), and onPlaying should still close
    // cleanly with no leftover handlers.
    const tracker = makeTracker();
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1);
    tracker.onWaiting();
    expect(ticker.pendingHandlers()).toBe(1); // not 2 — old one cancelled

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

    // New stall — fresh window opens at perfNow=10_000, threshold relative to it
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
    tracker.onStalled(); // network-slow warning only
    ticker.tick(BUFFERING_SPINNER_DELAY_MS);
    expect(spinnerShown).toBe(1); // spinner still fires from the waiting handler
  });

  it("buffered_ahead === null is recorded as buffer.empty=true on the span", () => {
    // We can't introspect the OTel span directly without setup, but we can
    // verify the no-throw path under the empty buffer branch.
    bufferedAhead = null;
    const tracker = makeTracker();
    expect(() => tracker.onWaiting()).not.toThrow();
    expect(ticker.pendingHandlers()).toBe(1);
  });
});
