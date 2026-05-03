# FFmpeg Caveats — Overview

This file is the **rolling index** of ffmpeg / fmp4 / MSE incompatibilities we've discovered. Each row points at a sibling file (`NN-<Slug>.md`) with the full investigation: what we observed, why it happens, the fix, and how to spot a regression of it.

The catalogue exists because **the ffmpeg defaults that work for "play this in VLC" do NOT all work for "play this in a browser via Media Source Extensions"**. MSE drops several MP4 features browsers consider out-of-scope (edit lists, sample tables on file-level moov, on-the-fly metadata updates), and ffmpeg's HLS-fmp4 muxer leaves several "I'll let the demuxer figure it out" defaults that an MSE consumer can't recover from. Each entry below is a specific defect + override.

## Caveats

| # | Trigger | Symptom | Fix | Detail |
|---|---|---|---|---|
| 01 | B-frame reorder at chunk start (any source with B-frames > 0 starting near IDR). | First packet has `dts < 0` in the output timebase; MSE rejects sample on Chromium with `CHUNK_DEMUXER_ERROR_APPEND_FAILED: Failed to prepare video sample for decode`; Firefox surfaces it as `Invalid Top-Level Box: <random bytes>`. | Drop the HLS muxer entirely. `-f mp4 -movflags +frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets -avoid_negative_ts make_zero`, plus a Rust tail-reader (`services/fmp4_tail_reader.rs`) that splits the single growing file into `init.mp4 + segment_NNNN.m4s`. | [`01-Negative-DTS.md`](01-Negative-DTS.md) |
| 02 | Empty `elst` edit emitted by the mov muxer when first-sample PTS isn't exactly 0. | `tfdt` claims fragment starts at decode-time 0 (post-edit) but first sample's actual DTS is +504 ticks (pre-edit). MSE ignores `elst` so the offset accumulates; demuxer trips after 2–5 s with the same family of errors as 01. | Same fix as 01 — `+negative_cts_offsets` propagates only with direct `-f mp4`, not with the HLS wrapper. | [`02-Tfdt-Sample-Mismatch.md`](02-Tfdt-Sample-Mismatch.md) |
| 03 | Pool permit held until kernel reaps child post-SIGTERM (not a caveat but a lifecycle invariant). | User seeks during playback → old foreground + prefetch jobs killed → post-seek transcode request bounces with `CAPACITY_EXHAUSTED` for ~100–500 ms while zombies are still in the process table. | Semaphore permit moves into `LivePid` at spawn; `kill_job` extracts and drops it immediately, decoupling "slot claimed" from "kernel reap pending." Permit stays in `LivePid` only if job exits naturally. See `docs/architecture/Streaming/06-FfmpegPool.md` § "Permit lifecycle". | Pool design, not ffmpeg. Documented in streaming architecture, not caveats — but the downstream playback path depends on this behavior. |

## How to add an entry

1. Create `NN-<Slug>.md` (next sequence number) following the structure in `01-Negative-DTS.md`: **Symptom**, **Reproduction**, **Root cause**, **Fix**, **How to spot a regression**.
2. Add a row to the table above with a one-line trigger/symptom/fix.
3. Update `README.md` so the parent index also lists the new file.
4. Notify the `architect` subagent so cross-cutting `INDEX.md` / `SUMMARY.md` rows can be refreshed.

## Why these live in `docs/server/`, not `docs/architecture/Streaming/`

Streaming docs describe the **wire protocol** between server and client (length-prefixed framing, backpressure, init-then-segments). Caveats here describe **decisions inside the server's ffmpeg invocation** that downstream consumers of the protocol depend on. Two different audiences — protocol consumers don't need to know we passed `-avoid_negative_ts`, but the next agent who touches `services/ffmpeg_file.rs` absolutely does.
