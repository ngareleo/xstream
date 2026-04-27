import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "bun:test";

import { stripEdtsBoxes } from "../initSegment.js";

const FIXTURES = join(import.meta.dir, "__fixtures__");
const WITH_EDTS = readFileSync(join(FIXTURES, "init-with-edts.mp4"));
const WITHOUT_EDTS = readFileSync(join(FIXTURES, "init-without-edts.mp4"));

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    buf[offset] * 0x1000000 + ((buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3])
  );
}

function asciiAt(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

function findBoxOffset(buf: Uint8Array, type: string): number {
  let cursor = 0;
  while (cursor + 8 <= buf.byteLength) {
    if (asciiAt(buf, cursor + 4) === type) return cursor;
    cursor += readUint32BE(buf, cursor);
  }
  return -1;
}

function countOccurrences(buf: Uint8Array, needle: string): number {
  const target = new TextEncoder().encode(needle);
  let count = 0;
  outer: for (let i = 0; i + target.length <= buf.byteLength; i++) {
    for (let j = 0; j < target.length; j++) {
      if (buf[i + j] !== target[j]) continue outer;
    }
    count++;
  }
  return count;
}

describe("stripEdtsBoxes", () => {
  it("removes the edts box from a chunk init that has output_ts_offset > 0", () => {
    const stripped = stripEdtsBoxes(WITH_EDTS);

    // Sanity: input had edts; output has none.
    expect(countOccurrences(WITH_EDTS, "edts")).toBeGreaterThan(0);
    expect(countOccurrences(stripped, "edts")).toBe(0);
    // elst lives inside edts, so it goes too.
    expect(countOccurrences(stripped, "elst")).toBe(0);
    expect(stripped.byteLength).toBeLessThan(WITH_EDTS.byteLength);
  });

  it("patches moov size to match the new content length", () => {
    const stripped = stripEdtsBoxes(WITH_EDTS);
    const moovOffset = findBoxOffset(stripped, "moov");
    expect(moovOffset).toBeGreaterThanOrEqual(0);
    const moovSize = readUint32BE(stripped, moovOffset);

    // moov occupies the rest of the file (no siblings expected after it in
    // these init.mp4 files), so its declared size should equal the remaining
    // bytes.
    expect(moovSize).toBe(stripped.byteLength - moovOffset);
  });

  it("patches each trak size to match its post-strip content length", () => {
    const stripped = stripEdtsBoxes(WITH_EDTS);
    const moovOffset = findBoxOffset(stripped, "moov");
    const moovSize = readUint32BE(stripped, moovOffset);
    const moovEnd = moovOffset + moovSize;

    let cursor = moovOffset + 8;
    let trakChecked = 0;
    while (cursor + 8 <= moovEnd) {
      const childSize = readUint32BE(stripped, cursor);
      const childType = asciiAt(stripped, cursor + 4);
      if (childType === "trak") {
        // Walk the trak's children and verify their summed sizes + 8-byte
        // header equal the trak's declared size.
        let childCursor = cursor + 8;
        while (childCursor < cursor + childSize) {
          const innerSize = readUint32BE(stripped, childCursor);
          // edts must be gone; if we see one the strip lied about size.
          expect(asciiAt(stripped, childCursor + 4)).not.toBe("edts");
          childCursor += innerSize;
        }
        expect(childCursor).toBe(cursor + childSize);
        trakChecked++;
      }
      cursor += childSize;
    }
    expect(trakChecked).toBeGreaterThan(0);
  });

  it("preserves the ftyp box and bytes before moov verbatim", () => {
    const stripped = stripEdtsBoxes(WITH_EDTS);
    const moovInOrig = findBoxOffset(WITH_EDTS, "moov");
    const moovInStripped = findBoxOffset(stripped, "moov");
    expect(moovInStripped).toBe(moovInOrig);
    // Bytes [0, moovOffset) must be byte-identical.
    for (let i = 0; i < moovInOrig; i++) {
      expect(stripped[i]).toBe(WITH_EDTS[i]);
    }
  });

  it("is idempotent — an init without edts round-trips byte-identical", () => {
    expect(countOccurrences(WITHOUT_EDTS, "edts")).toBe(0);
    const stripped = stripEdtsBoxes(WITHOUT_EDTS);
    expect(stripped.byteLength).toBe(WITHOUT_EDTS.byteLength);
    expect(stripped).toEqual(new Uint8Array(WITHOUT_EDTS));
  });

  it("running strip twice on a chunk-with-edts produces the same result", () => {
    const once = stripEdtsBoxes(WITH_EDTS);
    const twice = stripEdtsBoxes(once);
    expect(twice).toEqual(once);
  });

  it("strips a non-trivial number of bytes (each elst entry is ~40 bytes + edts header)", () => {
    const stripped = stripEdtsBoxes(WITH_EDTS);
    // Two traks (video + audio), each with one edts box ~40 bytes including
    // header. Lower bound 50 bytes is conservative; upper bound 200 catches
    // accidental over-removal.
    const removed = WITH_EDTS.byteLength - stripped.byteLength;
    expect(removed).toBeGreaterThan(50);
    expect(removed).toBeLessThan(200);
  });
});
