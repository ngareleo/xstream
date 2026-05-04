# fMP4 Tail Reader

Bridge between ffmpeg's single growing fragmented-MP4 output and the per-segment files the streaming pipeline expects.

## Why this exists

ffmpeg's HLS-fmp4 muxer (`-f hls -hls_segment_type fmp4`) wraps an internal fmp4 muxer and silently ignores muxer-level flags like `-avoid_negative_ts` and `-movflags +negative_cts_offsets`. The consequence — documented in [`../../server/FFmpeg-Caveats/01-Negative-DTS.md`](../../server/FFmpeg-Caveats/01-Negative-DTS.md) and [`../../server/FFmpeg-Caveats/02-Tfdt-Sample-Mismatch.md`](../../server/FFmpeg-Caveats/02-Tfdt-Sample-Mismatch.md) — is that the segments emitted have `tfdt` values that disagree with the actual sample DTS by 504 ticks (caused by an empty `elst` edit). Browser MSE implementations ignore `elst`, so the tfdt-vs-sample mismatch accumulates and the demuxer eventually rejects samples with `Invalid Top-Level Box` (Firefox) or `CHUNK_DEMUXER_ERROR_APPEND_FAILED` (Chromium).

Direct `-f mp4` output with `-movflags +negative_cts_offsets` does propagate the flag and produces a CMAF-clean fragmented MP4 — but as a single growing file, not the per-segment files the rest of the pipeline (segment watcher, stream pump, DB schema) expects.

This module bridges the gap. It tails ffmpeg's single output file as it grows, parses MP4 box headers, and writes split `init.mp4` + `segment_NNNN.m4s` files into the same directory using atomic rename. The segment watcher upstream sees the same event stream it always did.

## File layout it produces

```text
<segment_dir>/
  chunk.fmp4         # ffmpeg's continuous output (the source we tail)
  init.mp4           # ftyp + moov, written once when the first moof appears
  segment_0000.m4s   # moof + mdat (one fragment)
  segment_0001.m4s   # ...
```

`chunk.fmp4` has a name that the segment watcher's filename filter deliberately does not match (it only fires on `init.mp4` and `segment_NNNN.m4s`).

## Lifecycle

Spawn a tail-reader task before ffmpeg. The reader polls the source file's size; when it grows, the reader parses any complete top-level boxes that have arrived and writes split files atomically. When ffmpeg signals completion via the supplied oneshot, the reader finishes parsing any trailing bytes and returns.

## Source

`server-rust/src/services/fmp4_tail_reader.rs`.
