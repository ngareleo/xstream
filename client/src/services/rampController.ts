/**
 * Cold-start chunk-duration ramp.
 *
 * `PlaybackController` calls `next()` once per chunk request to decide how
 * many seconds of source video to ask the server to transcode. The ramp
 * starts small (faster time-to-first-frame, smaller orphan ffmpeg jobs on
 * pause) and grows on each call until the tail is reached, after which every
 * subsequent call returns `steadyStateS`.
 *
 * The cursor is reset at every anchor point where the user effectively
 * starts a fresh playhead — session start, seek, MSE-detached recovery,
 * resolution swap. Re-entering the ramp on seek mirrors cold-start parity:
 * a seek produces the same fast first frame as `play()` from the watchlist.
 *
 * Stateful by design — one instance per `PlaybackController`, never shared
 * across sessions.
 */
export class RampController {
  private index = 0;

  constructor(
    private readonly ramp: readonly number[],
    private readonly steadyStateS: number
  ) {}

  /** Returns the next duration (seconds) and advances the cursor. Once the
   *  ramp tail is exhausted, returns `steadyStateS` for every subsequent
   *  call until `reset()` is called. */
  next(): number {
    const idx = this.index;
    this.index = idx + 1;
    return this.ramp[idx] ?? this.steadyStateS;
  }

  /** Rewinds the cursor to the head of the ramp. Call at session start,
   *  every seek, MSE-detached recovery, and resolution swap. */
  reset(): void {
    this.index = 0;
  }
}
