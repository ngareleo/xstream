/**
 * Tests for the chunk-duration ramp.
 *
 * The ramp is responsible for two things:
 *   1. Returning each declared duration in order, then `steadyStateS` for
 *      every subsequent call (the tail-extension contract).
 *   2. Returning to the head of the ramp on `reset()`, regardless of how
 *      far past the tail the cursor walked.
 *
 * Both are easy to get wrong with off-by-ones (consume-then-advance vs
 * advance-then-consume), so the assertions are intentionally explicit.
 */
import { describe, expect, it } from "vitest";

import { RampController } from "~/services/rampController.js";

describe("RampController", () => {
  it("walks the ramp once, then yields steadyState forever", () => {
    const r = new RampController([10, 15, 20, 30, 45, 60], 60);
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) seen.push(r.next());
    expect(seen).toEqual([10, 15, 20, 30, 45, 60, 60, 60, 60, 60]);
  });

  it("re-enters at the head after reset()", () => {
    const r = new RampController([10, 15, 20, 30, 45, 60], 60);
    // Walk past the tail so the cursor is firmly in steady-state territory.
    for (let i = 0; i < 12; i++) r.next();
    r.reset();
    expect(r.next()).toBe(10);
    expect(r.next()).toBe(15);
  });

  it("yields steadyState immediately when the ramp is empty", () => {
    // Edge case — an empty ramp shouldn't crash. steadyState is the value
    // returned for every call; this lets a future config disable the ramp
    // entirely by setting `chunkRampS: []`.
    const r = new RampController([], 42);
    expect(r.next()).toBe(42);
    expect(r.next()).toBe(42);
  });
});
