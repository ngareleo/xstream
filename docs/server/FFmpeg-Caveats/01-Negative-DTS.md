# Negative DTS at Chunk Start

> **TL;DR** — When ffmpeg encodes a stream that contains B-frames, the **first output packet's DTS is negative** in the encoder's timebase. ffmpeg writes an `elst` (edit list) box to compensate, but **MSE ignores edit lists** (Chromium dropped support deliberately, Firefox follows). The browser decoder then sees DTS<0 and rejects the sample.
>
> The flag for this is `-avoid_negative_ts make_zero`, but **ffmpeg's HLS-fmp4 muxer (`-f hls -hls_segment_type fmp4`) silently ignores it**. Empirically verified against jellyfin-ffmpeg 7.1.3.
>
> **Current fix:** drop the HLS muxer entirely. Output a single fragmented MP4 with `-f mp4 -movflags +frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets -avoid_negative_ts make_zero`. A Rust tail-reader (`services/fmp4_tail_reader.rs`) splits the growing file into `init.mp4 + segment_NNNN.m4s` so the rest of the pipeline (segment watcher, stream pump, DB schema) sees the same on-disk shape it always did. See also `02-Tfdt-Sample-Mismatch.md` for the deeper bug the HLS muxer also caused.

## Symptom

What the user sees: video sits black in the player; sometimes a brief flash of pixels then a frozen frame; MSE recovery cycles 3× then gives up.

What the logs show:
- Server side: `transcode.job` runs to completion, segments written, `segment_count > 0`. Looks healthy.
- Client side: `chunk.first_segment_append` opens. Then **either** of:
  - **Chromium**: `video element error event` with
    `PipelineStatus::CHUNK_DEMUXER_ERROR_APPEND_FAILED: Failed to prepare video sample for decode`.
  - **Firefox**: `video element error event` with
    `MediaResult mozilla::MP4ContainerParser::IsInitSegmentPresent(...): Invalid Top-Level Box: <4 random-looking bytes>`.

The two errors are the same root cause surfaced differently. Firefox's parser tries to classify the offending sample and prints the bytes verbatim, which look "random" because they're the start of a `moof` box, not a recognisable top-level box. Chromium's chunk demuxer accepts the segment append but then can't extract a presentable sample because the DTS is < 0.

## Root cause

Two interlocking facts:

1. **Encoders that use B-frames have to reorder output.** A B-frame at coded position N depends on an I/P frame at position N+1, so the encoder emits the future-frame first (DTS-wise) and the B-frame second. The first emitted packet therefore has a DTS that *precedes* its own PTS, which can be *negative* relative to the start of the timebase.

2. **ffmpeg compensates with an edit list (`elst` box) in the moov.** This is the standard MP4 way to say "skip the first N ticks during presentation." A regular MP4 player honours `elst` and presents from t=0. **MSE does not.** Chromium's MSE chunk demuxer explicitly ignores edit lists ([crbug.com/258131](https://crbug.com/258131) — closed WontFix). Firefox follows the same posture.

This is invisible in non-streaming workflows because every general-purpose MP4 player honours `elst`. The bug only manifests when the consumer is MSE.

## What does NOT work — empirical test matrix

Run on jellyfin-ffmpeg 7.1.3, source: 4K HEVC HDR `.mkv`, output: HLS-fmp4. Expected: first packet `dts=0`. Actual:

| ffmpeg invocation | First packet DTS | Notes |
|---|---:|---|
| `-f hls -hls_segment_type fmp4 ... -avoid_negative_ts make_zero` | **-10** ❌ | Flag silently ignored by the HLS-wrapped fmp4 muxer. |
| `-f hls ... -avoid_negative_ts make_non_negative` | -10 ❌ | Same. |
| `-f hls ... -fflags +genpts -avoid_negative_ts make_zero` | -10 ❌ | `genpts` regenerates PTS but the muxer still emits the original DTS. |
| `-f hls ... -muxdelay 0 -muxpreload 0` | -10 ❌ | These don't shift the underlying packet DTS. |
| `-f hls ... -copyts -start_at_zero` | -10 ❌ | `copyts` preserves the encoder timestamps verbatim. |
| `-f hls ... -vf "setpts=PTS-STARTPTS"` | -10 ❌ | `setpts` rewrites *PTS* in the filter graph; the encoder output still has its own DTS reorder. |
| `-f hls ... -itsoffset 0.001 -i ...` | -10 ❌ | Input-side offset doesn't change the encoder's reorder gap. |
| `-f hls ... -movflags +negative_cts_offsets` | -10 ❌ | Movflag ignored — same wrapper-eats-the-flag behaviour. |
| `-f dash -seg_duration 2 ... -avoid_negative_ts make_zero` | -10 ❌ | DASH muxer also wraps fmp4 and eats the flag. |
| `-f hls ... -bf 0` | **0** ✅ | Disabling B-frames at the encoder removes the reorder gap. ~5–10 % bitrate cost. |
| **`-f mp4 -movflags +frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets -avoid_negative_ts make_zero`** | **0** ✅ | Standalone fmp4 muxer respects all flags. **Current production path.** |

Conclusion: the HLS muxer is unfixable for negative-DTS via flags — `-bf 0` (disabling B-frames) is the only HLS-compatible workaround. Direct `-f mp4` honours every flag and produces a CMAF-clean fragmented MP4 — at the cost of needing a userland tail-reader to split the single output file into `init.mp4 + segment_NNNN.m4s`.

## Current implementation (Option B)

`server-rust/src/services/ffmpeg_file.rs::fmp4_muxer_options` builds the muxer args:

```rust
"-avoid_negative_ts", "make_zero",
"-f", "mp4",
"-movflags", "+frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets",
"-frag_duration", "2000000",  // 2 s per fragment
"<segment_dir>/chunk.fmp4",
```

`server-rust/src/services/fmp4_tail_reader.rs` runs as a tokio task alongside the ffmpeg child. It opens the growing `chunk.fmp4`, parses MP4 box headers in a loop, and writes `init.mp4` (everything before the first `moof`) + `segment_NNNN.m4s` (each `[moof + mdat]` pair) into the same directory using `<final>.tmp` + atomic rename. The segment watcher upstream filters by exact filename (`init.mp4`, `segment_NNNN.m4s`) and is invariant to which task wrote them.

When ffmpeg exits, the cascade signals the tail-reader via a oneshot, the reader drains any trailing bytes, then `chunk.fmp4` is removed (only the split files persist).

### What this fix unlocks

- **B-frames are back on** (no `-bf 0` workaround needed). 5–10 % bitrate saved at the same visual quality.
- All future muxer-level fixes (CMAF metadata, HDR signalling, audio-codec changes) propagate cleanly because ffmpeg sees a normal output path, not a wrapper.
- The tail-reader is reusable if we ever switch from disk-backed segments to streaming straight from ffmpeg's stdout pipe.

## How to spot a regression of the current fix

If a user reports "video is black, no error, MSE recovery exhausted":

1. Pull the latest `playback.session` trace from Seq.
2. Filter for `@MessageTemplate = 'video element error event'`. If you see `CHUNK_DEMUXER_ERROR_APPEND_FAILED` (Chromium) or `Invalid Top-Level Box` (Firefox), continue.
3. On disk, find the failing job in `tmp/segments-rust/<job_id>/` and run:
   ```sh
   cat init.mp4 segment_0000.m4s > /tmp/concat.mp4
   ffprobe -v error -show_entries packet=pts,dts -read_intervals "%+#1" /tmp/concat.mp4
   ```
4. If `dts < 0`, the muxer flags lost their effect — `fmp4_muxer_options` regressed or the cascade is somehow falling back to the HLS path. Restore.

Unit test `services::ffmpeg_file::tests::fmp4_muxer_options_emit_correct_movflags_and_output` asserts the load-bearing args (`-f mp4`, the movflags string, `-avoid_negative_ts make_zero`, the output path). Removing any breaks the build.

## References

- ffmpeg docs — [`-avoid_negative_ts`](https://ffmpeg.org/ffmpeg-formats.html#Format-Options).
- Chromium issue — [crbug.com/258131](https://crbug.com/258131) (MSE ignores `elst`, WontFix).
- Source code — `server-rust/src/services/ffmpeg_file.rs::fmp4_muxer_options`, `services/fmp4_tail_reader.rs`.
- Discovery traces — Seq `b8a3bcd9…`, `29c002af…`, `5dc0b70f…` (Firefox 4K reproductions of various stages of this bug).
- Sister caveat — `02-Tfdt-Sample-Mismatch.md` (the deeper reason the elst breaks MSE).
