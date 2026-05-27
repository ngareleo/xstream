import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clientConfig } from "~/config/appConfig.js";
import {
  getCurrentSessionId,
  initUserSession,
  noteActivity,
  setPlaybackActive,
  teardownUserSession,
} from "~/services/userSession.js";

const IDLE_TIMEOUT_MS = clientConfig.session.idleTimeoutMs;

// Coupled fake clock + timers: performance.now() and setTimeout advance through
// the same `advance()` mechanism, so the idle timer can never drift from "now".
interface FakeTimer {
  id: number;
  fireAt: number;
  fn: () => void;
}

let perfNow: number;
let timers: FakeTimer[];
let nextId: number;
let uuidCounter: number;
let startedIds: string[];
let endedDurations: number[];

function advance(ms: number): void {
  perfNow += ms;
  for (
    let t = timers.find((x) => x.fireAt <= perfNow);
    t;
    t = timers.find((x) => x.fireAt <= perfNow)
  ) {
    timers = timers.filter((x) => x !== t);
    t.fn(); // may schedule a new timer
  }
}

function track(): void {
  initUserSession({
    onStart: (id) => startedIds.push(id),
    onEnd: (_id, durationMs) => endedDurations.push(durationMs),
  });
}

beforeEach(() => {
  perfNow = 0;
  timers = [];
  nextId = 1;
  uuidCounter = 0;
  startedIds = [];
  endedDurations = [];
  vi.stubGlobal("performance", { now: () => perfNow });
  vi.stubGlobal("setTimeout", (fn: () => void, ms: number) => {
    const id = nextId++;
    timers.push({ id, fireAt: perfNow + ms, fn });
    return id;
  });
  vi.stubGlobal("clearTimeout", (id: number) => {
    timers = timers.filter((t) => t.id !== id);
  });
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${++uuidCounter}` });
});

afterEach(() => {
  teardownUserSession();
  vi.unstubAllGlobals();
});

describe("userSession", () => {
  it("uses a 1-minute idle timeout in dev builds", () => {
    expect(IDLE_TIMEOUT_MS).toBe(60_000);
  });

  it("mints a session on init", () => {
    track();
    expect(getCurrentSessionId()).toBe("uuid-1");
    expect(startedIds).toEqual(["uuid-1"]);
  });

  it("keeps the same session across activity within the idle window", () => {
    track();
    advance(30_000);
    noteActivity();
    expect(getCurrentSessionId()).toBe("uuid-1");
    expect(startedIds).toHaveLength(1);
  });

  it("expires after the idle timeout, then mints a fresh session on next activity", () => {
    track();
    advance(IDLE_TIMEOUT_MS);
    expect(endedDurations).toEqual([IDLE_TIMEOUT_MS]);
    expect(getCurrentSessionId()).toBeNull();

    noteActivity();
    expect(getCurrentSessionId()).toBe("uuid-2");
    expect(startedIds).toEqual(["uuid-1", "uuid-2"]);
  });

  it("re-arms the idle timer on each activity", () => {
    track();
    advance(IDLE_TIMEOUT_MS - 1_000);
    noteActivity(); // resets the window
    advance(IDLE_TIMEOUT_MS - 1_000);
    expect(getCurrentSessionId()).toBe("uuid-1");
    expect(endedDurations).toHaveLength(0);

    advance(2_000); // now past one full window since last activity
    expect(getCurrentSessionId()).toBeNull();
    expect(endedDurations).toHaveLength(1);
  });

  it("never expires while playback is active, even long past the idle window", () => {
    track();
    setPlaybackActive(true);
    advance(IDLE_TIMEOUT_MS * 3);
    expect(getCurrentSessionId()).toBe("uuid-1");
    expect(endedDurations).toHaveLength(0);
  });

  it("re-arms the idle timer once playback stops", () => {
    track();
    setPlaybackActive(true);
    advance(IDLE_TIMEOUT_MS * 3);
    setPlaybackActive(false);

    advance(IDLE_TIMEOUT_MS - 1);
    expect(getCurrentSessionId()).toBe("uuid-1");
    advance(1);
    expect(getCurrentSessionId()).toBeNull();
    expect(endedDurations).toHaveLength(1);
  });

  it("mints a session when playback starts with no active session", () => {
    track();
    advance(IDLE_TIMEOUT_MS); // expire
    expect(getCurrentSessionId()).toBeNull();

    setPlaybackActive(true);
    expect(getCurrentSessionId()).toBe("uuid-2");
  });
});
