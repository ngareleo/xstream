import { context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";

import { clientConfig } from "~/config/appConfig.js";
import { getEffectiveBufferConfig } from "~/config/featureFlags.js";
import { getClientLogger, getClientTracer } from "~/telemetry.js";
import { type PlaybackStatus, type Resolution, RESOLUTION_MIME_TYPE } from "~/types.js";

import { BufferManager } from "./bufferManager.js";
import { ChunkPipeline, type StreamOutcome } from "./chunkPipeline.js";
import { isPlaybackError } from "./playbackErrors.js";
import { clearSessionContext, getSessionContext, setSessionContext } from "./playbackSession.js";
import { PlaybackTicker } from "./playbackTicker.js";
import { PlaybackTimeline } from "./playbackTimeline.js";
import { RampController } from "./rampController.js";
import { StallTracker } from "./stallTracker.js";

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

/** Fire-and-forget cancellation of one or more in-flight transcode jobs by
 *  raw job ID. Used by `handleSeeking` to evict obsolete prefetched chunks
 *  at the OLD playhead so the seek's foreground mutation doesn't queue
 *  behind them in the pool. The server's `FfmpegPool::kill_job` drops the
 *  semaphore permit synchronously (before the kernel reaps the process),
 *  so a follow-up `start_transcode` from the same client typically sees
 *  the freed slot in <50 ms. The hook owns the Relay-id encoding. */
export type CancelTranscodeChunksFn = (rawJobIds: readonly string[]) => void;

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
  /** Fires the cancelTranscode mutation for a set of jobs. Used at seek
   *  time to free pool slots for the seek's own foreground chunk. */
  cancelTranscodeChunks: CancelTranscodeChunksFn;
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
  // Cold-start anchors for `playback.time_to_first_frame_ms` and
  // `playback.time_to_first_prefetch_ms` — see
  // docs/architecture/Observability/client/00-Spans.md.
  private sessionStartMs: number | null = null;
  private firstFrameRecorded = false;
  private firstPrefetchRecorded = false;
  // First-render grace window — `waiting` fires for ~hundreds of ms while the
  // decoder renders the first frame post-`play()`, which would otherwise
  // re-show the spinner over already-playing video on seek-resume.
  // Cleared in `handlePlaying`; auto-expires 5 s after grace begins.
  private firstRenderGraceUntil: number | null = null;

  private buffer: BufferManager | null = null;
  private pipeline: ChunkPipeline | null = null;
  private bgBuffer: BufferManager | null = null;
  private bgPipeline: ChunkPipeline | null = null;
  // Forwarder — reassigning this variable threads new behaviour through
  // the slot's captured `opts` after the bg→fg swap.
  private bgOnStreamEnded: (outcome: StreamOutcome) => void = () => {};

  private chunkEnd = 0;
  private prefetchFired = false;

  // Drives the serial-prefetch invariant — see
  // docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md §4.
  // `foregroundJobId` mirrors the active job so late updates for a previous
  // chunk's job can be ignored.
  private foregroundTranscodeComplete = false;
  private foregroundJobId: string | null = null;

  // Owns the cold-start chunk-duration ramp. Reset at every fresh-playhead
  // anchor (session start, seek, MSE recovery, resolution swap).
  private readonly rampController = new RampController(
    clientConfig.playback.chunkRampS,
    clientConfig.playback.chunkSteadyStateS
  );

  private hasStartedPlayback = false;

  private isHandlingSeek = false;
  // The user's most-recent seek target. Filters out the asynchronously-queued
  // `seeking` event fired by `BufferManager.seek()`'s own currentTime assign.
  private seekTarget: number | null = null;
  // Set by `seekTo()` before updating currentTime so `handleSeeking` reads the
  // unclamped target instead of the browser-clamped value.
  private pendingSeekTarget: number | null = null;

  private readonly ticker: PlaybackTicker;
  private cancelPrefetchHandler: (() => void) | null = null;
  private cancelStartupHandler: (() => void) | null = null;
  private cancelBgReadyHandler: (() => void) | null = null;

  // While paused, `timeupdate` is silent so backpressure never runs.
  // Poller drives `tickBackpressure` on a 1 s interval to plug that gap.
  private userPauseInterval: ReturnType<typeof setInterval> | null = null;
  private userPausePrefetchFired = false;

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
      isInFirstRenderGrace: () =>
        this.firstRenderGraceUntil !== null && performance.now() < this.firstRenderGraceUntil,
      onSpinnerShow: () => this.setStatus("loading"),
      ticker: this.ticker,
    });
    this.attachVideoListeners();
  }

  startPlayback(res: Resolution): void {
    const videoEl = this.deps.videoEl;

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

    const sessionSpan = playbackTracer.startSpan("playback.session", {
      attributes: { "video.id": videoId, "playback.resolution": res },
    });
    this.sessionSpan = sessionSpan;
    this.sessionStartMs = performance.now();
    const traceId = sessionSpan.spanContext().traceId;

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

    // Browser has no AsyncLocalStorage — context.with() alone doesn't carry
    // async callbacks (fetch, RAF, Promise chains); set module-wide context.
    const sessionCtx = trace.setSpan(context.active(), sessionSpan);
    setSessionContext(sessionCtx);

    // Closure-capture the pipeline OBJECT (not `this.pipeline`) so pause/resume
    // survive resolution swaps. Forward-declared because pipeline needs buffer.
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

    // Parallel init + mutation: GraphQL RTT (~100–500 ms) and ffmpeg cold-start
    // (10–30 s on 4K VAAPI) now overlap with MSE bootstrap. Promise.all gates
    // at startForeground to wait for both. Cold-start ramp slot 0 makes first
    // job small — ~10 s transcode dominates, not full ~300 s. See
    // docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md for VAAPI HDR 4K
    // zero-segment caveat and recovery path.
    const firstChunkEnd = Math.min(this.rampController.next(), videoDurationS);
    void context.with(sessionCtx, () => {
      const initPromise = buffer.init(RESOLUTION_MIME_TYPE[res]).then(() => {
        playbackLog.info(`MSE ready: ${RESOLUTION_MIME_TYPE[res]}`, {
          mime_type: RESOLUTION_MIME_TYPE[res],
        });
      });
      const chunkPromise = this.requestChunk(res, 0, firstChunkEnd, false);
      return Promise.all([initPromise, chunkPromise])
        .then(([, rawJobId]) => {
          if (!this.pipeline) return; // Tore down between request and response.
          this.startChunkSeries(res, 0, buffer, true, {
            endS: firstChunkEnd,
            preIssuedJobId: rawJobId,
          });
          this.startPrefetchLoop(res);
        })
        .catch((err: Error) => {
          const msg = `Playback start failed: ${err.message}`;
          playbackLog.error("Playback start failed", { message: err.message });
          sessionSpan.addEvent("playback_start_failed", { message: err.message });
          sessionSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          this.setError(msg);
          this.setStatus("idle");
        });
    });
  }

  seekTo(targetSeconds: number): void {
    // Capture target before currentTime assignment so synchronous seeking event
    // fires with pendingSeekTarget already set.
    this.pendingSeekTarget = targetSeconds;
    this.deps.videoEl.currentTime = targetSeconds;
  }

  /** Notification that a `transcodeJobUpdated` subscription emitted
   *  `status: COMPLETE` for the given job. If it matches the current
   *  foreground, opens the serial-prefetch gate so chunk N+1's mutation
   *  can fire on the next RAF tick without waiting for the
   *  `prefetchThresholdS` time-until-end fallback. Stale updates (a
   *  previous chunk's job ID) are ignored. */
  onTranscodeComplete(jobId: string): void {
    if (jobId !== this.foregroundJobId) return;
    this.foregroundTranscodeComplete = true;
  }

  teardown(): void {
    this.resetForNewSession();
    for (const detach of this.detachListeners) detach();
    this.detachListeners = [];
  }

  private setStatus(s: PlaybackStatus): void {
    const from = this.status;
    this.status = s;
    // Record transitions for Seq to diagnose seek-window spinner races.
    if (from !== s) {
      this.sessionSpan?.addEvent("playback.status_changed", {
        from,
        to: s,
        is_handling_seek: this.isHandlingSeek,
      });
    }
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
    this.clearUserPauseState();
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
    this.foregroundTranscodeComplete = false;
    this.foregroundJobId = null;
    this.rampController.reset();
    this.hasStartedPlayback = false;
    this.seekTarget = null;
    this.mseRecreatesRemaining = 3;
    this.recreateInProgress = false;

    if (this.sessionSpan) {
      this.sessionSpan.addEvent("session_ended", { reason });
      this.sessionSpan.end();
      this.sessionSpan = null;
    }
    this.sessionStartMs = null;
    this.firstFrameRecorded = false;
    this.firstPrefetchRecorded = false;
    this.firstRenderGraceUntil = null;
    clearSessionContext();

    this.events.onJobCreated(null);
  }

  /**
   * Drives video.play() once the buffer has enough content. Shared by initial
   * startup and seek-resume — both want the same gate: setAfterAppend fires on
   * every real append (fast cache-hit paths) and checkReady polls at display
   * frame rate as a fallback for slow live-transcode paths where no segment may
   * be ready for many seconds.
   */
  private waitForStartupBuffer(buffer: BufferManager, target: number, onPlay: () => void): void {
    const videoEl = this.deps.videoEl;
    const tryPlay = (): void => {
      if (this.hasStartedPlayback) return;
      // Check ahead-of-currentTime, not absolute bufferedEnd. After seek to 600s,
      // first segment at PTS≈600, so abs bufferedEnd≈602 would trivially pass a 5s
      // target after one segment, leaving only ~2s ahead → immediate stall.
      const ahead = buffer.getBufferedAheadSeconds(videoEl.currentTime);
      if (ahead !== null && ahead >= target) {
        this.hasStartedPlayback = true;
        // Grace window blocks StallTracker spinner while decoder renders first
        // frame post-play (hundreds of ms, not user-visible freeze). Self-expires
        // in 5 s if no recovery; cleared by handlePlaying.
        this.firstRenderGraceUntil = performance.now() + clientConfig.playback.firstRenderGraceMs;
        // Record cold-start time-to-first-frame as session attribute for Seq.
        // Guard with firstFrameRecorded since seek-resumes also use this path.
        if (!this.firstFrameRecorded && this.sessionSpan && this.sessionStartMs !== null) {
          this.firstFrameRecorded = true;
          this.sessionSpan.setAttribute(
            "playback.time_to_first_frame_ms",
            parseFloat((performance.now() - this.sessionStartMs).toFixed(2))
          );
        }
        buffer.setAfterAppend(null);
        onPlay();
      }
    };
    buffer.setAfterAppend(tryPlay);
    // Cancel pre-existing handler — possible during seek-resume firing before
    // the previous startup handler resolved.
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
    chunkEndS: number,
    buffer: BufferManager,
    outcome: StreamOutcome
  ): void {
    const videoDurationS = this.deps.getVideoDurationS();
    // chunkEndS is the caller's actual request (under ramp, duration consumed
    // at request time, not derivable here from steady-state).
    const chunkEnd = Math.min(chunkEndS, videoDurationS);
    const isLast = chunkEnd >= videoDurationS;

    if (outcome === "no_real_content") {
      this.events.onJobCreated(null);
      return;
    }

    if (isLast) {
      buffer.markStreamDone();
      this.events.onJobCreated(null);
      return;
    }

    const nextStart = chunkEnd;
    this.prefetchFired = false;
    // Reset before wiring new foreground so stale transcodeJobUpdated → COMPLETE
    // can't accidentally open the serial prefetch gate for the wrong chunk.
    this.foregroundTranscodeComplete = false;

    if (this.pipeline?.hasLookahead()) {
      // Lookahead already has stream + onStreamEnded wired. Promotion transfers
      // control; bounds were captured at prefetch time and live on the slot.
      const { jobId, chunkStartS, chunkEndS } = this.pipeline.promoteLookahead();
      this.chunkEnd = chunkEndS;
      this.foregroundJobId = jobId;
      this.timeline.clearLookahead();
      this.timeline.setForegroundChunk(chunkStartS, chunkEndS);
      this.updateSessionTimelineAttrs();
    } else {
      // Prefetch never fired (short chunk or slow server) — request fresh.
      this.startChunkSeries(res, nextStart, buffer, false);
    }
  }

  /** Snapshots the timeline and writes predictions as session-span attributes.
   *  Called at every timeline state transition. Most-recent values overwrite
   *  prior ones — Seq surfaces the final set at teardown. */
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
    const startupTarget = clientConfig.playback.startupBufferS[res];
    const videoEl = this.deps.videoEl;
    this.waitForStartupBuffer(buffer, startupTarget, () => {
      videoEl.play().catch(() => {});
      this.setStatus("playing");
    });
  }

  /** Fires a startTranscode mutation for the given time window and returns the raw job ID.
   * `isPrefetch` distinguishes RAF-driven prefetch from on-demand requests on the
   * `transcode.request` span for Seq filtering. */
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
   * Three-tier retry around `startTranscodeChunk` with named attempts and
   * per-attempt logging. Mutation handler in `useChunkedPlayback` discriminates
   * the union and rejects with typed `PlaybackError`, so this only inspects
   * `code` / `retryable` / `retryAfterMs`. IMPORTANT: do NOT trigger
   * `playback.stalled` for retryable rejections — `CAPACITY_EXHAUSTED` is
   * healthy backpressure, not a freeze.
   */
  private async runStartChunkWithRetry(
    res: Resolution,
    startS: number,
    clampedEnd: number,
    requestSpan: Span
  ): Promise<{ rawJobId: string; globalJobId: string }> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= clientConfig.playback.maxRecoveryAttempts; attempt++) {
      try {
        return await this.deps.startTranscodeChunk({
          resolution: res,
          startTimeSeconds: startS,
          endTimeSeconds: clampedEnd,
        });
      } catch (err) {
        lastErr = err as Error;
        if (!isPlaybackError(err) || !err.retryable) {
          requestSpan.addEvent("recovery.outcome", {
            outcome: isPlaybackError(err) ? "non_retryable" : "untyped_error",
            "error.code": isPlaybackError(err) ? err.code : "unknown",
            attempts: attempt,
          });
          throw err;
        }
        if (attempt === clientConfig.playback.maxRecoveryAttempts) {
          requestSpan.addEvent("recovery.outcome", {
            outcome: "gave_up",
            "error.code": err.code,
            attempts: attempt,
          });
          throw err;
        }
        const waitMs = err.retryAfterMs ?? clientConfig.playback.defaultBackoffMs[attempt - 1];
        requestSpan.addEvent("playback.recovery_attempt", {
          "error.code": err.code,
          attempt_number: attempt,
          attempt_max: clientConfig.playback.maxRecoveryAttempts,
          wait_ms: waitMs,
        });
        playbackLog.warn(
          `Chunk request transient failure [${err.code}] — retrying in ${waitMs}ms (attempt ${attempt}/${clientConfig.playback.maxRecoveryAttempts})`,
          {
            error_code: err.code,
            attempt,
            attempt_max: clientConfig.playback.maxRecoveryAttempts,
            wait_ms: waitMs,
          }
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
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
    isFirstChunk: boolean,
    /** Optional overrides. `endS` lets the seek path clamp the chunk end.
     *  `preIssuedJobId` lets startPlayback reuse a jobId already fetched in
     *  parallel with `buffer.init()`. */
    override?: { endS?: number; preIssuedJobId?: string }
  ): void {
    const videoDurationS = this.deps.getVideoDurationS();
    // Window size from ramp, unless caller passed explicit endS. Cold-start
    // and seek paths use override; handleChunkEnded falls through to ramp.
    const chunkEnd =
      override?.endS ?? Math.min(startS + this.rampController.next(), videoDurationS);
    this.chunkEnd = chunkEnd;
    // prefetchFired is intentionally NOT reset here — every caller resets before
    // reaching this point. Double-reset across async gap (caller reset → RAF
    // fires #1 → .then() resets → RAF fires #2) causes duplicate prefetch.
    // See trace b3dbbc34…

    const jobIdPromise = override?.preIssuedJobId
      ? Promise.resolve(override.preIssuedJobId)
      : this.requestChunk(res, startS, chunkEnd, false);

    void jobIdPromise
      .then((rawJobId) => {
        if (!this.pipeline) return;
        // Track foreground job ID so transcodeJobUpdated → COMPLETE can open
        // the serial-prefetch gate. Late updates for old chunks are filtered
        // in onTranscodeComplete.
        this.foregroundJobId = rawJobId;
        this.foregroundTranscodeComplete = false;
        this.timeline.setForegroundChunk(startS, chunkEnd);
        this.updateSessionTimelineAttrs();
        this.pipeline.startForeground({
          jobId: rawJobId,
          chunkStartS: startS,
          chunkEndS: chunkEnd,
          isFirstChunk,
          resolution: res,
          onStreamEnded: (outcome) => this.handleChunkEnded(res, startS, chunkEnd, buffer, outcome),
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

  /**
   * Fired by BufferManager when `appendBuffer` rejects with InvalidStateError
   * AND the SB is no longer in `mediaSource.sourceBuffers` — Chrome's
   * cumulative-budget watchdog detached us. See docs/architecture/Streaming/
   * for recovery mechanics. Budget-exhausted path surfaces MSE_DETACHED as
   * fatal instead of looping recreates — if 3 weren't enough, a 4th won't fix.
   */
  private handleMseDetached(res: Resolution): void {
    if (this.recreateInProgress) return;
    this.recreateInProgress = true;

    const videoEl = this.deps.videoEl;
    const savedTime = videoEl.currentTime;
    // Recovery is seek-anchored — resume at the user's exact position. See
    // docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md § 1.
    const chunkStart = savedTime;
    const attempt = 4 - this.mseRecreatesRemaining;

    playbackLog.warn(
      `MSE recovery — rebuilding MediaSource (attempt ${attempt}/3, resume at ${chunkStart.toFixed(2)}s)`,
      {
        mse_recreate_attempt: attempt,
        current_time_s: parseFloat(savedTime.toFixed(2)),
        resume_chunk_start_s: parseFloat(chunkStart.toFixed(2)),
      }
    );
    this.sessionSpan?.addEvent("playback.mse_recovery", {
      attempt,
      attempt_max: 3,
      current_time_s: parseFloat(savedTime.toFixed(2)),
      resume_chunk_start_s: parseFloat(chunkStart.toFixed(2)),
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

    this.pipeline?.cancel("mse_recreate");
    this.pipeline = null;
    this.buffer?.teardown();
    this.buffer = null;
    this.chunkEnd = 0;
    this.prefetchFired = false;
    this.foregroundTranscodeComplete = false;
    this.foregroundJobId = null;
    // Fresh-playhead anchor — small first chunk for quick resume.
    this.rampController.reset();

    // Rebuild same shape as startPlayback's init but anchored at chunkStart.
    // Kept inline because forward-declaration dance with pipeline/buffer is
    // localized here.
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
        // Restore playback position; browsers clamp currentTime to new
        // MediaSource duration, so setting it nudges decoder back.
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

  private startPrefetchLoop(res: Resolution): void {
    const videoEl = this.deps.videoEl;
    // Cancel pre-existing handler — happens during resolution swap.
    this.cancelPrefetchHandler?.();
    this.cancelPrefetchHandler = this.ticker.register(() => {
      if (!this.buffer || !this.pipeline) return false;
      const videoDurationS = this.deps.getVideoDurationS();
      const chunkEnd = this.chunkEnd;
      // Fire only when no lookahead open and no in-flight prefetch request.
      const hasLookahead = this.pipeline.hasLookahead();
      if (!hasLookahead && !this.prefetchFired && chunkEnd > 0 && chunkEnd < videoDurationS) {
        const timeUntilEnd = chunkEnd - videoEl.currentTime;
        // Dual-gate: serial (foregroundTranscodeComplete) caps parallelism at
        // one lookahead in flight; RAF fallback fires anyway if encoder lags.
        const serialGateOpen = this.foregroundTranscodeComplete;
        const rafGateOpen = timeUntilEnd <= clientConfig.playback.prefetchThresholdS;
        if (serialGateOpen || rafGateOpen) {
          this.prefetchFired = true;
          // Record first prefetch fire for cold-start ramp diagnostics.
          if (!this.firstPrefetchRecorded && this.sessionSpan && this.sessionStartMs !== null) {
            this.firstPrefetchRecorded = true;
            this.sessionSpan.setAttribute(
              "playback.time_to_first_prefetch_ms",
              parseFloat((performance.now() - this.sessionStartMs).toFixed(2))
            );
          }
          const nextStart = chunkEnd;
          const nextEnd = Math.min(nextStart + this.rampController.next(), videoDurationS);
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
              if (!this.pipeline) return;
              // Open /stream/<jobId> fetch immediately so server's orphan timer
              // sees connections > 0 and job survives.
              this.timeline.recordLookaheadOpened(rawJobId);
              this.updateSessionTimelineAttrs();
              this.pipeline.openLookahead({
                jobId: rawJobId,
                chunkStartS: nextStart,
                chunkEndS: nextEnd,
                isFirstChunk: false,
                resolution: res,
                onStreamEnded: (outcome) =>
                  this.handleChunkEnded(res, nextStart, nextEnd, buffer, outcome),
                onError: (err) => this.setError(err.message),
                onFirstMediaSegmentArrived: (atMs) =>
                  this.timeline.recordLookaheadFirstByte(rawJobId, atMs),
              });
            })
            .catch(() => {
              this.prefetchFired = false;
            });
        }
      }
      return true;
    });
  }

  private switchResolution(newRes: Resolution): void {
    const videoEl = this.deps.videoEl;
    const videoDurationS = this.deps.getVideoDurationS();
    const savedTime = videoEl.currentTime;
    // Background buffer is fresh-playhead anchor at savedTime, like a seek.
    // Reset ramp for small first chunk so swap happens fast.
    this.rampController.reset();
    const chunkStart = savedTime;
    const newChunkEnd = Math.min(chunkStart + this.rampController.next(), videoDurationS);
    const mimeType = RESOLUTION_MIME_TYPE[newRes];

    playbackLog.info(
      `Resolution switch → ${newRes} — buffering from ${chunkStart}s in background`,
      {
        to: newRes,
        chunk_start_s: chunkStart,
      }
    );

    this.bgPipeline?.cancel("resolution_switch_restart");
    this.bgPipeline = null;
    this.bgBuffer?.teardown(false);
    this.bgOnStreamEnded = (): void => {};

    // Closure-capture pipeline OBJECT so pause/resume survive the swap.
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
        const startupTarget = clientConfig.playback.startupBufferS[newRes];

        const onReady = (): void => {
          const swapTime = videoEl.currentTime;
          playbackLog.info(`Resolution swapped to ${newRes} at ${swapTime.toFixed(1)}s`, {
            to: newRes,
            swap_time_s: parseFloat(swapTime.toFixed(1)),
          });

          this.pipeline?.cancel("resolution_switch");
          this.buffer?.teardown(false);

          // Cancel prefetch loop and bg readiness handler; swap succeeded.
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
          // Re-point bgOnStreamEnded so chunk continuation works post-swap.
          this.bgOnStreamEnded = (outcome): void =>
            this.handleChunkEnded(newRes, chunkStart, newChunkEnd, bgBuffer, outcome);

          this.resolution = newRes;
          this.chunkEnd = newChunkEnd;
          this.prefetchFired = false;
          this.startPrefetchLoop(newRes);
        };

        const checkReady = (): void => {
          // Cancel pre-existing handler from prior unfinished swap (rare).
          this.cancelBgReadyHandler?.();
          this.cancelBgReadyHandler = this.ticker.register(() => {
            if (bgBuffer.bufferedEnd >= startupTarget) {
              onReady();
              return false;
            }
            return true;
          });
        };

        void this.requestChunk(newRes, chunkStart, newChunkEnd, false)
          .then((rawJobId) => {
            if (!this.bgPipeline) return;
            this.bgPipeline.startForeground({
              jobId: rawJobId,
              chunkStartS: chunkStart,
              chunkEndS: newChunkEnd,
              isFirstChunk: true,
              resolution: newRes,
              // Forwarder — initially no-op; re-pointed post-swap.
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

  private handleSeeking = (): void => {
    if (this.isHandlingSeek) return;
    if (this.status !== "playing") return;
    if (!this.buffer) return;

    const videoEl = this.deps.videoEl;
    // Read intended target from seekTo() if available; fall back to
    // currentTime which browser may have clamped to buffered range.
    const seekTime = this.pendingSeekTarget ?? videoEl.currentTime;

    // If seek target already in SourceBuffer, resume naturally without flush.
    let alreadyBuffered = false;
    for (let i = 0; i < videoEl.buffered.length; i++) {
      // -0.5s tolerance avoids false positives at buffered end where decoder
      // may still stall briefly.
      if (
        seekTime >= videoEl.buffered.start(i) &&
        seekTime < videoEl.buffered.end(i) - clientConfig.playback.seekBufferedToleranceS
      ) {
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
    // Seek flushes buffer; close any open stall span and debounce timer.
    this.stallTracker.end("seek");
    // Evict obsolete jobs from pool before new mutation. Gather IDs before
    // pipeline.cancel. Server's pool.kill_job drops permit synchronously —
    // seek mutation usually sees capacity in <50 ms (vs ~1.2 s pre-fix, trace
    // 6f0ef574…).
    const obsoleteJobIds = [
      ...(this.pipeline?.currentJobIds() ?? []),
      ...(this.bgPipeline?.currentJobIds() ?? []),
    ];
    if (obsoleteJobIds.length > 0) {
      this.deps.cancelTranscodeChunks(obsoleteJobIds);
    }
    // Fresh-playhead anchor — small first chunk for fast resume. See
    // docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md § 1.
    this.rampController.reset();
    const videoDurationS = this.deps.getVideoDurationS();
    const seekChunkEnd = Math.min(seekTime + this.rampController.next(), videoDurationS);

    // Guard against re-entrancy: BufferManager.seek() sets currentTime, queuing
    // a second seeking event. By the time it fires, .then() reset isHandlingSeek
    // (microtask), so re-entry would cancel the streaming just started. Storing
    // seekTime keeps in-chunk seeks distinguishable.
    if (this.seekTarget === seekTime) {
      this.isHandlingSeek = false;
      return;
    }
    this.seekTarget = seekTime;

    // Show spinner immediately.
    this.setStatus("loading");
    // Reset hasStartedPlayback NOW so residual `playing` event from buffer
    // flush doesn't flip status back via handlePlaying.
    this.hasStartedPlayback = false;

    playbackLog.info(
      `Seek to ${seekTime.toFixed(1)}s → flushing buffer, requesting [${seekTime.toFixed(1)}, ${seekChunkEnd})`,
      {
        seek_target_s: parseFloat(seekTime.toFixed(1)),
        seek_chunk_end_s: seekChunkEnd,
      }
    );

    this.pipeline?.cancel("seek");
    this.timeline.clearLookahead();
    this.prefetchFired = false;
    this.foregroundTranscodeComplete = false;
    this.foregroundJobId = null;
    // chunkEnd = small seek-chunk's end triggers RAF prefetch immediately.
    this.chunkEnd = seekChunkEnd;
    this.clearUserPauseState();

    const buf = this.buffer;
    void buf.seek(seekTime).then(() => {
      this.isHandlingSeek = false;
      if (!this.buffer) return;

      const startupTarget = clientConfig.playback.startupBufferS[this.resolution];
      this.waitForStartupBuffer(buf, startupTarget, () => {
        // Respect user's pause state — if paused before/during seek, stay paused.
        if (!videoEl.paused) {
          videoEl.play().catch(() => {});
        }
        this.setStatus("playing");
        const aheadAtPlay = buf.getBufferedAheadSeconds(videoEl.currentTime) ?? 0;
        playbackLog.info(
          `Seek ready — ${aheadAtPlay.toFixed(1)}s buffered ahead (target: ${startupTarget}s)${videoEl.paused ? ", staying paused" : ", resuming playback"}`,
          {
            buffered_ahead_s: parseFloat(aheadAtPlay.toFixed(1)),
            buffered_end_s: parseFloat(buf.bufferedEnd.toFixed(1)),
            startup_target_s: startupTarget,
            stayed_paused: videoEl.paused,
          }
        );
      });

      // Anchor chunk REQUEST at seekTime — ffmpeg's -ss produces user's first
      // segment in ~1-2 s. endS: seekChunkEnd carries ramp slot already consumed
      // (prevents second rampController.next()). isFirstChunk: false keeps
      // existing seek startup-buffer wiring.
      this.startChunkSeries(this.resolution, seekTime, buf, false, {
        endS: seekChunkEnd,
      });
    });
  };

  private handlePlaying = (): void => {
    // If seek mid-flight, skip — residual playing event would hide spinner.
    // Logged so Seq sees mid-session guard without waiting for span close.
    if (this.isHandlingSeek) {
      playbackLog.info("Skipping `playing` event — seek in flight");
      this.sessionSpan?.addEvent("playback.playing_event_skipped_during_seek");
      return;
    }
    this.seekTarget = null;
    // Close post-play() decoder-warmup grace.
    this.firstRenderGraceUntil = null;
    this.stallTracker.onPlaying();
    // Restore "playing" when video genuinely renders after "loading". Two cases:
    // 1. Mid-playback stall recovery — status flipped to loading, resume's
    //    playing clears it.
    // 2. Seek-resume auto-resume — browser auto-resumes before startup-buffer
    //    threshold; without this, spinner stays during startup fill.
    // firstFrameRecorded gate filters spurious cold-start events, admits mid-session.
    if (this.status === "loading" && this.firstFrameRecorded) {
      this.setStatus("playing");
    }
  };

  private handleUserPause = (): void => {
    if (this.deps.videoEl.ended) return;
    if (!this.hasStartedPlayback || this.isHandlingSeek) return;
    if (this.userPauseInterval !== null) return;

    playbackLog.info("User paused — driving backpressure check until buffer fills");
    // Tick immediately so buffer-fill threshold is checked before first tick.
    this.checkUserPauseTick();
    this.userPauseInterval = setInterval(
      () => this.checkUserPauseTick(),
      clientConfig.playback.userPausePollIntervalMs
    );
  };

  private handleUserPlay = (): void => {
    if (this.userPauseInterval === null && !this.userPausePrefetchFired) return;
    playbackLog.info("User resumed — clearing pause poller, resuming lookahead");
    this.clearUserPauseState();
    // Wake lookahead reader so it pulls on-disk segments for promotion.
    this.pipeline?.resumeLookahead();
  };

  /** One iteration of the user-pause poller. Drives backpressure (since
   *  `timeupdate` is silent while paused), and once the buffer is full,
   *  fires the chunk N+1 prefetch exactly once. */
  private checkUserPauseTick(): void {
    if (!this.buffer || !this.pipeline) return;
    this.buffer.tickBackpressure();
    if (this.userPausePrefetchFired) return;

    const ahead = this.buffer.getBufferedAheadSeconds(this.deps.videoEl.currentTime);
    const forwardTargetS = getEffectiveBufferConfig().forwardTargetS;
    if (ahead === null || ahead < forwardTargetS) return;

    const videoDurationS = this.deps.getVideoDurationS();
    const nextStart = this.chunkEnd;
    if (nextStart <= 0 || nextStart >= videoDurationS) return;
    if (this.pipeline.hasLookahead()) return;

    this.userPausePrefetchFired = true;
    const nextEnd = Math.min(nextStart + this.rampController.next(), videoDurationS);
    const buffer = this.buffer;
    const res = this.resolution;
    playbackLog.info(
      `Pause prefetch — requesting chunk N+1 [${nextStart}s, ${nextEnd}s) for warm cache on resume`,
      { next_start_s: nextStart, next_end_s: nextEnd }
    );
    void this.requestChunk(res, nextStart, nextEnd, true)
      .then((rawJobId) => {
        if (!this.pipeline) return;
        // Open lookahead so orphan_no_connection timer doesn't fire, then
        // suspend reader so segments don't accumulate in RAM during pause.
        // ffmpeg keeps writing to disk; on resume, reader wakes and pulls.
        this.timeline.recordLookaheadOpened(rawJobId);
        this.updateSessionTimelineAttrs();
        this.pipeline.openLookahead({
          jobId: rawJobId,
          chunkStartS: nextStart,
          chunkEndS: nextEnd,
          isFirstChunk: false,
          resolution: res,
          onStreamEnded: (outcome) =>
            this.handleChunkEnded(res, nextStart, nextEnd, buffer, outcome),
          onError: (err) => this.setError(err.message),
          onFirstMediaSegmentArrived: (atMs) =>
            this.timeline.recordLookaheadFirstByte(rawJobId, atMs),
        });
        this.pipeline.pauseLookahead();
        // Mirror startPrefetchLoop bookkeeping so RAF loop doesn't re-fire.
        this.prefetchFired = true;
      })
      .catch(() => {
        this.userPausePrefetchFired = false;
      });
  }

  private clearUserPauseState(): void {
    if (this.userPauseInterval !== null) {
      clearInterval(this.userPauseInterval);
      this.userPauseInterval = null;
    }
    this.userPausePrefetchFired = false;
  }

  private attachVideoListeners(): void {
    const el = this.deps.videoEl;
    el.addEventListener("seeking", this.handleSeeking);
    el.addEventListener("waiting", this.stallTracker.onWaiting);
    el.addEventListener("stalled", this.stallTracker.onStalled);
    el.addEventListener("playing", this.handlePlaying);
    el.addEventListener("pause", this.handleUserPause);
    el.addEventListener("play", this.handleUserPlay);
    this.detachListeners.push(
      () => el.removeEventListener("seeking", this.handleSeeking),
      () => el.removeEventListener("waiting", this.stallTracker.onWaiting),
      () => el.removeEventListener("stalled", this.stallTracker.onStalled),
      () => el.removeEventListener("playing", this.handlePlaying),
      () => el.removeEventListener("pause", this.handleUserPause),
      () => el.removeEventListener("play", this.handleUserPlay)
    );
  }
}
