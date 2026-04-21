import { context, type Span, SpanStatusCode, trace } from "@opentelemetry/api";

import { getClientLogger, getClientTracer } from "~/telemetry.js";
import { type Resolution, RESOLUTION_MIME_TYPE } from "~/types.js";

import { BufferManager } from "./BufferManager.js";
import { clearSessionContext, getSessionContext, setSessionContext } from "./playbackSession.js";
import { StreamingService } from "./StreamingService.js";

const playbackLog = getClientLogger("playback");
const playbackTracer = getClientTracer("playback");

const CHUNK_DURATION_S = 300;
const PREFETCH_THRESHOLD_S = 60;

/** Minimum buffered seconds before video.play() is called on initial load. */
const STARTUP_BUFFER_S: Record<Resolution, number> = {
  "240p": 2,
  "360p": 2,
  "480p": 3,
  "720p": 4,
  "1080p": 6,
  "4k": 10,
};

/** Show the mid-playback buffering spinner only after this much continuous stall. */
const BUFFERING_SPINNER_DELAY_MS = 2000;

/** Media bytes under this threshold mean the chunk had no real frames (ffmpeg emits
 * a ~24B placeholder when the seek position is past encoded content). */
const MIN_REAL_CHUNK_BYTES = 1024;

export type PlaybackStatus = "idle" | "loading" | "playing";

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
  private activeStream: StreamingService | null = null;
  private bgBuffer: BufferManager | null = null;
  private bgStream: StreamingService | null = null;

  private chunkEnd = 0;
  private nextJobId: string | null = null;
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

  private startupRaf: number | null = null;
  private prefetchRaf: number | null = null;
  private bgReadyRaf: number | null = null;
  private bufferingTimer: ReturnType<typeof setTimeout> | null = null;

  private detachListeners: Array<() => void> = [];

  constructor(deps: PlaybackControllerDeps, events: PlaybackControllerEvents) {
    this.deps = deps;
    this.events = events;
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

    this.resetForNewSession();
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

    const buffer = new BufferManager(
      videoEl,
      () => this.activeStream?.pause(),
      () => this.activeStream?.resume(),
      videoDurationS
    );
    this.buffer = buffer;

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
  private resetForNewSession(): void {
    if (this.startupRaf !== null) {
      cancelAnimationFrame(this.startupRaf);
      this.startupRaf = null;
    }
    if (this.prefetchRaf !== null) {
      cancelAnimationFrame(this.prefetchRaf);
      this.prefetchRaf = null;
    }
    if (this.bgReadyRaf !== null) {
      cancelAnimationFrame(this.bgReadyRaf);
      this.bgReadyRaf = null;
    }
    if (this.bufferingTimer !== null) {
      clearTimeout(this.bufferingTimer);
      this.bufferingTimer = null;
    }
    this.activeStream?.cancel();
    this.buffer?.teardown();
    this.activeStream = null;
    this.buffer = null;

    this.bgStream?.cancel();
    this.bgBuffer?.teardown(false);
    this.bgStream = null;
    this.bgBuffer = null;

    this.chunkEnd = 0;
    this.nextJobId = null;
    this.prefetchFired = false;
    this.hasStartedPlayback = false;
    this.seekTarget = null;

    this.sessionSpan?.end();
    this.sessionSpan = null;
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
      if (this.hasStartedPlayback) {
        buffer.setAfterAppend(null);
        return;
      }
      if (buffer.bufferedEnd >= target) {
        this.hasStartedPlayback = true;
        buffer.setAfterAppend(null);
        onPlay();
      }
    };
    buffer.setAfterAppend(tryPlay);
    const checkReady = (): void => {
      if (this.hasStartedPlayback) return;
      tryPlay();
      if (!this.hasStartedPlayback) {
        this.startupRaf = requestAnimationFrame(checkReady);
      }
    };
    this.startupRaf = requestAnimationFrame(checkReady);
  }

  // ── Chunk streaming primitive ──────────────────────────────────────────────

  /**
   * Streams a chunk (identified by its raw job ID) into the given BufferManager.
   * Opens a `chunk.stream` span whose context is threaded into the fetch so the
   * server's `stream.request` nests under it. Does NOT call markStreamDone() —
   * the caller decides when the final chunk ends.
   */
  private streamChunk(
    rawJobId: string,
    buffer: BufferManager,
    isFirstChunk: boolean,
    res: Resolution,
    onDone: () => void,
    onError: (err: Error) => void
  ): StreamingService {
    const chunkSpan: Span = playbackTracer.startSpan(
      "chunk.stream",
      {
        attributes: {
          "chunk.job_id": rawJobId,
          "chunk.resolution": res,
          "chunk.is_first": isFirstChunk,
        },
      },
      getSessionContext()
    );
    // Build a context with chunkSpan as the active span so that
    // FetchInstrumentation propagates traceparent linking server's
    // stream.request under this chunk.stream span.
    const chunkCtx = trace.setSpan(getSessionContext(), chunkSpan);

    const wrappedOnDone = (): void => {
      chunkSpan.end();
      onDone();
    };
    const wrappedOnError = (err: Error): void => {
      chunkSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      chunkSpan.end();
      onError(err);
    };

    const svc = new StreamingService();
    let totalMediaBytes = 0;
    const videoEl = this.deps.videoEl;

    void svc.start(
      rawJobId,
      0,
      async (segData, isInit) => {
        // Continuation chunks (chunk 2, 3, …) must NOT re-append the init
        // segment. The SourceBuffer was initialised by chunk 0's init and
        // the codec doesn't change between chunks. Re-appending an init —
        // especially one produced with a different -ss start time, which
        // causes ffmpeg to emit a different moov box — stalls the decoder
        // and causes visible buffering / MSE errors.
        if (isInit && !isFirstChunk) {
          return;
        }

        if (!isInit) {
          totalMediaBytes += segData.byteLength;
        }

        try {
          await buffer.appendSegment(segData);
          // On the init segment of the very first chunk: arm the startup-buffer
          // check that calls video.play() once enough content is buffered.
          if (isFirstChunk && isInit && !this.hasStartedPlayback) {
            const startupTarget = STARTUP_BUFFER_S[res];
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
        } catch (err) {
          playbackLog.error("Buffer append error", { message: (err as Error).message });
          wrappedOnError(err as Error);
        }
      },
      wrappedOnError,
      () => {
        // Chunks with < MIN_REAL_CHUNK_BYTES of media are placeholder output
        // from ffmpeg when the seek position is past encoded content — real
        // video segments are always much larger (several KB even at the lowest
        // bitrate). Stop chaining and signal end-of-stream.
        const hasRealContent = totalMediaBytes >= MIN_REAL_CHUNK_BYTES;
        if (!hasRealContent) {
          playbackLog.info("Chunk had no real content — marking stream done", {
            job_id: rawJobId,
            total_media_bytes: totalMediaBytes,
          });
          buffer.markStreamDone();
          this.events.onJobCreated(null);
          chunkSpan.end();
          return;
        }
        wrappedOnDone();
      },
      chunkCtx
    );
    return svc;
  }

  // ── Chunk scheduler ────────────────────────────────────────────────────────

  /** Fires a startTranscode mutation for the given time window and returns the raw job ID. */
  private requestChunk(res: Resolution, startS: number, endS: number): Promise<string> {
    const videoDurationS = this.deps.getVideoDurationS();
    const clampedEnd = Math.min(endS, videoDurationS);
    playbackLog.info(`Requesting chunk [${startS}s, ${clampedEnd}s)`, {
      start_s: startS,
      end_s: clampedEnd,
    });
    return this.deps
      .startTranscodeChunk({
        resolution: res,
        startTimeSeconds: startS,
        endTimeSeconds: clampedEnd,
      })
      .then(({ rawJobId, globalJobId }) => {
        this.events.onJobCreated(globalJobId);
        playbackLog.info(
          `Chunk job ${rawJobId.slice(0, 8)} created for [${startS}s, ${clampedEnd}s)`,
          { job_id: rawJobId, start_s: startS, end_s: clampedEnd }
        );
        return rawJobId;
      })
      .catch((err: Error) => {
        playbackLog.error("Chunk mutation error", { message: err.message });
        throw err;
      });
  }

  /**
   * Starts streaming a series of chunks starting at `startS`. Each chunk streams
   * until done, then the next one begins automatically. The final chunk calls
   * `buffer.markStreamDone()`.
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

    void this.requestChunk(res, startS, chunkEnd)
      .then((rawJobId) => {
        const isLast = chunkEnd >= videoDurationS;

        const onDone = (): void => {
          const savedNextJobId = this.nextJobId;
          this.nextJobId = null;
          this.prefetchFired = false;

          if (isLast) {
            buffer.markStreamDone();
            this.events.onJobCreated(null);
            playbackLog.info("Final chunk done");
          } else {
            // Continue to the next chunk — use prefetched job ID if available,
            // otherwise request it now (prefetch may not have fired yet).
            const nextStart = chunkEnd;
            const nextEnd = Math.min(nextStart + CHUNK_DURATION_S, videoDurationS);
            this.chunkEnd = nextEnd;

            if (savedNextJobId) {
              const nextIsLast = nextEnd >= videoDurationS;
              const nextSvc = this.streamChunk(
                savedNextJobId,
                buffer,
                false,
                res,
                nextIsLast
                  ? (): void => {
                      buffer.markStreamDone();
                      this.events.onJobCreated(null);
                    }
                  : (): void => this.startChunkSeries(res, nextEnd, buffer, false),
                (err) => this.setError(err.message)
              );
              this.activeStream = nextSvc;
            } else {
              this.startChunkSeries(res, nextStart, buffer, false);
            }
          }
        };

        const svc = this.streamChunk(rawJobId, buffer, isFirstChunk, res, onDone, (err) => {
          this.setError(err.message);
        });
        this.activeStream = svc;
      })
      .catch((err: Error) => {
        this.setError(err.message);
        this.setStatus("idle");
      });
  }

  // ── Prefetch RAF loop ──────────────────────────────────────────────────────

  private startPrefetchLoop(res: Resolution): void {
    const videoEl = this.deps.videoEl;
    const tick = (): void => {
      if (!this.buffer) return;
      const videoDurationS = this.deps.getVideoDurationS();

      const chunkEnd = this.chunkEnd;
      if (!this.prefetchFired && chunkEnd > 0 && chunkEnd < videoDurationS) {
        const timeUntilEnd = chunkEnd - videoEl.currentTime;
        if (timeUntilEnd <= PREFETCH_THRESHOLD_S) {
          this.prefetchFired = true;
          const nextStart = chunkEnd;
          const nextEnd = Math.min(nextStart + CHUNK_DURATION_S, videoDurationS);
          playbackLog.info(
            `Prefetching next chunk [${nextStart}s, ${nextEnd}s) — ${timeUntilEnd.toFixed(1)}s before current chunk end`,
            {
              next_start_s: nextStart,
              next_end_s: nextEnd,
              time_until_end_s: parseFloat(timeUntilEnd.toFixed(1)),
            }
          );
          void this.requestChunk(res, nextStart, nextEnd)
            .then((rawJobId) => {
              this.nextJobId = rawJobId;
            })
            .catch(() => {
              this.prefetchFired = false; // allow retry
            });
        }
      }

      this.prefetchRaf = requestAnimationFrame(tick);
    };
    this.prefetchRaf = requestAnimationFrame(tick);
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

    // Cancel any in-flight background buffer
    this.bgStream?.cancel();
    this.bgBuffer?.teardown(false);

    const bgBuffer = new BufferManager(
      videoEl,
      () => this.bgStream?.pause(),
      () => this.bgStream?.resume(),
      videoDurationS
    );
    this.bgBuffer = bgBuffer;

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

          // Tear down foreground (don't clear videoEl.src yet)
          this.activeStream?.cancel();
          this.buffer?.teardown(false);
          this.activeStream = null;

          // Promote background — cancel the prefetch loop for the old foreground
          // chunk (a new one starts via startPrefetchLoop below) and the bg
          // readiness check (swap has succeeded).
          if (this.prefetchRaf !== null) cancelAnimationFrame(this.prefetchRaf);
          if (this.bgReadyRaf !== null) cancelAnimationFrame(this.bgReadyRaf);
          this.bgReadyRaf = null;
          videoEl.src = objectUrl;
          videoEl.currentTime = swapTime;
          videoEl.play().catch(() => {});

          this.buffer = bgBuffer;
          bgBuffer.promoteToForeground();
          this.bgBuffer = null;
          this.activeStream = this.bgStream;
          this.bgStream = null;

          this.resolution = newRes;
          // Resume chunk series from the swapped position
          const newChunkEnd = Math.min(chunkStart + CHUNK_DURATION_S, videoDurationS);
          this.chunkEnd = newChunkEnd;
          this.prefetchFired = false;
          this.startPrefetchLoop(newRes);
        };

        const checkReady = (): void => {
          if (bgBuffer.bufferedEnd >= startupTarget) {
            onReady();
          } else {
            this.bgReadyRaf = requestAnimationFrame(checkReady);
          }
        };

        void this.requestChunk(
          newRes,
          chunkStart,
          Math.min(chunkStart + CHUNK_DURATION_S, videoDurationS)
        )
          .then((rawJobId) => {
            const bgSvc = this.streamChunk(
              rawJobId,
              bgBuffer,
              true, // background buffer is fresh — it needs the init segment
              newRes,
              () => {
                /* chunk done — swap may already have happened */
              },
              (err) => {
                playbackLog.error("Background stream error", { message: err.message });
              }
            );
            this.bgStream = bgSvc;
            checkReady();
          })
          .catch((err: Error) => {
            playbackLog.error("Background chunk error", { message: err.message });
          });
      })
      .catch((err: Error) => {
        playbackLog.error("Background MSE init failed", { message: err.message });
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
    // Clear any pending buffering-debounce timer so we don't double-fire.
    if (this.bufferingTimer !== null) {
      clearTimeout(this.bufferingTimer);
      this.bufferingTimer = null;
    }
    this.setStatus("loading");

    playbackLog.info(
      `Seek to ${seekTime.toFixed(1)}s → flushing buffer, restarting from chunk boundary ${snapTime}s`,
      {
        seek_target_s: parseFloat(seekTime.toFixed(1)),
        snapped_to_s: snapTime,
      }
    );

    // Cancel active stream and flush the buffer
    this.activeStream?.cancel();
    this.activeStream = null;
    this.nextJobId = null;
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

  private handleWaiting = (): void => {
    // Only debounce-show the spinner for mid-playback stalls (not during the
    // initial startup loading phase which already has its own spinner path).
    if (!this.hasStartedPlayback) return;
    const stallStartedAt = Date.now();
    this.bufferingTimer = setTimeout(() => {
      this.bufferingTimer = null;
      this.setStatus("loading");
      const stallDurationMs = Date.now() - stallStartedAt;
      playbackLog.warn(`Buffering stall >2s — showing spinner (stalled for ${stallDurationMs}ms)`, {
        stall_duration_ms: stallDurationMs,
      });
    }, BUFFERING_SPINNER_DELAY_MS);
  };

  private handleStalled = (): void => {
    playbackLog.warn("Stalled — network slow");
  };

  private handlePlaying = (): void => {
    // Seek has resolved — clear the dedup guard so future seeks can proceed.
    this.seekTarget = null;
    // Clear the buffering debounce timer if the stall resolved within the window.
    if (this.bufferingTimer !== null) {
      clearTimeout(this.bufferingTimer);
      this.bufferingTimer = null;
    }
    // Restore "playing" if the debounce already fired and showed the spinner.
    if (this.status === "loading" && this.hasStartedPlayback) {
      this.setStatus("playing");
    }
  };

  private attachVideoListeners(): void {
    const el = this.deps.videoEl;
    el.addEventListener("seeking", this.handleSeeking);
    el.addEventListener("waiting", this.handleWaiting);
    el.addEventListener("stalled", this.handleStalled);
    el.addEventListener("playing", this.handlePlaying);
    this.detachListeners.push(
      () => el.removeEventListener("seeking", this.handleSeeking),
      () => el.removeEventListener("waiting", this.handleWaiting),
      () => el.removeEventListener("stalled", this.handleStalled),
      () => el.removeEventListener("playing", this.handlePlaying)
    );
  }
}
