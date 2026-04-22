import { type Span } from "@opentelemetry/api";

import { getClientLogger, getClientTracer } from "~/telemetry.js";

import { BUFFERING_SPINNER_DELAY_MS } from "./playbackConfig.js";
import { getSessionContext } from "./playbackSession.js";

const log = getClientLogger("playback");
const tracer = getClientTracer("playback");

export interface StallTrackerDeps {
  videoEl: HTMLVideoElement;
  /** Seconds buffered ahead of the current playhead, or null if nothing buffered. */
  getBufferedAheadSeconds: () => number | null;
  /** Controller's startup flag — we only debounce-show the spinner for
   *  mid-playback stalls, not for the initial startup loading phase. */
  hasStartedPlayback: () => boolean;
  /** Called after BUFFERING_SPINNER_DELAY_MS of continuous stall so the
   *  controller can flip its status to "loading" and show the spinner. */
  onSpinnerShow: () => void;
}

/**
 * Tracks the user-visible playback stall lifecycle:
 * - Opens a `playback.stalled` span on `waiting` and closes it on `playing`
 *   (or on explicit end() calls from seek/teardown paths).
 * - Debounces the mid-playback spinner so brief decoder hiccups (< 2s) don't
 *   flash the UI.
 *
 * Owned by `PlaybackController`, which forwards the `waiting`/`playing`/
 * `stalled` video events to this class. Controller retains the seek-dedup
 * cleanup in its own `handlePlaying`; this class owns only the stall concern.
 */
export class StallTracker {
  private readonly deps: StallTrackerDeps;
  private stallSpan: Span | null = null;
  private stallStartedAt: number | null = null;
  private bufferingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: StallTrackerDeps) {
    this.deps = deps;
  }

  /** video `waiting` event — opens a stall span and schedules the debounced
   *  spinner. Skipped during the startup loading phase. */
  onWaiting = (): void => {
    if (!this.deps.hasStartedPlayback()) return;
    const stallStartedAt = Date.now();

    if (!this.stallSpan) {
      const bufferedAhead = this.deps.getBufferedAheadSeconds();
      this.stallStartedAt = stallStartedAt;
      this.stallSpan = tracer.startSpan(
        "playback.stalled",
        {
          attributes: {
            "video.current_time_s": parseFloat(this.deps.videoEl.currentTime.toFixed(2)),
            "buffer.buffered_ahead_s":
              bufferedAhead === null ? -1 : parseFloat(bufferedAhead.toFixed(2)),
            "buffer.empty": bufferedAhead === null,
          },
        },
        getSessionContext()
      );
    }

    this.bufferingTimer = setTimeout(() => {
      this.bufferingTimer = null;
      this.deps.onSpinnerShow();
      const stallDurationMs = Date.now() - stallStartedAt;
      log.warn(`Buffering stall >2s — showing spinner (stalled for ${stallDurationMs}ms)`, {
        stall_duration_ms: stallDurationMs,
      });
    }, BUFFERING_SPINNER_DELAY_MS);
  };

  /** video `stalled` event — network-slow warning, no state change. */
  onStalled = (): void => {
    log.warn("Stalled — network slow");
  };

  /** video `playing` event — clears the debounce timer and ends the span.
   *  Controller handles its own post-play work (seek dedup, status restore). */
  onPlaying = (): void => {
    this.clearBufferingTimer();
    this.end("resumed");
  };

  /** Closes the stall span with a reason event. Idempotent — safe to call on
   *  paths (teardown, seek) that may or may not have an open span. Also
   *  clears the debounce timer so a pending spinner doesn't fire after the
   *  span has been ended. */
  end(reason: string): void {
    this.clearBufferingTimer();
    if (!this.stallSpan) return;
    const durationMs = this.stallStartedAt !== null ? Date.now() - this.stallStartedAt : 0;
    this.stallSpan.setAttribute("stall.duration_ms", durationMs);
    this.stallSpan.addEvent(reason);
    this.stallSpan.end();
    this.stallSpan = null;
    this.stallStartedAt = null;
  }

  private clearBufferingTimer(): void {
    if (this.bufferingTimer !== null) {
      clearTimeout(this.bufferingTimer);
      this.bufferingTimer = null;
    }
  }
}
