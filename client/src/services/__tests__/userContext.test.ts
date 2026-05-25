import { afterEach, describe, expect, it } from "vitest";

import {
  clearUserContext,
  getUserContext,
  getUserEmail,
  hasActiveSession,
  setUserContext,
} from "~/services/userContext.js";

describe("userContext", () => {
  afterEach(() => {
    // Module-scoped state — leak isolation between cases.
    clearUserContext();
  });

  it("starts with no user", () => {
    expect(getUserContext()).toBeNull();
    expect(hasActiveSession()).toBe(false);
  });

  it("setUserContext stamps the user id and flips hasActiveSession", () => {
    setUserContext("550e8400-e29b-41d4-a716-446655440000");
    expect(getUserContext()).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(hasActiveSession()).toBe(true);
  });

  it("clearUserContext drops both the id and the session flag", () => {
    setUserContext("abc");
    clearUserContext();
    expect(getUserContext()).toBeNull();
    expect(hasActiveSession()).toBe(false);
  });

  it("setUserContext overwrites on a second call (re-signin or refresh)", () => {
    setUserContext("first");
    setUserContext("second");
    expect(getUserContext()).toBe("second");
    expect(hasActiveSession()).toBe(true);
  });

  it("stores the email when provided and clears it on clear", () => {
    setUserContext("uid", "leo@gmail.com");
    expect(getUserEmail()).toBe("leo@gmail.com");
    clearUserContext();
    expect(getUserEmail()).toBeNull();
  });

  it("defaults email to null when omitted", () => {
    setUserContext("uid");
    expect(getUserEmail()).toBeNull();
  });
});
