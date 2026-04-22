/**
 * Wall-clock predictions for upcoming pipeline events. Pure observability —
 * the rest of the system never reads from this to make coordination
 * decisions. The value is in two places:
 *
 *  1. Future trace inspection. Today, when a chunk-handover stall happens,
 *     reconstructing what the system *expected* takes manual cross-referencing
 *     of `chunk.stream` start times, `transcode.request` timing, and chunk
 *     boundaries. Surfacing the predictions as span attributes makes the
 *     mismatch visible at a glance.
 *  2. Regression detection. The `onDrift` callback fires when an actual event
 *     diverges from the prediction by more than `DRIFT_THRESHOLD_MS`,
 *     producing a `playback.timeline_drift` event in the session span. A
 *     trace with a drift event is a trace whose pipeline timing changed
 *     unexpectedly relative to the recent baseline.
 *
 * Predictions are based on a rolling window of recent observations, so the
 * first chunk handover in a session has no prediction (and thus no drift
 * event). Subsequent handovers compare actual first-byte latency to the
 * rolling avg of prior handovers in this session.
 */

const DRIFT_THRESHOLD_MS = 5000;
/** Number of recent first-byte latencies kept for the rolling average. */
const ROLLING_WINDOW = 5;

export interface PlaybackTimelineDrift {
  dimension: "lookahead_first_byte";
  predictedAtMs: DOMHighResTimeStamp;
  actualAtMs: DOMHighResTimeStamp;
  driftMs: number;
  jobId: string;
}

export interface PlaybackTimelineEvents {
  onDrift: (drift: PlaybackTimelineDrift) => void;
}

export interface TimelineSnapshot {
  foregroundChunkStartS: number | null;
  foregroundChunkEndS: number | null;
  /** Wall-clock projection of when the playhead will reach chunkEnd. Assumes
   *  1x playback rate. Computed at snapshot time, not stored. */
  expectedSeamAtMs: DOMHighResTimeStamp | null;
  lookaheadJobId: string | null;
  lookaheadOpenedAtMs: DOMHighResTimeStamp | null;
  /** Wall-clock prediction of when the lookahead's first media byte will
   *  arrive, based on rolling avg of prior chunks. Null until at least one
   *  prior chunk's first-byte latency has been observed. */
  expectedFirstByteAtMs: DOMHighResTimeStamp | null;
  rollingAvgFirstByteLatencyMs: number | null;
}

export class PlaybackTimeline {
  private foregroundChunkStartS: number | null = null;
  private foregroundChunkEndS: number | null = null;

  private lookaheadJobId: string | null = null;
  private lookaheadOpenedAtMs: DOMHighResTimeStamp | null = null;

  private firstByteLatenciesMs: number[] = [];

  constructor(private readonly events: PlaybackTimelineEvents) {}

  /** Called when the foreground chunk changes — initial start, promotion, seek,
   *  resolution swap. */
  setForegroundChunk(chunkStartS: number, chunkEndS: number): void {
    this.foregroundChunkStartS = chunkStartS;
    this.foregroundChunkEndS = chunkEndS;
  }

  /** Called when ChunkPipeline.openLookahead fires — captures the prefetch-time
   *  wall clock for later drift comparison. */
  recordLookaheadOpened(jobId: string): void {
    this.lookaheadJobId = jobId;
    this.lookaheadOpenedAtMs = performance.now();
  }

  /** Called when the lookahead's first media segment is appended. Compares to
   *  the prediction (rolling avg of prior chunks) and fires an onDrift event
   *  if the divergence exceeds the threshold. Adds the observed latency to
   *  the rolling window for future predictions. */
  recordLookaheadFirstByte(jobId: string, actualAtMs: DOMHighResTimeStamp): void {
    if (jobId !== this.lookaheadJobId || this.lookaheadOpenedAtMs === null) return;
    const latencyMs = actualAtMs - this.lookaheadOpenedAtMs;

    const predictedLatency = this.rollingAvg();
    if (predictedLatency !== null) {
      const predictedAtMs = this.lookaheadOpenedAtMs + predictedLatency;
      const driftMs = actualAtMs - predictedAtMs;
      if (Math.abs(driftMs) > DRIFT_THRESHOLD_MS) {
        this.events.onDrift({
          dimension: "lookahead_first_byte",
          predictedAtMs,
          actualAtMs,
          driftMs,
          jobId,
        });
      }
    }

    this.firstByteLatenciesMs.push(latencyMs);
    if (this.firstByteLatenciesMs.length > ROLLING_WINDOW) {
      this.firstByteLatenciesMs.shift();
    }
  }

  /** Called when the lookahead is promoted to foreground (or cancelled). */
  clearLookahead(): void {
    this.lookaheadJobId = null;
    this.lookaheadOpenedAtMs = null;
  }

  /** Snapshot used to surface predictions as span attributes. The
   *  `expectedSeamAtMs` projection assumes 1x playback rate — under heavy
   *  pause/resume cycling the projection will lag, which is itself a useful
   *  observability signal (a wide gap between predicted and actual seam
   *  crossing means the playback rate diverged from 1x). */
  snapshot(currentTimeS: number | null): TimelineSnapshot {
    let expectedSeamAtMs: DOMHighResTimeStamp | null = null;
    if (this.foregroundChunkEndS !== null && currentTimeS !== null) {
      const remainingS = this.foregroundChunkEndS - currentTimeS;
      expectedSeamAtMs = performance.now() + remainingS * 1000;
    }

    const rollingAvg = this.rollingAvg();
    const expectedFirstByteAtMs =
      this.lookaheadOpenedAtMs !== null && rollingAvg !== null
        ? this.lookaheadOpenedAtMs + rollingAvg
        : null;

    return {
      foregroundChunkStartS: this.foregroundChunkStartS,
      foregroundChunkEndS: this.foregroundChunkEndS,
      expectedSeamAtMs,
      lookaheadJobId: this.lookaheadJobId,
      lookaheadOpenedAtMs: this.lookaheadOpenedAtMs,
      expectedFirstByteAtMs,
      rollingAvgFirstByteLatencyMs: rollingAvg,
    };
  }

  private rollingAvg(): number | null {
    if (this.firstByteLatenciesMs.length === 0) return null;
    const sum = this.firstByteLatenciesMs.reduce((a, b) => a + b, 0);
    return sum / this.firstByteLatenciesMs.length;
  }
}
