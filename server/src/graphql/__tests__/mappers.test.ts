/**
 * Enum mapper round-trip contract.
 *
 * Resolution / JobStatus / MediaType all live in three places: the GraphQL
 * schema string, the internal type union, and the bidirectional mapper. If
 * any one drifts, queries silently return wrong enum strings or throw on
 * valid input. These tests pin both directions and the unknown-value branch.
 *
 * The Rust port has the same three places — the test list here doubles as
 * the enum surface it must reproduce.
 */
import { describe, expect, it } from "bun:test";

import type { JobStatus, MediaType, Resolution } from "../../types.js";
import {
  gqlMediaTypeToInternal,
  gqlResolutionToInternal,
  gqlStatusToInternal,
  internalMediaTypeToGql,
  internalResolutionToGql,
  internalStatusToGql,
} from "../mappers.js";
import { decodeCursor, encodeCursor } from "../presenters.js";

describe("Resolution mapper", () => {
  const ALL: Array<[string, Resolution]> = [
    ["RESOLUTION_240P", "240p"],
    ["RESOLUTION_360P", "360p"],
    ["RESOLUTION_480P", "480p"],
    ["RESOLUTION_720P", "720p"],
    ["RESOLUTION_1080P", "1080p"],
    ["RESOLUTION_4K", "4k"],
  ];

  for (const [gql, internal] of ALL) {
    it(`${gql} round-trips through internal "${internal}"`, () => {
      expect(gqlResolutionToInternal(gql)).toBe(internal);
      expect(internalResolutionToGql(internal)).toBe(gql);
    });
  }

  it("throws on unknown enum value", () => {
    expect(() => gqlResolutionToInternal("RESOLUTION_8K")).toThrow();
    expect(() => gqlResolutionToInternal("")).toThrow();
  });
});

describe("JobStatus mapper", () => {
  const ALL: Array<[string, JobStatus]> = [
    ["PENDING", "pending"],
    ["RUNNING", "running"],
    ["COMPLETE", "complete"],
    ["ERROR", "error"],
  ];

  for (const [gql, internal] of ALL) {
    it(`${gql} round-trips through internal "${internal}"`, () => {
      expect(gqlStatusToInternal(gql)).toBe(internal);
      expect(internalStatusToGql(internal)).toBe(gql);
    });
  }

  it("throws on unknown enum value", () => {
    expect(() => gqlStatusToInternal("PAUSED")).toThrow();
    expect(() => gqlStatusToInternal("running")).toThrow(); // case-sensitive
  });
});

describe("MediaType mapper", () => {
  const ALL: Array<[string, MediaType]> = [
    ["MOVIES", "movies"],
    ["TV_SHOWS", "tvShows"],
  ];

  for (const [gql, internal] of ALL) {
    it(`${gql} round-trips through internal "${internal}"`, () => {
      expect(gqlMediaTypeToInternal(gql)).toBe(internal);
      expect(internalMediaTypeToGql(internal)).toBe(gql);
    });
  }

  it("throws on unknown enum value", () => {
    expect(() => gqlMediaTypeToInternal("MUSIC")).toThrow();
    expect(() => gqlMediaTypeToInternal("MOVIE")).toThrow(); // singular vs plural
  });
});

describe("pagination cursor", () => {
  it("round-trips an offset", () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0);
    expect(decodeCursor(encodeCursor(42))).toBe(42);
    expect(decodeCursor(encodeCursor(1_000_000))).toBe(1_000_000);
  });

  it("rejects malformed cursors", () => {
    expect(() => decodeCursor("not-base64!")).toThrow();
    expect(() => decodeCursor(Buffer.from("count:5").toString("base64"))).toThrow();
    expect(() => decodeCursor(Buffer.from("offset:-1").toString("base64"))).toThrow();
    expect(() => decodeCursor(Buffer.from("offset:abc").toString("base64"))).toThrow();
  });
});
