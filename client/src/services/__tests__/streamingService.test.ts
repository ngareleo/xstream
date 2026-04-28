import { context } from "@opentelemetry/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StreamingService } from "~/services/streamingService.js";

const testCtx = context.active();

// Build a length-prefixed frame: [uint32 BE length][payload bytes]
function makeFrame(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length, false);
  frame.set(payload, 4);
  return frame;
}

// Build a ReadableStream from an array of chunks
function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
}

// Mock fetch to return a stream of the given chunks
function mockFetch(chunks: Uint8Array[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      body: makeStream(chunks),
    })
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("StreamingService frame parser", () => {
  it("delivers a single complete frame in one chunk", async () => {
    const payload = new Uint8Array([10, 20, 30]);
    mockFetch([makeFrame(payload)]);

    const service = new StreamingService();
    const segments: { data: ArrayBuffer; isInit: boolean }[] = [];

    await service.start(
      "job1",
      async (data, isInit) => {
        segments.push({ data, isInit });
      },
      (err) => {
        throw err;
      },
      () => {},
      testCtx
    );

    expect(segments).toHaveLength(1);
    expect(new Uint8Array(segments[0].data)).toEqual(payload);
    expect(segments[0].isInit).toBe(true);
  });

  it("marks only the first segment as init", async () => {
    const p1 = new Uint8Array([1, 2]);
    const p2 = new Uint8Array([3, 4]);
    const combined = new Uint8Array([...makeFrame(p1), ...makeFrame(p2)]);
    mockFetch([combined]);

    const service = new StreamingService();
    const initFlags: boolean[] = [];

    await service.start(
      "job1",
      async (_, isInit) => {
        initFlags.push(isInit);
      },
      (err) => {
        throw err;
      },
      () => {},
      testCtx
    );

    expect(initFlags).toEqual([true, false]);
  });

  it("handles frames split across multiple chunks", async () => {
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
    const frame = makeFrame(payload);
    // Split the frame in the middle of the payload
    const chunk1 = frame.slice(0, 5);
    const chunk2 = frame.slice(5);
    mockFetch([chunk1, chunk2]);

    const service = new StreamingService();
    const segments: ArrayBuffer[] = [];

    await service.start(
      "job1",
      async (data) => {
        segments.push(data);
      },
      (err) => {
        throw err;
      },
      () => {},
      testCtx
    );

    expect(segments).toHaveLength(1);
    expect(new Uint8Array(segments[0])).toEqual(payload);
  });

  it("handles multiple frames across many small chunks", async () => {
    const p1 = new Uint8Array([1]);
    const p2 = new Uint8Array([2, 3]);
    const all = new Uint8Array([...makeFrame(p1), ...makeFrame(p2)]);
    // Deliver one byte at a time
    const chunks = Array.from(all).map((b) => new Uint8Array([b]));
    mockFetch(chunks);

    const service = new StreamingService();
    const payloads: Uint8Array[] = [];

    await service.start(
      "job1",
      async (data) => {
        payloads.push(new Uint8Array(data));
      },
      (err) => {
        throw err;
      },
      () => {},
      testCtx
    );

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual(p1);
    expect(payloads[1]).toEqual(p2);
  });

  it("calls onDone when the stream ends", async () => {
    mockFetch([makeFrame(new Uint8Array([1]))]);

    const service = new StreamingService();
    let done = false;

    await service.start(
      "job1",
      async () => {},
      (err) => {
        throw err;
      },
      () => {
        done = true;
      },
      testCtx
    );

    expect(done).toBe(true);
  });

  it("cancel() during in-flight onSegment does not throw null-reader error", async () => {
    // Regression for trace 5d5b5137… — successive seeks crashed with:
    //   "Stream error: can't access property 'read', this.reader is null"
    // The race: cancel() nulls this.reader while the loop is suspended on an
    // `await onSegment(...)`. The next iteration's `await this.reader.read()`
    // dereferences null. Fix: snapshot reader at top of loop + bail if null
    // after onSegment resolves.
    const p1 = new Uint8Array([1, 2, 3]);
    const p2 = new Uint8Array([4, 5, 6]);
    // Two frames in one chunk — onSegment fires twice, cancel after the first
    // (so the loop is between awaits when cancel runs).
    mockFetch([new Uint8Array([...makeFrame(p1), ...makeFrame(p2)])]);

    const service = new StreamingService();
    const errors: Error[] = [];
    let cancelled = false;

    const startPromise = service.start(
      "job1",
      async () => {
        // First segment triggers cancel mid-onSegment, simulating the
        // seek-during-stream race. The second segment's slot would normally
        // race the cancel and crash on the null reader.
        if (!cancelled) {
          cancelled = true;
          service.cancel();
        }
      },
      (e) => errors.push(e),
      () => {},
      testCtx
    );
    await startPromise;

    // No null-deref TypeError, no AbortError surfaced as onError.
    expect(errors).toHaveLength(0);
  });

  it("cancel() stops processing and does not call onError", async () => {
    // Infinite stream — never closes
    let _enqueueFn: ((chunk: Uint8Array) => void) | null = null;
    const infiniteStream = new ReadableStream<Uint8Array>({
      start(controller) {
        _enqueueFn = (c) => controller.enqueue(c);
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, body: infiniteStream }));

    const service = new StreamingService();
    const errors: Error[] = [];

    // Start but don't await — it will hang until cancelled
    const startPromise = service.start(
      "job1",
      async () => {},
      (e) => errors.push(e),
      () => {},
      testCtx
    );
    // Give the fetch a tick to begin
    await new Promise((r) => setTimeout(r, 0));
    service.cancel();
    await startPromise;

    expect(errors).toHaveLength(0);
  });
});
