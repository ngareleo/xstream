/**
 * Pure data + type declarations for PlaybackController. Kept free of side
 * effects (no logger, no tracer, no module-level calls) so eager importers —
 * e.g. a future `flagRegistry.ts` entry that tunes a playback constant — can
 * reference these without dragging the full `PlaybackController` class into
 * the index bundle. Mirrors the pattern used by `bufferConfig.ts`.
 */

import type { Resolution } from "~/types.js";

/** Fixed encoded-segment duration in seconds. Every chunk mutation asks ffmpeg
 *  for exactly this many seconds of media. */
export const CHUNK_DURATION_S = 300;

/** Window length for the first chunk after a mid-file seek (startS > 0).
 *  Picked short enough that the prefetch RAF (PREFETCH_THRESHOLD_S = 90)
 *  trips immediately and eager-warms ffmpeg for the next chunk in parallel.
 *  NOT used at startS = 0 — `-ss 0 -t 30` on VAAPI HDR 4K silently produces
 *  zero segments (trace 1bac05bd…). Cold-start, MSE recovery at
 *  currentTime < 300, and seek-to-0 all fall back to CHUNK_DURATION_S. See
 *  `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`. */
export const FIRST_CHUNK_DURATION_S = 30;

/** How close to the end of the current chunk (in seconds) we start prefetching
 *  the next one. Sized to absorb ffmpeg cold-start (~25–30 s on 4K VAAPI) plus
 *  a HW→software fallback (~30 s of failed VAAPI before the chunker retries),
 *  with margin left over for backpressure holding chunk N's tail near 20 s. */
export const PREFETCH_THRESHOLD_S = 90;

/** Minimum buffered seconds before `video.play()` is called on initial load.
 *  Larger resolutions need more lead-time because the first frames take longer
 *  to decode/render. The 4K value was reduced from 10s after a Seq trace
 *  analysis showed the startup-buffer fill phase accounted for ~69% of TTFF
 *  on cold-start (~2.1s of a ~3.1s total). 5s cuts ~1s off TTFF directly;
 *  if a 4K cold-start stalls immediately after `play()`, the existing
 *  `playback.stalled` span flags it. */
export const STARTUP_BUFFER_S: Record<Resolution, number> = {
  "240p": 2,
  "360p": 2,
  "480p": 3,
  "720p": 4,
  "1080p": 6,
  "4k": 5,
};

/** Show the mid-playback buffering spinner only after this much continuous
 *  stall. Brief decoder hiccups under the threshold are swallowed. */
export const BUFFERING_SPINNER_DELAY_MS = 2000;

/** Media bytes under this threshold mean the chunk had no real frames (ffmpeg
 *  emits a ~24B placeholder when the seek position is past encoded content). */
export const MIN_REAL_CHUNK_BYTES = 1024;

export type PlaybackStatus = "idle" | "loading" | "playing";
