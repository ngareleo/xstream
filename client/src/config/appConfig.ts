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
    /** Encoded-segment window for steady-state forward play. Each chunk
     *  mutation requests this many seconds of media. */
    chunkDurationS: number;
    /** Window length for the first chunk after a mid-file seek (startS > 0).
     *  Picked short enough that the prefetch RAF (`prefetchThresholdS = 90`)
     *  trips immediately and eager-warms ffmpeg for the next chunk. NOT used
     *  at startS = 0 — `-ss 0 -t 30` on VAAPI HDR 4K silently produces zero
     *  segments (trace 1bac05bd…). See
     *  `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md`. */
    firstChunkDurationS: number;
    /** How close to the end of the current chunk (in seconds) we start
     *  prefetching the next one. Sized to absorb ffmpeg cold-start (~25-30 s
     *  on 4K VAAPI) plus a HW→SW fallback (~30 s of failed VAAPI before the
     *  chunker retries), with margin left for backpressure holding chunk N's
     *  tail near 20 s. */
    prefetchThresholdS: number;
    /** Minimum buffered seconds before `video.play()` is called on initial
     *  load. Larger resolutions need more lead-time because the first frames
     *  take longer to decode/render. The 4K value was reduced from 10 s after
     *  a Seq cold-start trace showed the startup-buffer fill phase accounted
     *  for ~69 % of TTFF (~2.1 s of a ~3.1 s total). */
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
    /** Nudge added to seekTime when computing the next snap boundary, so
     *  seeks that land exactly on a 300 s grid boundary still produce a
     *  non-degenerate chunk (NOT [N, N) zero-length). */
    seekSnapNudgeS: number;
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
    chunkDurationS: 300,
    firstChunkDurationS: 30,
    prefetchThresholdS: 90,
    startupBufferS: {
      "240p": 2,
      "360p": 2,
      "480p": 3,
      "720p": 4,
      "1080p": 6,
      "4k": 5,
    },
    bufferingSpinnerDelayMs: 2000,
    minRealChunkBytes: 1024,
    firstRenderGraceMs: 5000,
    seekBufferedToleranceS: 0.5,
    seekSnapNudgeS: 0.001,
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
