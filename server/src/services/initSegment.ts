/**
 * Strips the `edts` (edit list) box from each `trak` inside `moov` of an
 * fMP4 init segment. ffmpeg's mov muxer writes an empty `elst` of duration
 * `-output_ts_offset` whenever the chunker uses that flag (every chunk with
 * `chunkStartSeconds > 0`); Chromium MSE honours that empty edit and
 * subtracts the offset back out from each segment's PTS at playback time —
 * which undoes the deliberate source-time PTS stamping the chunker did.
 *
 * Removing `edts` makes the SourceBuffer treat segment PTS as absolute
 * source-time positions, which is what the rest of the pipeline expects.
 * Idempotent: an init with no `edts` is returned unchanged.
 *
 * See `docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md` § 2.
 */
export function stripEdtsBoxes(buf: Uint8Array): Uint8Array {
  const moov = findTopLevelBox(buf, "moov");
  if (!moov) return buf;

  // Collect each `trak`'s edts (if any) so we can rebuild trak + moov in one
  // pass without nested mutation. `traks` mirrors moov's child layout in order.
  type Trak = { offset: number; size: number; edts: { offset: number; size: number } | null };
  const traks: Trak[] = [];
  let cursor = moov.contentStart;
  while (cursor < moov.end) {
    const child = readBoxHeader(buf, cursor);
    if (child.type === "trak") {
      const edts = findChildBox(buf, child.contentStart, child.end, "edts");
      traks.push({ offset: child.offset, size: child.size, edts });
    }
    cursor = child.end;
  }

  const totalStripped = traks.reduce((n, t) => n + (t.edts?.size ?? 0), 0);
  if (totalStripped === 0) return buf;

  const out = new Uint8Array(buf.byteLength - totalStripped);
  // Bytes before moov are byte-identical.
  out.set(buf.subarray(0, moov.offset), 0);

  // Rewrite moov header with new size, then walk children and copy each
  // (rewriting trak headers + skipping edts content along the way).
  const newMoovSize = moov.size - totalStripped;
  let writeAt = moov.offset;
  writeUint32BE(out, writeAt, newMoovSize);
  out.set(buf.subarray(moov.offset + 4, moov.contentStart), writeAt + 4); // "moov" + (any largesize, but we don't emit)
  writeAt = moov.offset + (moov.contentStart - moov.offset);

  let trakIdx = 0;
  cursor = moov.contentStart;
  while (cursor < moov.end) {
    const child = readBoxHeader(buf, cursor);
    if (child.type === "trak" && trakIdx < traks.length && traks[trakIdx].edts !== null) {
      const t = traks[trakIdx];
      const edts = t.edts;
      if (edts === null) throw new Error("unreachable: edts non-null guard");
      const newTrakSize = t.size - edts.size;
      // Rewrite trak header with new size; keep type bytes; copy children
      // up to edts, then jump past edts and copy the rest.
      writeUint32BE(out, writeAt, newTrakSize);
      out.set(buf.subarray(child.offset + 4, child.contentStart), writeAt + 4);
      const headerLen = child.contentStart - child.offset;
      let trakWrite = writeAt + headerLen;
      const beforeEdtsLen = edts.offset - child.contentStart;
      out.set(buf.subarray(child.contentStart, edts.offset), trakWrite);
      trakWrite += beforeEdtsLen;
      const afterEdtsLen = child.end - (edts.offset + edts.size);
      out.set(buf.subarray(edts.offset + edts.size, child.end), trakWrite);
      trakWrite += afterEdtsLen;
      writeAt = trakWrite;
      trakIdx++;
    } else {
      // Non-trak child, or trak without edts — copy verbatim.
      out.set(buf.subarray(child.offset, child.end), writeAt);
      writeAt += child.size;
      if (child.type === "trak") trakIdx++;
    }
    cursor = child.end;
  }

  // Bytes after moov (siblings like `mvex`, `mfra` if any) are byte-identical.
  out.set(buf.subarray(moov.end), writeAt);
  return out;
}

interface BoxHeader {
  /** Offset in the buffer where the box starts (size header). */
  offset: number;
  /** Box size including the 8-byte header. */
  size: number;
  /** 4-char ASCII box type. */
  type: string;
  /** Offset where the box content (after header) begins. */
  contentStart: number;
  /** Offset one past the last byte of the box. */
  end: number;
}

function readBoxHeader(buf: Uint8Array, offset: number): BoxHeader {
  const size = readUint32BE(buf, offset);
  const type = String.fromCharCode(
    buf[offset + 4],
    buf[offset + 5],
    buf[offset + 6],
    buf[offset + 7]
  );
  // We don't expect largesize (size=1) or to-end-of-file (size=0) in fMP4 init
  // segments — they are tiny and use 32-bit sizes. Fail loudly if seen so we
  // catch a malformed input rather than producing a corrupt strip.
  if (size < 8) throw new Error(`Invalid MP4 box size ${size} at offset ${offset} (type ${type})`);
  return { offset, size, type, contentStart: offset + 8, end: offset + size };
}

function findTopLevelBox(buf: Uint8Array, type: string): BoxHeader | null {
  let cursor = 0;
  while (cursor + 8 <= buf.byteLength) {
    const box = readBoxHeader(buf, cursor);
    if (box.type === type) return box;
    cursor = box.end;
  }
  return null;
}

function findChildBox(
  buf: Uint8Array,
  contentStart: number,
  end: number,
  type: string
): { offset: number; size: number } | null {
  let cursor = contentStart;
  while (cursor + 8 <= end) {
    const box = readBoxHeader(buf, cursor);
    if (box.type === type) return { offset: box.offset, size: box.size };
    cursor = box.end;
  }
  return null;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    buf[offset] * 0x1000000 + ((buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3])
  );
}

function writeUint32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}
