import type { EventWrapper } from "@nova/types";
import { describe, expect, it } from "vitest";

import {
  createToastRequestedEvent,
  getToastPayload,
  isToastRequestedEvent,
  TOAST_ORIGINATOR,
} from "~/events/toast.events.js";

function wrap(event: ReturnType<typeof createToastRequestedEvent>): EventWrapper {
  // Interceptors receive { event, source }; source is irrelevant to the guards.
  return { event, source: {} } as unknown as EventWrapper;
}

describe("toast.events", () => {
  it("round-trips the payload through create → getToastPayload", () => {
    const event = createToastRequestedEvent({ variant: "success", message: "Linked." });
    expect(event.originator).toBe(TOAST_ORIGINATOR);
    const payload = getToastPayload(wrap(event));
    expect(payload).toEqual({ variant: "success", message: "Linked." });
  });

  it("identifies its own events and rejects others", () => {
    const mine = wrap(createToastRequestedEvent({ variant: "error", message: "x" }));
    expect(isToastRequestedEvent(mine)).toBe(true);

    const foreign = {
      event: { originator: "search", type: "Cleared", data: () => undefined },
      source: {},
    } as unknown as EventWrapper;
    expect(isToastRequestedEvent(foreign)).toBe(false);
  });

  it("falls back to a safe payload when data() is absent", () => {
    const noData = {
      event: { originator: TOAST_ORIGINATOR, type: "Requested" },
      source: {},
    } as unknown as EventWrapper;
    expect(getToastPayload(noData)).toEqual({ variant: "info", message: "" });
  });
});
