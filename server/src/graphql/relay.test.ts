import { describe, expect, test } from "bun:test";

import { fromGlobalId, toGlobalId } from "./relay.js";

describe("toGlobalId", () => {
  test("encodes type and id as base64", () => {
    const id = toGlobalId("Video", "abc123");
    expect(id).toBe(Buffer.from("Video:abc123").toString("base64"));
  });

  test("works with numeric ids", () => {
    const id = toGlobalId("Library", 42);
    expect(id).toBe(Buffer.from("Library:42").toString("base64"));
  });
});

describe("fromGlobalId", () => {
  test("decodes type and id", () => {
    const encoded = Buffer.from("Video:abc123").toString("base64");
    expect(fromGlobalId(encoded)).toEqual({ type: "Video", id: "abc123" });
  });

  test("handles ids that contain colons", () => {
    // id itself contains a colon — only the first colon is the separator
    const encoded = Buffer.from("TranscodeJob:a:b:c").toString("base64");
    expect(fromGlobalId(encoded)).toEqual({ type: "TranscodeJob", id: "a:b:c" });
  });

  test("round-trips toGlobalId → fromGlobalId", () => {
    const original = { type: "Video", id: "deadbeef" };
    expect(fromGlobalId(toGlobalId(original.type, original.id))).toEqual(original);
  });
});
