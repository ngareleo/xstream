import { describe, expect, it } from "vitest";

import { identityFromEmail } from "~/utils/identity.js";

describe("identityFromEmail", () => {
  it("derives name + two-letter initials from a simple local-part", () => {
    expect(identityFromEmail("leo@gmail.com")).toEqual({ name: "Leo", initials: "LE" });
  });

  it("uses first-letter-of-each-segment initials for dotted local-parts", () => {
    expect(identityFromEmail("john.doe@example.com")).toEqual({ name: "John", initials: "JD" });
  });

  it("treats underscore, hyphen, and plus as segment separators", () => {
    expect(identityFromEmail("ada_lovelace@x.io")).toEqual({ name: "Ada", initials: "AL" });
    expect(identityFromEmail("jean-luc@x.io")).toEqual({ name: "Jean", initials: "JL" });
    expect(identityFromEmail("alan+tag@x.io")).toEqual({ name: "Alan", initials: "AT" });
  });

  it("handles a single-character local-part", () => {
    expect(identityFromEmail("a@x.io")).toEqual({ name: "A", initials: "A" });
  });

  it("falls back to the raw string when there is no @", () => {
    expect(identityFromEmail("nobody")).toEqual({ name: "Nobody", initials: "NO" });
  });
});
