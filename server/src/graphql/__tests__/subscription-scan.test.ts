/**
 * libraryScanUpdated subscription — initial-state emission + transitions.
 *
 * Contract:
 *   1. On subscribe, the first payload arrives immediately with the current
 *      `scanning` state (no waiting for a transition). The settings page
 *      relies on this to render the right state on connect.
 *   2. Every transition (markScanStarted → markScanEnded) emits a payload
 *      in order.
 *
 * Driven through the public path: subscription resolver's async generator
 * → subscribeToScan → markScan*. The resolver is the user-facing contract,
 * scanStore is the public trigger API both `scanLibraries()` and tests
 * call.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { subscriptionResolvers } = await import("../resolvers/subscription.js");
const { markScanEnded, markScanStarted } = await import("../../services/scanStore.js");

beforeAll(() => {
  // Make sure no scan from a sibling test is still in progress.
  markScanEnded();
});

afterAll(() => {
  markScanEnded();
});

describe("libraryScanUpdated", () => {
  test("first payload is the current state, then transitions emit in order", async () => {
    // Generator returned by yoga's subscribe — same shape the SSE transport
    // reads from. Calling next() drives the generator just like a subscriber.
    const iter = subscriptionResolvers.Subscription.libraryScanUpdated.subscribe();

    try {
      // 1. Initial state on connect.
      const initial = await iter.next();
      expect(initial.done).toBe(false);
      expect(initial.value).toEqual({ libraryScanUpdated: { scanning: false } });

      // 2. Transition to scanning=true.
      const startedNext = iter.next();
      markScanStarted();
      const started = await startedNext;
      expect(started.done).toBe(false);
      expect(started.value).toEqual({ libraryScanUpdated: { scanning: true } });

      // 3. Transition back to scanning=false.
      const endedNext = iter.next();
      markScanEnded();
      const ended = await endedNext;
      expect(ended.done).toBe(false);
      expect(ended.value).toEqual({ libraryScanUpdated: { scanning: false } });
    } finally {
      await iter.return?.(undefined);
    }
  });
});
