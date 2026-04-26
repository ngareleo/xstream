import { context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";

import { getEffectiveBufferConfig } from "~/config/featureFlags.js";
import { getClientLogger, getClientTracer } from "~/telemetry.js";
import { type Resolution, RESOLUTION_MIME_TYPE } from "~/types.js";

import { BufferManager } from "./bufferManager.js";
import { ChunkPipeline, type StreamOutcome } from "./chunkPipeline.js";
import {
  CHUNK_DURATION_S,
  type PlaybackStatus,
  PREFETCH_THRESHOLD_S,
  STARTUP_BUFFER_S,
} from "./playbackConfig.js";
import { isPlaybackError } from "./playbackErrors.js";
import { clearSessionContext, getSessionContext, setSessionContext } from "./playbackSession.js";
import { PlaybackTicker } from "./playbackTicker.js";
import { PlaybackTimeline } from "./playbackTimeline.js";
import { StallTracker } from "./stallTracker.js";

/**
 * Retry policy for transient `startTranscode` failures (currently only
 * `CAPACITY_EXHAUSTED`). Mirrors `BufferManager.appendBuffer`'s 3-tier shape:
 * named attempts, fatal flag, structured per-attempt span events. Backoff
 * uses the server's `retryAfterMs` hint when present, falling back to the
 * exponential schedule below.
 */
const MAX_RECOVERY_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = [500, 1000, 2000] as const;

export { type PlaybackStatus };

const playbackLog = getClientLogger("playback");
const playbackTracer = getClientTracer("playback");

export interface StartTranscodeChunkArgs {
  resolution: Resolution;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

export interface StartTranscodeChunkResult {
  /** TranscodeJob local ID (decoded from the Relay global ID). */
  rawJobId: string;
  /** Relay global ID — passed to the onJobCreated event so subscribers can open a subscription. */
  globalJobId: string;
}

export type StartTranscodeChunkFn = (
  args: StartTranscodeChunkArgs
) => Promise<StartTranscodeChunkResult>;

export interface RecordSessionArgs {
  traceId: string;
  resolution: Resolution;
}

export type RecordSessionFn = (args: RecordSessionArgs) => void;

export interface PlaybackControllerDeps {
  videoEl: HTMLVideoElement;
  /** Returns the current video ID. Called via getter so a changing prop is honoured
   * without recreating the controller. */
  getVideoId: () => string;
  /** Returns the current video duration in seconds (same rationale as getVideoId). */
  getVideoDurationS: () => number;
  /** Fires the startTranscode mutation for one chunk. The hook owns the Relay plumbing. */
  startTranscodeChunk: StartTranscodeChunkFn;
  /** Fires the recordPlaybackSession mutation. Fire-and-forget; errors are ignored upstream. */
  recordSession: RecordSessionFn;
}

export interface PlaybackControllerEvents {
  onStatusChange: (s: PlaybackStatus) => void;
  onError: (e: string | null) => void;
  onJobCreated: (id: string | null) => void;
}

/**
 * Plain-TS orchestrator for chunked playback. Owns all the mutable state (MSE
 * buffer, active stream, session span, RAF handles, seek dedup flags) that
 * previously lived as refs inside useChunkedPlayback. The React hook wraps this
 * class and bridges status/error updates back into useState.
 */
export class PlaybackController {
  private readonly deps: PlaybackControllerDeps;
  private readonly events: PlaybackControllerEvents;

  private status: PlaybackStatus = "idle";
  private resolution: Resolution = "240p";
  private sessionSpan: Span | null = null;

  private buffer: BufferManager | null = null;
  private pipeline: ChunkPipeline | null = null;
  private bgBuffer: BufferManager | null = null;
  private bgPipeline: ChunkPipeline | null = null;
  // Forwarder for the background pipeline's foreground onStreamEnded — starts
  // as a no-op while the bg buffer is being filled in the background, then is
  // re-pointed to the real handleChunkEnded after the swap. The closure is
  // captured by the slot's opts at openSlot time, so reassigning this variable
  // (not the opts object) is what threads the new behaviour through.
  private bgOnStreamEnded: (outcome: StreamOutcome) => void = () => {};

  private chunkEnd = 0;
  private prefetchFired = false;

  private hasStartedPlayback = false;

  private isHandlingSeek = false;
  // Tracks the chunk-boundary snap target of the most-recent seek so that the
  // asynchronously-queued "seeking" event fired by BufferManager.seek()'s own
  // videoEl.currentTime assignment doesn't re-trigger a full seek/flush cycle.
  // Cleared when the video fires "playing" (seek resolved, playback resumed).
  private seekTarget: number | null = null;
  // Set by seekTo() before updating currentTime so handleSeeking can read the
  // unclamped target instead of whatever the browser clamped currentTime to.
  private pendingSeekTarget: number | null = null;

  private readonly ticker: PlaybackTicker;
  private cancelPrefetchHandler: (() => void) | null = null;
  private cancelStartupHandler: (() => void) | null = null;
  private cancelBgReadyHandler: (() => void) | null = null;

  private readonly timeline: PlaybackTimeline;

  private readonly stallTracker: StallTracker;

  private detachListeners: Array<() => void> = [];

  /** Per-session budget for MediaSource recreates (MSE_DETACHED recovery).
   * Each recreate decrements this. Zero = surface MSE_DETACHED to the user as
   * a fatal error rather than loop-recreating forever. Reset on teardown /
   * new session. Kept small (3) because a recreate costs ~200-500ms and more
   * than 3 in one session means the cumulative-byte rate is still too high
   * despite pull-pacing — at that point fail fast, don't mask the regression. */
  private mseRecreatesRemaining = 3;
  private recreateInProgress = false;

  constructor(deps: PlaybackControllerDeps, events: PlaybackControllerEvents) {
    this.deps = deps;
    this.events = events;
    this.ticker = new PlaybackTicker();
    this.timeline = new PlaybackTimeline({
      onDrift: (drift) => {
        playbackLog.warn(
          `Timeline drift on ${drift.dimension} — predicted ${drift.predictedAtMs.toFixed(0)}ms, actual ${drift.actualAtMs.toFixed(0)}ms (drift ${drift.driftMs.toFixed(0)}ms)`,
          {
            timeline_dimension: drift.dimension,
            timeline_predicted_at_ms: parseFloat(drift.predictedAtMs.toFixed(2)),
            timeline_actual_at_ms: parseFloat(drift.actualAtMs.toFixed(2)),
            timeline_drift_ms: parseFloat(drift.driftMs.toFixed(2)),
            timeline_job_id: drift.jobId,
          }
        );
        this.sessionSpan?.addEvent("playback.timeline_drift", {
          "timeline.dimension": drift.dimension,
          "timeline.predicted_at_ms": parseFloat(drift.predictedAtMs.toFixed(2)),
          "timeline.actual_at_ms": parseFloat(drift.actualAtMs.toFixed(2)),
          "timeline.drift_ms": parseFloat(drift.driftMs.toFixed(2)),
          "timeline.job_id": drift.jobId,
        });
      },
    });
    this.stallTracker = new StallTracker({
      videoEl: deps.videoEl,
      getBufferedAheadSeconds: () =>
        this.buffer?.getBufferedAheadSeconds(deps.videoEl.currentTime) ?? null,
      hasStartedPlayback: () => this.hasStartedPlayback,
      onSpinnerShow: () => this.setStatus("loading"),
      ticker: this.ticker,
    });
    this.attachVideoListeners();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  startPlayback(res: Resolution): void {
    const videoEl = this.deps.videoEl;

    // Resolution switch while playing → background buffer swap
    if (this.status === "playing" && this.buffer) {
      this.resolution = res;
      this.switchResolution(res);
      return;
    }

    this.resetForNewSession("new_session");
    this.setError(null);
    this.setStatus("loading");
    this.resolution = res;
    this.hasStartedPlayback = false;

    const videoId = this.deps.getVideoId();
    const videoDurationS = this.deps.getVideoDurationS();

    // Start a root span for this playback session. All child spans (fetch,
    // buffer appends) will link to this trace via W3C traceparent propagation.
    const sessionSpan = playbackTracer.startSpan("playback.session", {
      attributes: { "video.id": videoId, "playback.resolution": res },
    });
    this.sessionSpan = sessionSpan;
    const traceId = sessionSpan.spanContext().traceId;

    // Record the session in the DB so the user can look it up in Seq later.
    this.deps.recordSession({ traceId, resolution: res });

    playbackLog.info(
      `Playback started: ${res} for video ${videoId} (${videoDurationS}s total, traceId: ${traceId})`,
      {
        video_id: videoId,
        resolution: res,
        duration_s: videoDurationS,
        trace_id: traceId,
      }
    );

    // Store the session context module-wide so all log records emitted from
    // async callbacks (fetch, RAF, Promise chains) carry this traceId.
    // The browser has no AsyncLocalStorage, so context.with() alone is not
    // enough — it only covers the synchronous frame.
    const sessionCtx = trace.setSpan(context.active(), sessionSpan);
    setSessionContext(sessionCtx);

    // Closure-capture the pipeline OBJECT (not `this.pipeline`) so the buffer's
    // pause/resume keep working even if `this.pipeline` is reassigned during a
    // resolution swap. Forward-declared because the pipeline needs the buffer.
    // eslint-disable-next-line prefer-const -- captured by buffer's pause/resume closures, assigned after buffer construction
    let pipeline: ChunkPipeline;
    const buffer = new BufferManager(
      videoEl,
      () => pipeline.pauseAll(),
      () => pipeline.resumeAll(),
      videoDurationS,
      getEffectiveBufferConfig(),
      () => this.handleMseDetached(res)
    );
    pipeline = new ChunkPipeline(buffer, playbackTracer, playbackLog, videoEl);
    this.buffer = buffer;
    this.pipeline = pipeline;

    void context.with(sessionCtx, () =>
      buffer
        .init(RESOLUTION_MIME_TYPE[res])
        .then(() => {
          playbackLog.info(`MSE ready: ${RESOLUTION_MIME_TYPE[res]}`, {
            mime_type: RESOLUTION_MIME_TYPE[res],
          });
          this.startChunkSeries(res, 0, buffer, true);
          this.startPrefetchLoop(res);
        })
        .catch((err: Error) => {
          const msg = `MSE init failed: ${err.message}`;
          playbackLog.error("MSE init failed", { message: err.message });
          sessionSpan.addEvent("mse_init_failed", { message: err.message });
          sessionSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          this.setError(msg);
          this.setStatus("idle");
        })
    );
  }

  seekTo(targetSeconds: number): void {
    // Store the intended target BEFORE setting currentTime so that the
    // synchronous "seeking" DOM event fires while pendingSeekTarget is set.
    this.pendingSeekTarget = targetSeconds;
    this.deps.videoEl.currentTime = targetSeconds;
  }

  teardown(): void {
    this.resetForNewSession();
    for (const detach of this.detachListeners) detach();
    this.detachListeners = [];
  }

  // ── State helpers ──────────────────────────────────────────────────────────

  private setStatus(s: PlaybackStatus): void {
    this.status = s;
    this.events.onStatusChange(s);
  }

  private setError(e: string | null): void {
    this.events.onError(e);
  }

  /** Resets all per-session state. Called from teardown() and startPlayback(). */
  private resetForNewSession(reason: "teardown" | "new_session" = "teardown"): void {
    this.ticker.shutdown();
    this.cancelStartupHandler = null;
    this.cancelPrefetchHandler = null;
    this.cancelBgReadyHandler = null;
    this.stallTracker.end(reason === "new_session" ? "new_session" : "teardown");
    this.pipeline?.cancel(reason);
    this.pipeline = null;
    this.buffer?.teardown();
    this.buffer = null;

    this.bgPipeline?.cancel(reason);
    this.bgPipeline = null;
    this.bgBuffer?.teardown(false);
    this.bgBuffer = null;
    this.bgOnStreamEnded = (): void => {};

    this.chunkEnd = 0;
    this.prefetchFired = false;
    this.hasStartedPlayback = false;
    this.seekTarget = null;
    this.mseRecreatesRemaining = 3;
    this.recreateInProgress = false;

    if (this.sessionSpan) {
      this.sessionSpan.addEvent("session_ended", { reason });
      this.sessionSpan.end();
      this.sessionSpan = null;
    }
    clearSessionContext();

    this.events.onJobCreated(null);
    playbackLog.info("Playback teardown");
  }

  /**
   * Drives video.play() once the buffer has enough content. Shared by initial
   * startup and seek-resume — both want the same gate: setAfterAppend fires on
   * every real append (fast cache-hit paths) and checkReady polls at display
   * frame rate as a fallback for slow live-transcode paths where no segment may
   * be ready for many seconds.
   */
  private waitForStartupBuffer(buffer: BufferManager, target: number, onPlay: () => void): void {
    const tryPlay = (): void => {
      if (this.hasStartedPlayback) return;
      if (buffer.bufferedEnd >= target) {
        this.hasStartedPlayback = true;
        buffer.setAfterAppend(null);
        onPlay();
      }
    };
    buffer.setAfterAppend(tryPlay);
    // Cancel any pre-existing startup handler — possible during a seek-resume
    // that fires before the previous one resolved.
    this.cancelStartupHandler?.();
    this.cancelStartupHandler = this.ticker.register(() => {
      tryPlay();
      return !this.hasStartedPlayback;
    });
  }

  /** Handles chunk N's stream completion. Called by ChunkPipeline via the
   *  onStreamEnded callback wired in startChunkSeries / startPrefetchLoop.
   *  Decides whether to promote a lookahead, request a fresh next chunk, or
   *  finalise the session. */
  private handleChunkEnded(
    res: Resolution,
    chunkStartS: number,
    buffer: BufferManager,
    outcome: StreamOutcome
  ): void {
    const videoDurationS = this.deps.getVideoDurationS();
    const chunkEnd = Math.min(chunkStartS + CHUNK_DURATION_S, videoDurationS);
    const isLast = chunkEnd >= videoDurationS;

    if (outcome === "no_real_content") {
      // Pipeline already called buffer.markStreamDone() — nothing more to play.
      this.events.onJobCreated(null);
      return;
    }

    if (isLast) {
      buffer.markStreamDone();
      this.events.onJobCreated(null);
      playbackLog.info("Final chunk done");
      return;
    }

    const nextStart = chunkEnd;
    const nextEnd = Math.min(nextStart + CHUNK_DURATION_S, videoDurationS);
    this.chunkEnd = nextEnd;
    this.prefetchFired = false;

    if (this.pipeline?.hasLookahead()) {
      // Lookahead's stream + onStreamEnded are already wired (set at openLookahead
      // time). Promotion just transfers control — its onStreamEnded will fire
      // again when this chunk completes, calling handleChunkEnded recursively.
      this.pipeline.promoteLookahead();
      this.timeline.clearLookahead();
      this.timeline.setForegroundChunk(nextStart, nextEnd);
      this.updateSessionTimelineAttrs();
    } else {
      // Prefetch never fired (e.g. very short chunk, slow server) — request fresh.
      this.startChunkSeries(res, nextStart, buffer, false);
    }
  }

  /** Snapshots the timeline and writes the predictions as attributes on the
   *  session span. Called at every transition that may change the timeline
   *  state (foreground change, lookahead open, lookahead promote/clear). The
   *  most-recent attribute values overwrite prior ones — Seq surfaces the
   *  span's final attribute set so a trace inspector sees the timeline at
   *  the time of teardown. */
  private updateSessionTimelineAttrs(): void {
    if (!this.sessionSpan) return;
    const snapshot = this.timeline.snapshot(this.deps.videoEl.currentTime);
    this.sessionSpan.setAttribute(
      "playback.foreground_chunk_start_s",
      snapshot.foregroundChunkStartS ?? -1
    );
    this.sessionSpan.setAttribute(
      "playback.foreground_chunk_end_s",
      snapshot.foregroundChunkEndS ?? -1
    );
    this.sessionSpan.setAttribute(
      "playback.expected_seam_at_ms",
      snapshot.expectedSeamAtMs === null ? -1 : parseFloat(snapshot.expectedSeamAtMs.toFixed(2))
    );
    this.sessionSpan.setAttribute("playback.lookahead_job_id", snapshot.lookaheadJobId ?? "");
    this.sessionSpan.setAttribute(
      "playback.lookahead_opened_at_ms",
      snapshot.lookaheadOpenedAtMs === null
        ? -1
        : parseFloat(snapshot.lookaheadOpenedAtMs.toFixed(2))
    );
    this.sessionSpan.setAttribute(
      "playback.expected_lookahead_first_byte_at_ms",
      snapshot.expectedFirstByteAtMs === null
        ? -1
        : parseFloat(snapshot.expectedFirstByteAtMs.toFixed(2))
    );
    this.sessionSpan.setAttribute(
      "playback.rolling_avg_first_byte_latency_ms",
      snapshot.rollingAvgFirstByteLatencyMs === null
        ? -1
        : parseFloat(snapshot.rollingAvgFirstByteLatencyMs.toFixed(2))
    );
  }

  /** Arms the startup-buffer check that calls video.play() once the first
   *  chunk has buffered enough content. Called from ChunkPipeline via the
   *  onFirstChunkInit hook (fires when chunk 0's init.mp4 is appended). */
  private armStartupBufferCheck(buffer: BufferManager, res: Resolution): void {
    if (this.hasStartedPlayback) return;
    const startupTarget = STARTUP_BUFFER_S[res];
    const videoEl = this.deps.videoEl;
    this.waitForStartupBuffer(buffer, startupTarget, () => {
      videoEl.play().catch(() => {});
      this.setStatus("playing");
      playbackLog.info(
        `video.play() — buffered ${buffer.bufferedEnd.toFixed(1)}s >= ${startupTarget}s threshold`,
        {
          buffered_s: parseFloat(buffer.bufferedEnd.toFixed(1)),
          startup_target_s: startupTarget,
        }
      );
    });
  }

  // ── Chunk scheduler ────────────────────────────────────────────────────────

  /** Fires a startTranscode mutation for the given time window and returns the raw job ID.
   * `isPrefetch` distinguishes RAF-driven prefetch requests from on-demand chain calls
   * on the `transcode.request` span so Seq queries like
   * `SpanName = 'transcode.request' and chunk.is_prefetch = true` are one click away. */
  private requestChunk(
    res: Resolution,
    startS: number,
    endS: number,
    isPrefetch: boolean
  ): Promise<string> {
    const videoDurationS = this.deps.getVideoDurationS();
    const clampedEnd = Math.min(endS, videoDurationS);
    playbackLog.info(
      `Requesting chunk [${startS}s, ${clampedEnd}s)${isPrefetch ? " (prefetch)" : ""}`,
      { start_s: startS, end_s: clampedEnd, is_prefetch: isPrefetch }
    );
    const sessionCtx = getSessionContext();
    const requestSpan = playbackTracer.startSpan(
      "transcode.request",
      {
        attributes: {
          "chunk.start_s": startS,
          "chunk.end_s": clampedEnd,
          "chunk.resolution": res,
          "chunk.is_prefetch": isPrefetch,
        },
      },
      sessionCtx
    );
    const requestCtx = trace.setSpan(sessionCtx, requestSpan);
    return context
      .with(requestCtx, () => this.runStartChunkWithRetry(res, startS, clampedEnd, requestSpan))
      .then(({ rawJobId, globalJobId }) => {
        this.events.onJobCreated(globalJobId);
        requestSpan.setAttribute("chunk.job_id", rawJobId);
        requestSpan.end();
        playbackLog.info(
          `Chunk job ${rawJobId.slice(0, 8)} created for [${startS}s, ${clampedEnd}s)`,
          { job_id: rawJobId, start_s: startS, end_s: clampedEnd, is_prefetch: isPrefetch }
        );
        return rawJobId;
      })
      .catch((err: Error) => {
        requestSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        requestSpan.end();
        playbackLog.error("Chunk mutation error", { message: err.message });
        throw err;
      });
  }

  /**
   * Three-tier retry around `startTranscodeChunk`. Mirrors `BufferManager`'s
   * QuotaExceededError loop — named attempts, structured per-attempt logging,
   * fatal break for non-retryable codes. The mutation handler in
   * `useChunkedPlayback` already discriminates the union and rejects with a
   * typed `PlaybackError`, so this loop only needs to inspect `code` /
   * `retryable` / `retryAfterMs`.
   *
   * IMPORTANT: do NOT trigger `playback.stalled` for retryable rejections —
   * `CAPACITY_EXHAUSTED` is healthy backpressure, not a freeze. The retry is
   * recorded as a `playback.recovery_attempt` event on the surrounding
   * `transcode.request` span instead.
   */
  private async runStartChunkWithRetry(
    res: Resolution,
    startS: number,
    clampedEnd: number,
    requestSpan: Span
  ): Promise<{ rawJobId: string; globalJobId: string }> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
      try {
        return await this.deps.startTranscodeChunk({
          resolution: res,
          startTimeSeconds: startS,
          endTimeSeconds: clampedEnd,
        });
      } catch (err) {
        lastErr = err as Error;
        if (!isPlaybackError(err) || !err.retryable) {
          // Non-retryable code (or untyped error) — record the outcome and
          // propagate immediately; the caller sets the span ERROR status.
          requestSpan.addEvent("recovery.outcome", {
            outcome: isPlaybackError(err) ? "non_retryable" : "untyped_error",
            "error.code": isPlaybackError(err) ? err.code : "unknown",
            attempts: attempt,
          });
          throw err;
        }
        if (attempt === MAX_RECOVERY_ATTEMPTS) {
          requestSpan.addEvent("recovery.outcome", {
            outcome: "gave_up",
            "error.code": err.code,
            attempts: attempt,
          });
          throw err;
        }
        const waitMs = err.retryAfterMs ?? DEFAULT_BACKOFF_MS[attempt - 1];
        requestSpan.addEvent("playback.recovery_attempt", {
          "error.code": err.code,
          attempt_number: attempt,
          attempt_max: MAX_RECOVERY_ATTEMPTS,
          wait_ms: waitMs,
        });
        playbackLog.warn(
          `Chunk request transient failure [${err.code}] — retrying in ${waitMs}ms (attempt ${attempt}/${MAX_RECOVERY_ATTEMPTS})`,
          {
            error_code: err.code,
            attempt,
            attempt_max: MAX_RECOVERY_ATTEMPTS,
            wait_ms: waitMs,
          }
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    // Loop only exits via return or throw above; this is unreachable. Keep
    // the throw so TS sees a definite return path without a non-null bang.
    throw lastErr ?? new Error("Retry loop exited without resolution");
  }

  /**
   * Requests a chunk and opens its foreground stream via ChunkPipeline.
   * Continuation between chunks is driven by `handleChunkEnded` — either by
   * promoting an open lookahead or recursively calling startChunkSeries when
   * no prefetch had fired in time.
   */
  private startChunkSeries(
    res: Resolution,
    startS: number,
    buffer: BufferManager,
    isFirstChunk: boolean
  ): void {
    const videoDurationS = this.deps.getVideoDurationS();
    const chunkEnd = Math.min(startS + CHUNK_DURATION_S, videoDurationS);
    this.chunkEnd = chunkEnd;
    this.prefetchFired = false;

    void this.requestChunk(res, startS, chunkEnd, false)
      .then((rawJobId) => {
        if (!this.pipeline) return; // Tore down between request and response.
        this.timeline.setForegroundChunk(startS, chunkEnd);
        this.updateSessionTimelineAttrs();
        this.pipeline.startForeground({
          jobId: rawJobId,
          chunkStartS: startS,
          isFirstChunk,
          resolution: res,
          onStreamEnded: (outcome) => this.handleChunkEnded(res, startS, buffer, outcome),
          onError: (err) => this.setError(err.message),
          onFirstChunkInit: isFirstChunk
            ? (): void => this.armStartupBufferCheck(buffer, res)
            : undefined,
        });
      })
      .catch((err: Error) => {
        this.sessionSpan?.addEvent("chunk_series_failed", { message: err.message });
        this.sessionSpan?.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        this.setError(err.message);
        this.setStatus("idle");
      });
  }

  // ── MSE recovery (SourceBuffer detached by Chrome) ─────────────────────────

  /**
   * Fired by BufferManager when `appendBuffer` rejects with InvalidStateError
   * AND the SB is no longer in `mediaSource.sourceBuffers` — Chrome's
   * cumulative-budget watchdog detached us. Recovery:
   *   1. Snapshot currentTime and floor-align to the previous chunk boundary
   *      so the resume request re-asks for a chunk we know the server will
   *      serve (not a mid-chunk byte offset).
   *   2. Tear down the current pipeline + buffer. Recreating in place would
   *      leave the same BufferManager instance with a dead SB reference.
   *   3. Build a fresh BufferManager + ChunkPipeline at the same resolution
   *      and wire a new `handleMseDetached(res)` callback (decrements the
   *      per-session budget).
   *   4. Restart `init()` and then startChunkSeries at the floor-aligned
   *      timestamp. The video element's currentTime is preserved by
   *      re-assigning after the new MediaSource is attached — the same seek
   *      machinery handles the jump.
   *
   * Budget-exhausted path surfaces MSE_DETACHED as a fatal user-facing error
   * instead of looping recreates — if 3 recreates in one session weren't
   * enough, we're not going to fix it with a 4th.
   */
  private handleMseDetached(res: Resolution): void {
    if (this.recreateInProgress) return; // already rebuilding; ignore duplicate signals
    this.recreateInProgress = true;

    const videoEl = this.deps.videoEl;
    const savedTime = videoEl.currentTime;
    const chunkStart = Math.floor(savedTime / CHUNK_DURATION_S) * CHUNK_DURATION_S;
    const attempt = 4 - this.mseRecreatesRemaining; // 1-based for span/log readability

    playbackLog.warn(
      `MSE SourceBuffer detached — rebuilding MediaSource (attempt ${attempt}/3, resume at ${chunkStart}s)`,
      {
        mse_recreate_attempt: attempt,
        current_time_s: parseFloat(savedTime.toFixed(2)),
        resume_chunk_start_s: chunkStart,
      }
    );
    this.sessionSpan?.addEvent("playback.mse_recovery", {
      attempt,
      attempt_max: 3,
      current_time_s: parseFloat(savedTime.toFixed(2)),
      resume_chunk_start_s: chunkStart,
    });

    if (this.mseRecreatesRemaining <= 0) {
      playbackLog.error("MSE recreate budget exhausted — surfacing MSE_DETACHED", {});
      this.sessionSpan?.addEvent("playback.mse_recovery_exhausted", {});
      this.sessionSpan?.setStatus({ code: SpanStatusCode.ERROR, message: "MSE_DETACHED" });
      this.setError("Playback stopped: browser memory buffer exhausted (MSE_DETACHED)");
      this.setStatus("idle");
      this.recreateInProgress = false;
      return;
    }
    this.mseRecreatesRemaining -= 1;

    // Tear down the dead pipeline + buffer. BufferManager.teardown clears the
    // MediaSource and revokes the ObjectURL; ChunkPipeline.cancel stops the
    // foreground + lookahead readers.
    this.pipeline?.cancel("mse_recreate");
    this.pipeline = null;
    this.buffer?.teardown();
    this.buffer = null;
    this.chunkEnd = 0;
    this.prefetchFired = false;

    // Rebuild — same shape as startPlayback's init block but anchored at
    // `chunkStart` rather than 0. Kept inline (not extracted to a helper)
    // because the forward-declaration dance with pipeline/buffer is
    // localised here and easier to read than threading through a shared fn.
    // eslint-disable-next-line prefer-const -- captured by buffer's pause/resume closures, assigned after buffer construction
    let pipeline: ChunkPipeline;
    const videoDurationS = this.deps.getVideoDurationS();
    const buffer = new BufferManager(
      videoEl,
      () => pipeline.pauseAll(),
      () => pipeline.resumeAll(),
      videoDurationS,
      getEffectiveBufferConfig(),
      () => this.handleMseDetached(res)
    );
    pipeline = new ChunkPipeline(buffer, playbackTracer, playbackLog, videoEl);
    this.buffer = buffer;
    this.pipeline = pipeline;

    void buffer
      .init(RESOLUTION_MIME_TYPE[res])
      .then(() => {
        // Restore playback position; browsers clamp currentTime once the
        // new MediaSource duration is known — setting it here nudges the
        // decoder to resume where we left off.
        videoEl.currentTime = savedTime;
        this.startChunkSeries(res, chunkStart, buffer, /* isFirstChunk */ true);
        this.startPrefetchLoop(res);
        this.recreateInProgress = false;
      })
      .catch((err: Error) => {
        playbackLog.error("MSE recreate init failed", { message: err.message });
        this.sessionSpan?.addEvent("playback.mse_recovery_init_failed", { message: err.message });
        this.setError(`Playback stopped: MSE recreate failed — ${err.message}`);
        this.setStatus("idle");
        this.recreateInProgress = false;
      });
  }

  // ── Prefetch RAF loop ──────────────────────────────────────────────────────

  private startPrefetchLoop(res: Resolution): void {
    const videoEl = this.deps.videoEl;
    // Cancel any pre-existing prefetch handler — happens during resolution
    // swap when a new prefetch loop starts for the new resolution.
    this.cancelPrefetchHandler?.();
    this.cancelPrefetchHandler = this.ticker.register(() => {
      if (!this.buffer || !this.pipeline) return false; // Session torn down — deregister.
      const videoDurationS = this.deps.getVideoDurationS();
      const chunkEnd = this.chunkEnd;
      // Gate: only fire when we don't already have a lookahead open AND haven't
      // already fired one whose request is still in flight (prefetchFired covers
      // the gap between requestChunk start and openLookahead).
      const hasLookahead = this.pipeline.hasLookahead();
      if (!hasLookahead && !this.prefetchFired && chunkEnd > 0 && chunkEnd < videoDurationS) {
        const timeUntilEnd = chunkEnd - videoEl.currentTime;
        if (timeUntilEnd <= PREFETCH_THRESHOLD_S) {
          this.prefetchFired = true;
          const nextStart = chunkEnd;
          const nextEnd = Math.min(nextStart + CHUNK_DURATION_S, videoDurationS);
          const buffer = this.buffer;
          playbackLog.info(
            `Prefetching next chunk [${nextStart}s, ${nextEnd}s) — ${timeUntilEnd.toFixed(1)}s before current chunk end`,
            {
              next_start_s: nextStart,
              next_end_s: nextEnd,
              time_until_end_s: parseFloat(timeUntilEnd.toFixed(1)),
            }
          );
          void this.requestChunk(res, nextStart, nextEnd, true)
            .then((rawJobId) => {
              if (!this.pipeline) return; // Tore down between request and response.
              // Open the /stream/<jobId> fetch immediately — the server's
              // orphan timer sees connections > 0 and the prefetched job
              // survives even if the foreground is still streaming.
              this.timeline.recordLookaheadOpened(rawJobId);
              this.updateSessionTimelineAttrs();
              this.pipeline.openLookahead({
                jobId: rawJobId,
                chunkStartS: nextStart,
                isFirstChunk: false,
                resolution: res,
                onStreamEnded: (outcome) => this.handleChunkEnded(res, nextStart, buffer, outcome),
                onError: (err) => this.setError(err.message),
                onFirstMediaSegmentArrived: (atMs) =>
                  this.timeline.recordLookaheadFirstByte(rawJobId, atMs),
              });
            })
            .catch(() => {
              this.prefetchFired = false; // allow retry on next tick
            });
        }
      }
      return true; // keep ticking
    });
  }

  // ── Resolution switch (background buffer) ──────────────────────────────────

  private switchResolution(newRes: Resolution): void {
    const videoEl = this.deps.videoEl;
    const videoDurationS = this.deps.getVideoDurationS();
    const savedTime = videoEl.currentTime;
    const chunkStart = Math.floor(savedTime / CHUNK_DURATION_S) * CHUNK_DURATION_S;
    const mimeType = RESOLUTION_MIME_TYPE[newRes];

    playbackLog.info(
      `Resolution switch → ${newRes} — buffering from ${chunkStart}s in background`,
      {
        to: newRes,
        chunk_start_s: chunkStart,
      }
    );

    // Cancel any in-flight background pipeline + buffer
    this.bgPipeline?.cancel("resolution_switch_restart");
    this.bgPipeline = null;
    this.bgBuffer?.teardown(false);
    this.bgOnStreamEnded = (): void => {};

    // Closure-capture the pipeline OBJECT (not `this.bgPipeline`) so the buffer's
    // pause/resume keep working through the swap — after swap `this.bgPipeline`
    // is set to null but the same pipeline object lives on as `this.pipeline`.
    // eslint-disable-next-line prefer-const -- captured by buffer's pause/resume closures, assigned after buffer construction
    let bgPipeline: ChunkPipeline;
    const bgBuffer = new BufferManager(
      videoEl,
      () => bgPipeline.pauseAll(),
      () => bgPipeline.resumeAll(),
      videoDurationS,
      getEffectiveBufferConfig()
    );
    bgPipeline = new ChunkPipeline(bgBuffer, playbackTracer, playbackLog, videoEl);
    this.bgBuffer = bgBuffer;
    this.bgPipeline = bgPipeline;

    void bgBuffer
      .initBackground(mimeType)
      .then((objectUrl) => {
        const startupTarget = STARTUP_BUFFER_S[newRes];

        const onReady = (): void => {
          // Swap: save currentTime, reassign src, seek, play
          const swapTime = videoEl.currentTime;
          playbackLog.info(`Resolution swapped to ${newRes} at ${swapTime.toFixed(1)}s`, {
            to: newRes,
            swap_time_s: parseFloat(swapTime.toFixed(1)),
          });

          // Tear down old foreground (cancels its foreground + lookahead).
          this.pipeline?.cancel("resolution_switch");
          this.buffer?.teardown(false);

          // Cancel the prefetch loop for the old foreground chunk (a new one
          // starts via startPrefetchLoop below) and the bg readiness handler
          // (swap has succeeded).
          this.cancelPrefetchHandler?.();
          this.cancelPrefetchHandler = null;
          this.cancelBgReadyHandler?.();
          this.cancelBgReadyHandler = null;
          videoEl.src = objectUrl;
          videoEl.currentTime = swapTime;
          videoEl.play().catch(() => {});

          this.buffer = bgBuffer;
          bgBuffer.promoteToForeground();
          this.bgBuffer = null;
          this.pipeline = bgPipeline;
          this.bgPipeline = null;
          // Re-point the bg slot's onStreamEnded forwarder so the now-foreground
          // chunk's natural completion drives chunk continuation.
          this.bgOnStreamEnded = (outcome): void =>
            this.handleChunkEnded(newRes, chunkStart, bgBuffer, outcome);

          this.resolution = newRes;
          // Resume chunk series from the swapped position
          const newChunkEnd = Math.min(chunkStart + CHUNK_DURATION_S, videoDurationS);
          this.chunkEnd = newChunkEnd;
          this.prefetchFired = false;
          this.startPrefetchLoop(newRes);
        };

        const checkReady = (): void => {
          // Cancel any pre-existing handler from a prior swap that didn't
          // finish (rare — two swaps fired before the first crossed the
          // threshold). Then register a per-frame readiness check.
          this.cancelBgReadyHandler?.();
          this.cancelBgReadyHandler = this.ticker.register(() => {
            if (bgBuffer.bufferedEnd >= startupTarget) {
              onReady();
              return false;
            }
            return true;
          });
        };

        void this.requestChunk(
          newRes,
          chunkStart,
          Math.min(chunkStart + CHUNK_DURATION_S, videoDurationS),
          false
        )
          .then((rawJobId) => {
            if (!this.bgPipeline) return; // Tore down between request and response.
            this.bgPipeline.startForeground({
              jobId: rawJobId,
              chunkStartS: chunkStart,
              isFirstChunk: true, // background buffer is fresh — needs the init segment
              resolution: newRes,
              // Forwarder — initially a no-op while bg is filling; re-pointed
              // post-swap to handleChunkEnded so chunk continuation works.
              onStreamEnded: (outcome) => this.bgOnStreamEnded(outcome),
              onError: (err) => {
                playbackLog.error("Background stream error", { message: err.message });
                this.sessionSpan?.addEvent("background_stream_error", { message: err.message });
              },
            });
            checkReady();
          })
          .catch((err: Error) => {
            playbackLog.error("Background chunk error", { message: err.message });
            this.sessionSpan?.addEvent("background_chunk_request_failed", {
              message: err.message,
            });
          });
      })
      .catch((err: Error) => {
        playbackLog.error("Background MSE init failed", { message: err.message });
        this.sessionSpan?.addEvent("background_mse_init_failed", { message: err.message });
      });
  }

  // ── Video event handlers ───────────────────────────────────────────────────

  private handleSeeking = (): void => {
    if (this.isHandlingSeek) return;
    if (this.status !== "playing") return;
    if (!this.buffer) return;

    const videoEl = this.deps.videoEl;
    // Read the intended target from seekTo() if available; fall back to
    // videoEl.currentTime which the browser may have clamped to the buffered
    // range (e.g. seeking beyond the end of buffered data).
    const seekTime = this.pendingSeekTarget ?? videoEl.currentTime;

    // If the seek target is already in the SourceBuffer, the browser resumes
    // naturally without any flush. Clear the pending target and return — no
    // need to tear down the stream or show a spinner.
    let alreadyBuffered = false;
    for (let i = 0; i < videoEl.buffered.length; i++) {
      // The -0.5s tolerance avoids false positives right at the buffered end
      // where the decoder may still stall briefly.
      if (seekTime >= videoEl.buffered.start(i) && seekTime < videoEl.buffered.end(i) - 0.5) {
        alreadyBuffered = true;
        break;
      }
    }
    if (alreadyBuffered) {
      this.pendingSeekTarget = null;
      playbackLog.info(`Seek to ${seekTime.toFixed(1)}s — already buffered, resuming naturally`, {
        seek_target_s: parseFloat(seekTime.toFixed(1)),
      });
      return;
    }

    this.isHandlingSeek = true;
    this.pendingSeekTarget = null;
    // A seek flushes and reloads the buffer; any currently-open stall span
    // would not naturally resolve via a `playing` event tied to the old buffer
    // range, so close it here with a distinct reason. Also clears the pending
    // buffering-debounce timer so we don't double-fire the spinner.
    this.stallTracker.end("seek");
    const snapTime = Math.floor(seekTime / CHUNK_DURATION_S) * CHUNK_DURATION_S;

    // Guard against re-entrancy: BufferManager.seek() sets videoEl.currentTime
    // to reposition the playhead, which queues a second "seeking" task. By the
    // time that task fires, .then() has already reset isHandlingSeek (a
    // microtask), so the second event would re-enter and cancel the streaming
    // that just started. seekTarget persists across the .then() reset and
    // blocks that spurious re-entry. Cleared when "playing" fires.
    if (this.seekTarget === snapTime) {
      this.isHandlingSeek = false;
      return;
    }
    this.seekTarget = snapTime;

    // Show spinner immediately — seek requires flushing and reloading the buffer.
    this.setStatus("loading");

    playbackLog.info(
      `Seek to ${seekTime.toFixed(1)}s → flushing buffer, restarting from chunk boundary ${snapTime}s`,
      {
        seek_target_s: parseFloat(seekTime.toFixed(1)),
        snapped_to_s: snapTime,
      }
    );

    // Cancel both pipeline slots (foreground + lookahead) and flush the buffer.
    this.pipeline?.cancel("seek");
    this.timeline.clearLookahead();
    this.prefetchFired = false;

    const buf = this.buffer;
    void buf.seek(snapTime).then(() => {
      this.isHandlingSeek = false;
      if (!this.buffer) return;

      // Wait for the startup buffer threshold before resuming playback so the
      // video doesn't immediately stall after seeking to an unbuffered region.
      this.hasStartedPlayback = false;
      const startupTarget = STARTUP_BUFFER_S[this.resolution];
      this.waitForStartupBuffer(buf, startupTarget, () => {
        videoEl.play().catch(() => {});
        this.setStatus("playing");
        playbackLog.info(
          `Seek ready — ${buf.bufferedEnd.toFixed(1)}s buffered, resuming playback`,
          {
            buffered_s: parseFloat(buf.bufferedEnd.toFixed(1)),
            startup_target_s: startupTarget,
          }
        );
      });

      this.startChunkSeries(this.resolution, snapTime, buf, false);
    });
  };

  private handlePlaying = (): void => {
    // Seek has resolved — clear the dedup guard so future seeks can proceed.
    this.seekTarget = null;
    // StallTracker closes its span + clears its debounce timer.
    this.stallTracker.onPlaying();
    // Restore "playing" if the spinner was showing because of a mid-playback stall.
    if (this.status === "loading" && this.hasStartedPlayback) {
      this.setStatus("playing");
    }
  };

  private attachVideoListeners(): void {
    const el = this.deps.videoEl;
    el.addEventListener("seeking", this.handleSeeking);
    el.addEventListener("waiting", this.stallTracker.onWaiting);
    el.addEventListener("stalled", this.stallTracker.onStalled);
    el.addEventListener("playing", this.handlePlaying);
    this.detachListeners.push(
      () => el.removeEventListener("seeking", this.handleSeeking),
      () => el.removeEventListener("waiting", this.stallTracker.onWaiting),
      () => el.removeEventListener("stalled", this.stallTracker.onStalled),
      () => el.removeEventListener("playing", this.handlePlaying)
    );
  }
}
