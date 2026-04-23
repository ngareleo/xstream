/**
 * Pure data module for BufferManager configuration. Kept free of side effects
 * (no loggers, no tracer init) so eager importers — `config/featureFlags.ts`
 * and `config/flagRegistry.ts` — do not pull the full `BufferManager` class
 * into the index bundle. `BufferManager.ts` re-imports these from here.
 */

export interface BufferConfig {
  /** Pause the stream when bufferedAhead (seconds queued in front of the
   *  playhead) exceeds this value. Larger = more memory pressure but fewer
   *  stalls if the network is bursty. */
  forwardTargetS: number;
  /** Resume the stream only after bufferedAhead drains below this value. The
   *  gap between target and resume is the hysteresis width: wider gaps produce
   *  fewer, longer halts; narrow gaps (<5s) cause rapid pause/resume churn. At
   *  the defaults (target 60s + backBufferKeepS 10s) peak resident buffer is
   *  ~70s, which is ~133 MB at 4K (15.2 Mbps). Each pause→resume cycle lasts
   *  approximately `forwardTargetS - forwardResumeS` seconds of playback,
   *  because playback drains at 1× while the stream is halted.
   *  See `docs/architecture/Streaming/00-Protocol.md → Hysteresis: tuning the gap`. */
  forwardResumeS: number;
  /** Keep at most this many seconds of media behind the playhead in the
   *  SourceBuffer; everything older is evicted on each append to cap memory. */
  backBufferKeepS: number;
  /** Emit a buffer-health log every N appended segments. Guards against log
   *  flooding at high bitrates — one line per segment at 4K would drown Seq. */
  healthLogIntervalSegments: number;
}

export const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  forwardTargetS: 60,
  forwardResumeS: 20,
  backBufferKeepS: 10,
  healthLogIntervalSegments: 20,
};
