/**
 * Single source of truth for client-side compile-time tunables. Mirrors the
 * server's `AppConfig` shape (`server-rust/src/config.rs`) — a single exported
 * object with nested namespaces. Runtime-mutable user preferences live in
 * `featureFlags.ts` instead; this file is for non-toggleable defaults.
 *
 * Side-effect-free by design — eager importers (the flag registry, the
 * feature-flag context) pull only the data, not any of the playback-machinery
 * classes.
 */

import type { Resolution } from "~/types.js";

export interface ClientConfig {
  playback: {
    /** Per-chunk duration ramp (seconds). Each new playback session — and
     *  every seek — re-enters this sequence at index 0, advancing one step
     *  per chunk request until the tail is reached. Smaller initial chunks
     *  cut time-to-first-frame; the steady growth keeps the buffer filling
     *  without producing the giant orphan ffmpeg jobs a fixed 300 s window
     *  left behind on pause/seek. After the tail, every subsequent request
     *  uses `chunkSteadyStateS`. */
    chunkRampS: readonly number[];
    /** Steady-state chunk size after the ramp tail (seconds). Applied to
     *  every chunk past `chunkRampS.length`. Tunable separately from the
     *  ramp tail so the steady state can be widened later without changing
     *  the cold-start curve. */
    chunkSteadyStateS: number;
    /** How close to the end of the current chunk (in seconds) we start
     *  prefetching the next one. Sized to absorb ffmpeg cold-start (~25-30 s
     *  on 4K VAAPI) plus a HW→SW fallback (~30 s of failed VAAPI before the
     *  chunker retries), with margin left for backpressure holding chunk N's
     *  tail near 20 s. */
    prefetchThresholdS: number;
    /** Minimum buffered seconds before `video.play()` is called on initial
     *  load. Held uniformly low across resolutions: the ramp's 10 s first
     *  chunk gives an 8 s safety margin against post-play decoder stalls
     *  even at 4K, since the playhead can only catch the buffer if ffmpeg
     *  falls below realtime — which is itself a stall worth surfacing
     *  rather than hiding behind a deeper gate. Earlier per-resolution
     *  values (4 s @ 720p, 6 s @ 1080p, 5 s @ 4K) were rooted in the
     *  pre-ramp 30 s first-chunk window and the assumption that a higher
     *  resolution implied a longer cold start; under the ramp + the
     *  page-mount prewarm, that's no longer the dominant variable. */
    startupBufferS: Record<Resolution, number>;
    /** Show the mid-playback buffering spinner only after this much continuous
     *  stall. Brief decoder hiccups under the threshold are swallowed. */
    bufferingSpinnerDelayMs: number;
    /** Media bytes under this threshold mean the chunk had no real frames
     *  (ffmpeg emits a ~24B placeholder when the seek position is past
     *  encoded content). */
    minRealChunkBytes: number;
    /** Grace window after `videoEl.play()` during which the StallTracker
     *  spinner-debounce is suppressed. The video element fires `waiting` for
     *  hundreds of ms while the decoder renders the first frame; that's not
     *  a user-visible freeze, so we skip the 2 s debounce. Self-expires so
     *  an extreme post-resume stall still surfaces. */
    firstRenderGraceMs: number;
    /** Tolerance when checking if a seek target is already buffered — avoids
     *  false positives right at the buffered-end edge where the decoder may
     *  still stall briefly. */
    seekBufferedToleranceS: number;
    /** Poller interval driving the BufferManager backpressure check while
     *  the user is paused (`timeupdate` is silent during pause, so we tick
     *  manually). */
    userPausePollIntervalMs: number;
    /** Three-tier retry policy for transient `startTranscode` failures. */
    maxRecoveryAttempts: number;
    /** Exponential backoff schedule (ms) for the retry loop above. */
    defaultBackoffMs: readonly number[];
    /** PlaybackTimeline drift detection: if an actual seam diverges from the
     *  prediction by more than this, fire a `playback.timeline_drift` event. */
    driftThresholdMs: number;
    /** Window size for the rolling average of first-byte latencies used to
     *  predict the next chunk's seam. */
    rollingFirstByteWindow: number;
  };
  buffer: {
    /** Pause the stream when bufferedAhead (seconds queued in front of the
     *  playhead) exceeds this value. */
    forwardTargetS: number;
    /** Resume the stream only after bufferedAhead drains below this value.
     *  The gap between target and resume is the hysteresis width. See
     *  `docs/architecture/Streaming/00-Protocol.md → Hysteresis: tuning the gap`. */
    forwardResumeS: number;
    /** Keep at most this many seconds of media behind the playhead in the
     *  SourceBuffer; everything older is evicted on each append to cap memory. */
    backBufferKeepS: number;
    /** Emit a buffer-health log every N appended segments. */
    healthLogIntervalSegments: number;
  };
}

export const clientConfig: ClientConfig = {
  playback: {
    chunkRampS: [10, 15, 20, 30, 45, 60] as const,
    chunkSteadyStateS: 60,
    prefetchThresholdS: 90,
    startupBufferS: {
      "240p": 2,
      "360p": 2,
      "480p": 2,
      "720p": 2,
      "1080p": 2,
      "4k": 2,
    },
    bufferingSpinnerDelayMs: 2000,
    minRealChunkBytes: 1024,
    firstRenderGraceMs: 5000,
    seekBufferedToleranceS: 0.5,
    userPausePollIntervalMs: 1000,
    maxRecoveryAttempts: 3,
    defaultBackoffMs: [500, 1000, 2000] as const,
    driftThresholdMs: 5000,
    rollingFirstByteWindow: 5,
  },
  buffer: {
    forwardTargetS: 60,
    forwardResumeS: 20,
    backBufferKeepS: 10,
    healthLogIntervalSegments: 20,
  },
};

/** Type alias preserved for consumers that previously imported `BufferConfig`
 *  from `bufferConfig.ts`. */
export type BufferConfig = ClientConfig["buffer"];
