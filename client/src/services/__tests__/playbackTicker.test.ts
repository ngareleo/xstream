import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackTicker } from "~/services/playbackTicker.js";

/**
 * Manual RAF driver — test-controlled clock. Each `flush()` invokes any
 * callbacks scheduled by `requestAnimationFrame` since the last flush, in
 * registration order. Tests advance the clock explicitly so we can assert
 * "after one frame N handlers ran" without timing flakiness.
 */
class ManualRaf {
  private nextHandle = 1;
  private pending = new Map<number, FrameRequestCallback>();
  private now = 0;

  schedule(cb: FrameRequestCallback): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, cb);
    return handle;
  }

  cancel(handle: number): void {
    this.pending.delete(handle);
  }

  flush(advanceMs = 16): void {
    this.now += advanceMs;
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    for (const cb of callbacks) cb(this.now);
  }

  pendingCount(): number {
    return this.pending.size;
  }
}

let raf: ManualRaf;

beforeEach(() => {
  raf = new ManualRaf();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => raf.schedule(cb));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => raf.cancel(handle));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlaybackTicker", () => {
  it("does not request a frame until a handler registers", () => {
    new PlaybackTicker();
    expect(raf.pendingCount()).toBe(0);
  });

  it("calls a registered handler each frame until it returns false", () => {
    const ticker = new PlaybackTicker();
    let calls = 0;
    ticker.register(() => {
      calls += 1;
      return calls < 3;
    });

    raf.flush();
    expect(calls).toBe(1);
    raf.flush();
    expect(calls).toBe(2);
    raf.flush();
    expect(calls).toBe(3);
    // Handler returned false on the third call — should not be scheduled again.
    expect(raf.pendingCount()).toBe(0);
  });

  it("auto-stops the RAF loop when the last handler deregisters", () => {
    const ticker = new PlaybackTicker();
    ticker.register(() => false);
    expect(raf.pendingCount()).toBe(1);
    raf.flush();
    expect(raf.pendingCount()).toBe(0);
  });

  it("re-arms RAF when a new handler registers after the loop stopped", () => {
    const ticker = new PlaybackTicker();
    ticker.register(() => false);
    raf.flush();
    expect(raf.pendingCount()).toBe(0);

    ticker.register(() => true);
    expect(raf.pendingCount()).toBe(1);
  });

  it("the unregister function returned by register() removes the handler", () => {
    const ticker = new PlaybackTicker();
    let calls = 0;
    const unregister = ticker.register(() => {
      calls += 1;
      return true;
    });

    raf.flush();
    expect(calls).toBe(1);

    unregister();
    raf.flush();
    expect(calls).toBe(1); // handler did not run
    expect(raf.pendingCount()).toBe(0); // loop stopped
  });

  it("invokes multiple handlers per frame in registration order", () => {
    const ticker = new PlaybackTicker();
    const order: string[] = [];
    ticker.register(() => {
      order.push("a");
      return true;
    });
    ticker.register(() => {
      order.push("b");
      return true;
    });

    raf.flush();
    expect(order).toEqual(["a", "b"]);
    raf.flush();
    expect(order).toEqual(["a", "b", "a", "b"]);
  });

  it("a handler that registers another mid-tick — new handler runs the next frame, not this one", () => {
    const ticker = new PlaybackTicker();
    const ran: string[] = [];

    ticker.register(() => {
      ran.push("outer");
      ticker.register(() => {
        ran.push("inner");
        return false;
      });
      return false;
    });

    raf.flush();
    expect(ran).toEqual(["outer"]); // inner is not invoked this frame
    raf.flush();
    expect(ran).toEqual(["outer", "inner"]);
  });

  it("a handler that unregisters another mid-tick — the unregistered handler does not run", () => {
    const ticker = new PlaybackTicker();
    const ran: string[] = [];

    let unregisterB: () => void = () => {};
    ticker.register(() => {
      ran.push("a");
      unregisterB();
      return true;
    });
    unregisterB = ticker.register(() => {
      ran.push("b");
      return true;
    });

    raf.flush();
    // 'a' runs first, unregisters 'b' — 'b' is gone before the snapshot reaches it.
    expect(ran).toEqual(["a"]);
  });

  it("shutdown() clears all handlers and stops the loop", () => {
    const ticker = new PlaybackTicker();
    let aCalls = 0;
    let bCalls = 0;
    ticker.register(() => {
      aCalls += 1;
      return true;
    });
    ticker.register(() => {
      bCalls += 1;
      return true;
    });

    raf.flush();
    expect(aCalls).toBe(1);
    expect(bCalls).toBe(1);

    ticker.shutdown();
    expect(raf.pendingCount()).toBe(0);
    raf.flush();
    expect(aCalls).toBe(1);
    expect(bCalls).toBe(1);
  });

  it("passes the RAF timestamp to handlers", () => {
    const ticker = new PlaybackTicker();
    const seen: number[] = [];
    ticker.register((nowMs) => {
      seen.push(nowMs);
      return seen.length < 2;
    });

    raf.flush(100);
    raf.flush(50);
    expect(seen).toEqual([100, 150]);
  });
});
