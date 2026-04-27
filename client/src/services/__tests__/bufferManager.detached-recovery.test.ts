/**
 * Tests for BufferManager's MSE-detach recovery callback.
 *
 * Chrome's MSE budget watchdog (trace 65ef5d6c… — 622 segments appended →
 * repeated InvalidStateError with `source_buffer_in_ms_list: false`)
 * unilaterally detaches our SourceBuffer from the MediaSource when cumulative
 * bytes exceed its internal limit. BufferManager must distinguish this case
 * from other InvalidStateError variants (closed MediaSource, in-flight
 * `updating` race) and fire `onMseDetached` so PlaybackController can rebuild
 * rather than surface a fatal error.
 *
 * These tests drive `appendSegment` directly, bypassing `init()` by injecting
 * a fake SourceBuffer + MediaSource via private-field access — vitest runs in
 * node environment so we don't have the real MSE API available anyway.
 */
import { describe, expect, it, vi } from "vitest";

import { BufferManager } from "~/services/bufferManager.js";

interface FakeMediaSource {
  readyState: string;
  sourceBuffers: FakeSourceBuffer[];
}

interface FakeSourceBuffer {
  updating: boolean;
  buffered: { length: number; start: (i: number) => number; end: (i: number) => number };
  appendBuffer: (data: ArrayBuffer) => void;
  remove: (start: number, end: number) => void;
  addEventListener?: (ev: string, cb: () => void, opts?: { once?: boolean }) => void;
}

interface PrivateFields {
  mediaSource: FakeMediaSource | null;
  sourceBuffer: FakeSourceBuffer | null;
  bytesInBuffer: number;
}

function makeHarness(opts: { throwsOnAppend: Error; sbInMsList: boolean }): {
  buffer: BufferManager;
  onMseDetached: ReturnType<typeof vi.fn>;
} {
  const videoEl = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    currentTime: 0,
  } as unknown as HTMLVideoElement;
  const onMseDetached = vi.fn();
  const buffer = new BufferManager(
    videoEl,
    /* onPause */ () => {},
    /* onResume */ () => {},
    /* videoDurationS */ 600,
    undefined,
    onMseDetached
  );

  const fakeSb: FakeSourceBuffer = {
    updating: false,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    appendBuffer: () => {
      throw opts.throwsOnAppend;
    },
    remove: () => {},
    addEventListener: () => {},
  };
  const fakeMs: FakeMediaSource = {
    readyState: "open",
    // When sbInMsList=false we want the detached signature: the SB we're
    // about to append to is NOT in `sourceBuffers`.
    sourceBuffers: opts.sbInMsList ? [fakeSb] : [],
  };

  // Inject into private fields. The waitForUpdateEnd helper branches on
  // sb.updating (false here) so no event machinery is needed.
  const priv = buffer as unknown as PrivateFields;
  priv.mediaSource = fakeMs;
  priv.sourceBuffer = fakeSb;
  priv.bytesInBuffer = 0;

  return { buffer, onMseDetached };
}

function makeDomException(name: string, message = "fake"): DOMException {
  // DOMException isn't globally available in node env; construct a plain
  // Error with a `name` property — BufferManager reads `.name` and `.message`
  // from the thrown value, not `instanceof DOMException`.
  const err = new Error(message) as unknown as DOMException;
  (err as unknown as { name: string }).name = name;
  (err as unknown as { code: number }).code = 11; // InvalidStateError
  return err;
}

describe("BufferManager MSE-detach recovery", () => {
  it("fires onMseDetached when appendBuffer throws InvalidStateError AND SB is not in sourceBuffers", async () => {
    const { buffer, onMseDetached } = makeHarness({
      throwsOnAppend: makeDomException("InvalidStateError"),
      sbInMsList: false,
    });

    await buffer.appendSegment(new ArrayBuffer(16));

    expect(onMseDetached).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onMseDetached when InvalidStateError fires but SB is still in sourceBuffers", async () => {
    // This variant is the "closed MediaSource" or "updating race" case —
    // different root cause, not a Chrome-detach. Callback must stay quiet.
    const { buffer, onMseDetached } = makeHarness({
      throwsOnAppend: makeDomException("InvalidStateError"),
      sbInMsList: true,
    });

    await buffer.appendSegment(new ArrayBuffer(16));

    expect(onMseDetached).not.toHaveBeenCalled();
  });

  it("does NOT fire onMseDetached for QuotaExceededError (retries should handle that)", async () => {
    const { buffer, onMseDetached } = makeHarness({
      throwsOnAppend: makeDomException("QuotaExceededError"),
      sbInMsList: false, // even if the list check matched, wrong error name
    });

    await buffer.appendSegment(new ArrayBuffer(16));

    expect(onMseDetached).not.toHaveBeenCalled();
  });
});
