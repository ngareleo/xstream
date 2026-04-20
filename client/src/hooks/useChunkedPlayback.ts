import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import type { useChunkedPlaybackStartChunkMutation } from "~/relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";
import { BufferManager } from "~/services/BufferManager.js";
import { StreamingLogger } from "~/services/StreamingLogger.js";
import { StreamingService } from "~/services/StreamingService.js";
import { getClientLogger } from "~/telemetry.js";
import type { Resolution } from "~/types.js";
import { DISPLAY_TO_GQL, RESOLUTION_MIME_TYPE } from "~/types.js";

const playbackLog = getClientLogger("playback");

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Mutation ─────────────────────────────────────────────────────────────────

const START_CHUNK_MUTATION = graphql`
  mutation useChunkedPlaybackStartChunkMutation(
    $videoId: ID!
    $resolution: Resolution!
    $startTimeSeconds: Float
    $endTimeSeconds: Float
  ) {
    startTranscode(
      videoId: $videoId
      resolution: $resolution
      startTimeSeconds: $startTimeSeconds
      endTimeSeconds: $endTimeSeconds
    ) {
      id
      status
      completedSegments
      totalSegments
    }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlaybackStatus = "idle" | "loading" | "playing";

export interface UseChunkedPlaybackResult {
  /** Current pipeline state: idle (not started), loading (buffering), or playing. */
  status: PlaybackStatus;
  /** Human-readable error message, or null when no error is active. */
  error: string | null;
  /** Start (or restart) playback at the given resolution. While playing, this
   * triggers a background-buffer resolution switch instead of a full teardown. */
  startPlayback: (res: Resolution) => void;
  /** Seek to an absolute position. Stores the intended target before triggering
   * the seeking DOM event so handleSeeking reads the unclamped value. */
  seekTo: (targetSeconds: number) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChunkedPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoId: string,
  videoDurationS: number,
  onJobCreated?: (jobId: string | null) => void
): UseChunkedPlaybackResult {
  const [startChunk] = useMutation<useChunkedPlaybackStartChunkMutation>(START_CHUNK_MUTATION);

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // ── Stable refs (don't trigger re-renders) ─────────────────────────────────
  const bufferRef = useRef<BufferManager | null>(null);
  const activeStreamRef = useRef<StreamingService | null>(null);
  const bgBufferRef = useRef<BufferManager | null>(null);
  const bgStreamRef = useRef<StreamingService | null>(null);

  const resolutionRef = useRef<Resolution>("240p");
  const chunkEndRef = useRef(0); // absolute time (s) where current chunk ends
  const nextJobIdRef = useRef<string | null>(null); // prefetched next chunk raw job ID
  const prefetchFiredRef = useRef(false);
  const hasStartedPlaybackRef = useRef(false);
  const isHandlingSeekRef = useRef(false);
  // Tracks the chunk-boundary snap target of the most-recent seek so that the
  // asynchronously-queued "seeking" event fired by BufferManager.seek()'s own
  // videoEl.currentTime assignment doesn't re-trigger a full seek/flush cycle.
  // Cleared when the video fires "playing" (seek resolved, playback resumed).
  const seekTargetRef = useRef<number | null>(null);
  // Separate RAF handles for each independent loop so teardown() can cancel
  // all of them without one loop's ID overwriting another's.
  const startupRafRef = useRef<number | null>(null); // startup buffer readiness check
  const prefetchRafRef = useRef<number | null>(null); // prefetch chunk scheduler
  const bgReadyRafRef = useRef<number | null>(null); // background buffer readiness check
  // Set by seekTo() before updating currentTime so handleSeeking can read the
  // unclamped target instead of whatever the browser clamped currentTime to.
  const pendingSeekTargetRef = useRef<number | null>(null);
  // Debounce timer for mid-playback buffering stalls. We only show the loading
  // spinner after 2 s of continuous stall to allow brief network hiccups to
  // resolve on their own without a jarring UI flash.
  const bufferingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of `status` updated every render so event-listener closures (which
  // capture the value at registration time) can read the current state.
  const statusRef = useRef<PlaybackStatus>("idle");
  statusRef.current = status;
  const onJobCreatedRef = useRef(onJobCreated);
  onJobCreatedRef.current = onJobCreated;

  // ── Teardown ───────────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    if (startupRafRef.current !== null) {
      cancelAnimationFrame(startupRafRef.current);
      startupRafRef.current = null;
    }
    if (prefetchRafRef.current !== null) {
      cancelAnimationFrame(prefetchRafRef.current);
      prefetchRafRef.current = null;
    }
    if (bgReadyRafRef.current !== null) {
      cancelAnimationFrame(bgReadyRafRef.current);
      bgReadyRafRef.current = null;
    }
    if (bufferingTimerRef.current !== null) {
      clearTimeout(bufferingTimerRef.current);
      bufferingTimerRef.current = null;
    }
    activeStreamRef.current?.cancel();
    bufferRef.current?.teardown();
    activeStreamRef.current = null;
    bufferRef.current = null;

    bgStreamRef.current?.cancel();
    bgBufferRef.current?.teardown(false);
    bgStreamRef.current = null;
    bgBufferRef.current = null;

    chunkEndRef.current = 0;
    nextJobIdRef.current = null;
    prefetchFiredRef.current = false;
    hasStartedPlaybackRef.current = false;
    seekTargetRef.current = null;

    onJobCreatedRef.current?.(null);
    StreamingLogger.push({ category: "PLAYBACK", message: "Teardown", isError: false });
    playbackLog.info("Playback teardown");
  }, []);

  // ── Chunk streaming helper ─────────────────────────────────────────────────

  /**
   * Streams a chunk (identified by its raw job ID) into the given BufferManager.
   * Returns a promise that resolves when the chunk stream is fully consumed.
   * Does NOT call markStreamDone() — the caller decides when the final chunk ends.
   */
  const streamChunk = useCallback(
    (
      rawJobId: string,
      buffer: BufferManager,
      isFirstChunk: boolean,
      res: Resolution,
      onDone: () => void,
      onError: (err: Error) => void
    ): StreamingService => {
      const svc = new StreamingService();
      let totalMediaBytes = 0;

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
            StreamingLogger.push({
              category: "PLAYBACK",
              message: `[chunk] Skipping init for continuation chunk ${rawJobId.slice(0, 8)}`,
              isError: false,
            });
            return;
          }

          if (!isInit) {
            totalMediaBytes += segData.byteLength;
          }

          try {
            await buffer.appendSegment(segData);
            // On the init segment of the very first chunk: arm the startup-buffer
            // check that calls video.play() once enough content is buffered.
            if (isFirstChunk && isInit && !hasStartedPlaybackRef.current) {
              const videoEl = videoRef.current;
              if (videoEl) {
                const startupTarget = STARTUP_BUFFER_S[res];

                const tryStart = (): void => {
                  if (hasStartedPlaybackRef.current) {
                    buffer.setAfterAppend(null);
                    return;
                  }
                  if (buffer.bufferedEnd >= startupTarget) {
                    hasStartedPlaybackRef.current = true;
                    buffer.setAfterAppend(null);
                    videoEl.play().catch(() => {});
                    setStatus("playing");
                    StreamingLogger.push({
                      category: "PLAYBACK",
                      message: `video.play() — status: playing (buffered ${buffer.bufferedEnd.toFixed(1)}s >= ${startupTarget}s)`,
                      isError: false,
                    });
                    playbackLog.info("Playback started", {
                      buffered_s: parseFloat(buffer.bufferedEnd.toFixed(1)),
                      startup_target_s: startupTarget,
                    });
                  }
                };

                // Fire after every real append (handles fast disk-cache paths where
                // all segments arrive before requestAnimationFrame fires, e.g. in
                // Playwright headless or on a warm SSD).
                buffer.setAfterAppend(tryStart);

                // Also poll via RAF as a fallback for slow live-transcode paths
                // where no segment may be ready for many seconds.
                // checkReady re-schedules itself via requestAnimationFrame until
                // hasStartedPlaybackRef is set, polling at display frame rate
                // (~60fps) without blocking the main thread between checks.
                // startupRafRef holds the pending frame ID so teardown() can
                // cancel the loop at any point.
                const checkReady = (): void => {
                  if (hasStartedPlaybackRef.current) return;
                  tryStart();
                  if (!hasStartedPlaybackRef.current) {
                    startupRafRef.current = requestAnimationFrame(checkReady);
                  }
                };
                startupRafRef.current = requestAnimationFrame(checkReady);
              }
            }
          } catch (err) {
            const msg = `Buffer error: ${(err as Error).message}`;
            StreamingLogger.push({ category: "PLAYBACK", message: msg, isError: true });
            playbackLog.error("Buffer append error", { message: (err as Error).message });
            onError(err as Error);
          }
        },
        onError,
        () => {
          // ffmpeg writes a tiny placeholder segment (~24B) when the seek position
          // is past the actual encoded content. Any chunk with < 1KB of total media
          // bytes has no real frames — real video segments are always much larger
          // (several KB even at the lowest bitrate). Stop chaining and signal
          // end-of-stream so the <video> element ends cleanly.
          const hasRealContent = totalMediaBytes >= 1024;
          if (!hasRealContent) {
            StreamingLogger.push({
              category: "PLAYBACK",
              message: `[chunk] ${rawJobId.slice(0, 8)} had only ${totalMediaBytes}B of media — marking stream done`,
              isError: false,
            });
            buffer.markStreamDone();
            onJobCreatedRef.current?.(null);
            return;
          }
          onDone();
        }
      );
      return svc;
    },
    [videoRef]
  );

  // ── Chunk scheduler ────────────────────────────────────────────────────────

  /**
   * Fires a startTranscode mutation for the given time window and returns the raw job ID.
   */
  const requestChunk = useCallback(
    (res: Resolution, startS: number, endS: number): Promise<string> => {
      const clampedEnd = Math.min(endS, videoDurationS);
      return new Promise((resolve, reject) => {
        StreamingLogger.push({
          category: "PLAYBACK",
          message: `startTranscode chunk [${startS}s, ${clampedEnd}s)`,
          isError: false,
        });
        startChunk({
          variables: {
            videoId,
            resolution: DISPLAY_TO_GQL[res] as Parameters<
              typeof startChunk
            >[0]["variables"]["resolution"],
            startTimeSeconds: startS,
            endTimeSeconds: clampedEnd,
          },
          onCompleted: (response) => {
            const rawJobId = atob(response.startTranscode.id).replace("TranscodeJob:", "");
            onJobCreatedRef.current?.(response.startTranscode.id);
            StreamingLogger.push({
              category: "PLAYBACK",
              message: `Job created — rawJobId: ${rawJobId} [${startS}s, ${clampedEnd}s)`,
              isError: false,
            });
            resolve(rawJobId);
          },
          onError: (err) => {
            const msg = `Mutation error: ${err.message}`;
            StreamingLogger.push({ category: "PLAYBACK", message: msg, isError: true });
            playbackLog.error("Chunk mutation error", { message: err.message });
            reject(new Error(msg));
          },
        });
      });
    },
    [videoId, startChunk, videoDurationS]
  );

  /**
   * Starts streaming a series of chunks starting at `startS`. Each chunk streams
   * until done, then the next one begins automatically. The final chunk calls
   * `buffer.markStreamDone()`.
   */
  const startChunkSeries = useCallback(
    (res: Resolution, startS: number, buffer: BufferManager, isFirstChunk: boolean): void => {
      const chunkEnd = Math.min(startS + CHUNK_DURATION_S, videoDurationS);
      chunkEndRef.current = chunkEnd;
      prefetchFiredRef.current = false;

      void requestChunk(res, startS, chunkEnd)
        .then((rawJobId) => {
          const isLast = chunkEnd >= videoDurationS;

          const onDone = (): void => {
            const savedNextJobId = nextJobIdRef.current;
            nextJobIdRef.current = null;
            prefetchFiredRef.current = false;

            if (isLast) {
              buffer.markStreamDone();
              onJobCreatedRef.current?.(null);
              StreamingLogger.push({
                category: "PLAYBACK",
                message: "Final chunk done",
                isError: false,
              });
            } else {
              // Continue to the next chunk — use prefetched job ID if available,
              // otherwise request it now (prefetch may not have fired yet).
              const nextStart = chunkEnd;
              const nextEnd = Math.min(nextStart + CHUNK_DURATION_S, videoDurationS);
              chunkEndRef.current = nextEnd;

              if (savedNextJobId) {
                const nextIsLast = nextEnd >= videoDurationS;
                const nextSvc = streamChunk(
                  savedNextJobId,
                  buffer,
                  false,
                  res,
                  nextIsLast
                    ? () => {
                        buffer.markStreamDone();
                        onJobCreatedRef.current?.(null);
                      }
                    : () => startChunkSeries(res, nextEnd, buffer, false),
                  (err) => setError(err.message)
                );
                activeStreamRef.current = nextSvc;
              } else {
                startChunkSeries(res, nextStart, buffer, false);
              }
            }
          };

          const svc = streamChunk(rawJobId, buffer, isFirstChunk, res, onDone, (err) => {
            setError(err.message);
          });
          activeStreamRef.current = svc;
        })
        .catch((err: Error) => {
          setError(err.message);
          setStatus("idle");
        });
    },
    [requestChunk, streamChunk, videoDurationS]
  );

  // ── Prefetch RAF loop ──────────────────────────────────────────────────────

  const startPrefetchLoop = useCallback(
    (res: Resolution, buffer: BufferManager): void => {
      const tick = (): void => {
        const videoEl = videoRef.current;
        if (!videoEl || !bufferRef.current) return;

        const chunkEnd = chunkEndRef.current;
        if (!prefetchFiredRef.current && chunkEnd > 0 && chunkEnd < videoDurationS) {
          const timeUntilEnd = chunkEnd - videoEl.currentTime;
          if (timeUntilEnd <= PREFETCH_THRESHOLD_S) {
            prefetchFiredRef.current = true;
            const nextStart = chunkEnd;
            const nextEnd = Math.min(nextStart + CHUNK_DURATION_S, videoDurationS);
            StreamingLogger.push({
              category: "PLAYBACK",
              message: `Prefetch chunk [${nextStart}s, ${nextEnd}s) — ${timeUntilEnd.toFixed(1)}s before current chunk end`,
              isError: false,
            });
            void requestChunk(res, nextStart, nextEnd)
              .then((rawJobId) => {
                nextJobIdRef.current = rawJobId;
              })
              .catch(() => {
                prefetchFiredRef.current = false; // allow retry
              });
          }
        }

        prefetchRafRef.current = requestAnimationFrame(tick);
      };
      prefetchRafRef.current = requestAnimationFrame(tick);
      void buffer; // referenced by the closure indirectly via bufferRef
    },
    [videoRef, videoDurationS, requestChunk]
  );

  // ── Buffering detection ────────────────────────────────────────────────────

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const onWaiting = (): void => {
      StreamingLogger.push({
        category: "PLAYBACK",
        message: "Buffering — waiting for data",
        isError: false,
      });
      // Only debounce-show the spinner for mid-playback stalls (not during the
      // initial startup loading phase which already has its own spinner path).
      if (!hasStartedPlaybackRef.current) return;
      const stallStartedAt = Date.now();
      bufferingTimerRef.current = setTimeout(() => {
        bufferingTimerRef.current = null;
        setStatus("loading");
        const stallDurationMs = Date.now() - stallStartedAt;
        StreamingLogger.push({
          category: "PLAYBACK",
          message: "Buffering stall >2s — showing spinner",
          isError: false,
        });
        playbackLog.warn("Buffering stall", { stall_duration_ms: stallDurationMs });
      }, 2000);
    };

    const onStalled = (): void => {
      StreamingLogger.push({
        category: "PLAYBACK",
        message: "Stalled — network slow",
        isError: true,
      });
    };

    const onPlaying = (): void => {
      // Seek has resolved — clear the dedup guard so future seeks can proceed.
      seekTargetRef.current = null;
      // Clear the buffering debounce timer if the stall resolved within 2s.
      if (bufferingTimerRef.current !== null) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
      // Restore "playing" if the 2s debounce already fired and showed the spinner.
      if (statusRef.current === "loading" && hasStartedPlaybackRef.current) {
        setStatus("playing");
      }
      StreamingLogger.push({
        category: "PLAYBACK",
        message: "Buffering resolved — playing",
        isError: false,
      });
    };

    videoEl.addEventListener("waiting", onWaiting);
    videoEl.addEventListener("stalled", onStalled);
    videoEl.addEventListener("playing", onPlaying);

    return () => {
      videoEl.removeEventListener("waiting", onWaiting);
      videoEl.removeEventListener("stalled", onStalled);
      videoEl.removeEventListener("playing", onPlaying);
      if (bufferingTimerRef.current !== null) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
    };
  }, [videoRef]);

  // ── Seek handler ───────────────────────────────────────────────────────────

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleSeeking = (): void => {
      if (isHandlingSeekRef.current) return;
      if (status !== "playing") return;
      if (!bufferRef.current) return;

      // Read the intended target from seekTo() if available; fall back to
      // videoEl.currentTime which the browser may have clamped to the buffered
      // range (e.g. seeking beyond the end of buffered data).
      const seekTime = pendingSeekTargetRef.current ?? videoEl.currentTime;

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
        pendingSeekTargetRef.current = null;
        StreamingLogger.push({
          category: "PLAYBACK",
          message: `Seek to ${seekTime.toFixed(1)}s — already buffered, no flush`,
          isError: false,
        });
        return;
      }

      isHandlingSeekRef.current = true;
      pendingSeekTargetRef.current = null;
      const snapTime = Math.floor(seekTime / CHUNK_DURATION_S) * CHUNK_DURATION_S;

      // Guard against re-entrancy: BufferManager.seek() sets videoEl.currentTime
      // to reposition the playhead, which queues a second "seeking" task. By the
      // time that task fires, .then() has already reset isHandlingSeekRef (a
      // microtask), so the second event would re-enter and cancel the streaming
      // that just started. seekTargetRef persists across the .then() reset and
      // blocks that spurious re-entry. Cleared when "playing" fires.
      if (seekTargetRef.current === snapTime) {
        isHandlingSeekRef.current = false;
        return;
      }
      seekTargetRef.current = snapTime;

      // Show spinner immediately — seek requires flushing and reloading the buffer.
      // Clear any pending 2s buffering timer so we don't double-fire.
      if (bufferingTimerRef.current !== null) {
        clearTimeout(bufferingTimerRef.current);
        bufferingTimerRef.current = null;
      }
      setStatus("loading");

      StreamingLogger.push({
        category: "PLAYBACK",
        message: `Seek to ${seekTime.toFixed(1)}s → snapping to chunk boundary ${snapTime}s`,
        isError: false,
      });
      playbackLog.info("Seek", {
        seek_target_s: parseFloat(seekTime.toFixed(1)),
        snapped_to_s: snapTime,
      });

      // Cancel active stream and flush the buffer
      activeStreamRef.current?.cancel();
      activeStreamRef.current = null;
      nextJobIdRef.current = null;
      prefetchFiredRef.current = false;

      void bufferRef.current.seek(snapTime).then(() => {
        isHandlingSeekRef.current = false;
        const buf = bufferRef.current;
        if (!buf) return;

        // Wait for the startup buffer threshold before resuming playback so the
        // video doesn't immediately stall after seeking to an unbuffered region.
        // Same pattern as initial startup: setAfterAppend fires on every append
        // (fast cache-hit paths) and checkReady polls at display frame rate.
        hasStartedPlaybackRef.current = false;
        const startupTarget = STARTUP_BUFFER_S[resolutionRef.current];

        const tryPlay = (): void => {
          if (hasStartedPlaybackRef.current) {
            buf.setAfterAppend(null);
            return;
          }
          if (buf.bufferedEnd >= startupTarget) {
            hasStartedPlaybackRef.current = true;
            buf.setAfterAppend(null);
            videoEl.play().catch(() => {});
            setStatus("playing");
            StreamingLogger.push({
              category: "PLAYBACK",
              message: `Seek ready — buffered ${buf.bufferedEnd.toFixed(1)}s >= ${startupTarget}s, resuming`,
              isError: false,
            });
          }
        };

        buf.setAfterAppend(tryPlay);
        const checkReady = (): void => {
          if (hasStartedPlaybackRef.current) return;
          tryPlay();
          if (!hasStartedPlaybackRef.current) {
            startupRafRef.current = requestAnimationFrame(checkReady);
          }
        };
        startupRafRef.current = requestAnimationFrame(checkReady);

        startChunkSeries(resolutionRef.current, snapTime, buf, false);
      });
    };

    videoEl.addEventListener("seeking", handleSeeking);
    return () => videoEl.removeEventListener("seeking", handleSeeking);
  }, [videoRef, status, startChunkSeries]);

  // ── Resolution switch (background buffer) ─────────────────────────────────

  const switchResolution = useCallback(
    (newRes: Resolution, videoEl: HTMLVideoElement): void => {
      const savedTime = videoEl.currentTime;
      const chunkStart = Math.floor(savedTime / CHUNK_DURATION_S) * CHUNK_DURATION_S;
      const mimeType = RESOLUTION_MIME_TYPE[newRes];

      StreamingLogger.push({
        category: "PLAYBACK",
        message: `Resolution switch → ${newRes} — background buffer starting at ${chunkStart}s`,
        isError: false,
      });
      playbackLog.info("Resolution switch initiated", {
        to: newRes,
        chunk_start_s: chunkStart,
      });

      // Cancel any in-flight background buffer
      bgStreamRef.current?.cancel();
      bgBufferRef.current?.teardown(false);

      const bgBuffer = new BufferManager(
        videoEl,
        () => bgStreamRef.current?.pause(),
        () => bgStreamRef.current?.resume(),
        videoDurationS
      );
      bgBufferRef.current = bgBuffer;

      void bgBuffer
        .initBackground(mimeType)
        .then((objectUrl) => {
          const startupTarget = STARTUP_BUFFER_S[newRes];

          const onReady = (): void => {
            // Swap: save currentTime, reassign src, seek, play
            const swapTime = videoRef.current?.currentTime ?? savedTime;
            StreamingLogger.push({
              category: "PLAYBACK",
              message: `Resolution swap → ${newRes} at ${swapTime.toFixed(1)}s`,
              isError: false,
            });

            // Tear down foreground (don't clear videoEl.src yet)
            activeStreamRef.current?.cancel();
            bufferRef.current?.teardown(false);
            activeStreamRef.current = null;

            // Promote background — cancel the prefetch loop for the old foreground
            // chunk (a new one starts via startPrefetchLoop below) and the bg
            // readiness check (swap has succeeded).
            if (prefetchRafRef.current !== null) cancelAnimationFrame(prefetchRafRef.current);
            if (bgReadyRafRef.current !== null) cancelAnimationFrame(bgReadyRafRef.current);
            bgReadyRafRef.current = null;
            videoEl.src = objectUrl;
            videoEl.currentTime = swapTime;
            videoEl.play().catch(() => {});

            bufferRef.current = bgBuffer;
            bgBuffer.promoteToForeground(); // clear offscreenVideoEl; use real currentTime
            bgBufferRef.current = null;
            activeStreamRef.current = bgStreamRef.current;
            bgStreamRef.current = null;

            resolutionRef.current = newRes;
            // Resume chunk series from the swapped position
            const newChunkEnd = Math.min(chunkStart + CHUNK_DURATION_S, videoDurationS);
            chunkEndRef.current = newChunkEnd;
            prefetchFiredRef.current = false;
            startPrefetchLoop(newRes, bgBuffer);
          };

          const checkReady = (): void => {
            if (bgBuffer.bufferedEnd >= startupTarget) {
              onReady();
            } else {
              bgReadyRafRef.current = requestAnimationFrame(checkReady);
            }
          };

          void requestChunk(
            newRes,
            chunkStart,
            Math.min(chunkStart + CHUNK_DURATION_S, videoDurationS)
          )
            .then((rawJobId) => {
              const bgSvc = streamChunk(
                rawJobId,
                bgBuffer,
                true, // background buffer is fresh — it needs the init segment
                newRes,
                () => {
                  /* chunk done — swap may already have happened */
                },
                (err) => {
                  StreamingLogger.push({
                    category: "PLAYBACK",
                    message: `BG stream error: ${err.message}`,
                    isError: true,
                  });
                }
              );
              bgStreamRef.current = bgSvc;
              checkReady();
            })
            .catch((err: Error) => {
              StreamingLogger.push({
                category: "PLAYBACK",
                message: `BG chunk error: ${err.message}`,
                isError: true,
              });
            });
        })
        .catch((err: Error) => {
          StreamingLogger.push({
            category: "PLAYBACK",
            message: `BG MSE init failed: ${err.message}`,
            isError: true,
          });
        });
    },
    [videoRef, videoDurationS, requestChunk, streamChunk, startPrefetchLoop]
  );

  // ── startPlayback ──────────────────────────────────────────────────────────

  const startPlayback = useCallback(
    (res: Resolution): void => {
      const videoEl = videoRef.current;
      if (!videoEl) return;

      // Resolution switch while playing → background buffer swap
      if (status === "playing" && bufferRef.current) {
        resolutionRef.current = res;
        switchResolution(res, videoEl);
        return;
      }

      teardown();
      setError(null);
      setStatus("loading");
      resolutionRef.current = res;
      hasStartedPlaybackRef.current = false;

      StreamingLogger.push({
        category: "PLAYBACK",
        message: `startPlayback — resolution: ${res}, videoDuration: ${videoDurationS}s`,
        isError: false,
      });
      playbackLog.info("Playback initiated", {
        video_id: videoId,
        resolution: res,
        duration_s: videoDurationS,
      });

      const buffer = new BufferManager(
        videoEl,
        () => activeStreamRef.current?.pause(),
        () => activeStreamRef.current?.resume(),
        videoDurationS
      );
      bufferRef.current = buffer;

      void buffer
        .init(RESOLUTION_MIME_TYPE[res])
        .then(() => {
          StreamingLogger.push({
            category: "PLAYBACK",
            message: `MSE init OK — mimeType: ${RESOLUTION_MIME_TYPE[res]}`,
            isError: false,
          });
          startChunkSeries(res, 0, buffer, true);
          startPrefetchLoop(res, buffer);
        })
        .catch((err: Error) => {
          const msg = `MSE init failed: ${err.message}`;
          StreamingLogger.push({ category: "PLAYBACK", message: msg, isError: true });
          setError(msg);
          setStatus("idle");
        });
    },
    [
      videoRef,
      status,
      videoDurationS,
      teardown,
      startChunkSeries,
      startPrefetchLoop,
      switchResolution,
    ]
  );

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => () => teardown(), [teardown]);

  // ── seekTo ─────────────────────────────────────────────────────────────────

  const seekTo = useCallback(
    (targetSeconds: number): void => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      // Store the intended target BEFORE setting currentTime so that the
      // synchronous "seeking" DOM event fires while pendingSeekTargetRef is set.
      pendingSeekTargetRef.current = targetSeconds;
      videoEl.currentTime = targetSeconds;
    },
    [videoRef]
  );

  return { status, error, startPlayback, seekTo };
}
