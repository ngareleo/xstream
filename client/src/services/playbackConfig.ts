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

/** HLS fMP4 segment duration emitted by the chunker. Mirrors the server's
 *  `RESOLUTION_PROFILES[res].segmentDuration` (currently 2 s for every
 *  resolution). Used by the seek path to compute `?from=K` so the server
 *  skips segments that land entirely behind the user's seekTime — without
 *  it Chrome's MSE auto-evicts those frames as they're appended (segments
 *  are placed at PTS=chunkStart in `mode="segments"`, so they're "behind"
 *  currentTime when seekTime > chunkStart). */
export const SEGMENT_DURATION_S = 2;

/** How close to the end of the current chunk (in seconds) we start prefetching
 *  the next one. Sized to absorb ffmpeg cold-start (~25–30 s on 4K VAAPI) plus
 *  a HW→software fallback (~30 s of failed VAAPI before the chunker retries),
 *  with margin left over for backpressure holding chunk N's tail near 20 s. */
export const PREFETCH_THRESHOLD_S = 90;

/** Minimum buffered seconds before `video.play()` is called on initial load.
 *  Larger resolutions need more lead-time because the first frames take longer
 *  to decode/render. */
export const STARTUP_BUFFER_S: Record<Resolution, number> = {
  "240p": 2,
  "360p": 2,
  "480p": 3,
  "720p": 4,
  "1080p": 6,
  "4k": 10,
};

/** Show the mid-playback buffering spinner only after this much continuous
 *  stall. Brief decoder hiccups under the threshold are swallowed. */
export const BUFFERING_SPINNER_DELAY_MS = 2000;

/** Media bytes under this threshold mean the chunk had no real frames (ffmpeg
 *  emits a ~24B placeholder when the seek position is past encoded content). */
export const MIN_REAL_CHUNK_BYTES = 1024;

export type PlaybackStatus = "idle" | "loading" | "playing";
