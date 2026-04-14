import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import type { useChunkedPlaybackStartChunkMutation } from "~/relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";
import { BufferManager } from "~/services/BufferManager.js";
import { StreamingLogger } from "~/services/StreamingLogger.js";
import { StreamingService } from "~/services/StreamingService.js";
import type { Resolution } from "~/types.js";
import { DISPLAY_TO_GQL, RESOLUTION_MIME_TYPE } from "~/types.js";

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
  status: PlaybackStatus;
  error: string | null;
  startPlayback: (res: Resolution) => void;
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
  const rafRef = useRef<number | null>(null);
  const onJobCreatedRef = useRef(onJobCreated);
  onJobCreatedRef.current = onJobCreated;

  // ── Teardown ───────────────────────────────────────────────────────────────

  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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

    onJobCreatedRef.current?.(null);
    StreamingLogger.push({ category: "PLAYBACK", message: "Teardown", isError: false });
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
      void svc.start(
        rawJobId,
        0,
        async (segData, isInit) => {
          try {
            await buffer.appendSegment(segData);
            // On the init segment of the very first chunk: wait for startup buffer
            // before calling video.play() so playback starts smoothly.
            if (isFirstChunk && isInit && !hasStartedPlaybackRef.current) {
              const videoEl = videoRef.current;
              if (videoEl) {
                const startupTarget = STARTUP_BUFFER_S[res];
                const checkReady = (): void => {
                  if (hasStartedPlaybackRef.current) return;
                  if (buffer.bufferedEnd >= startupTarget) {
                    hasStartedPlaybackRef.current = true;
                    videoEl.play().catch(() => {});
                    setStatus("playing");
                    StreamingLogger.push({
                      category: "PLAYBACK",
                      message: `video.play() — status: playing (buffered ${buffer.bufferedEnd.toFixed(1)}s >= ${startupTarget}s)`,
                      isError: false,
                    });
                  } else {
                    rafRef.current = requestAnimationFrame(checkReady);
                  }
                };
                checkReady();
              }
            }
          } catch (err) {
            const msg = `Buffer error: ${(err as Error).message}`;
            StreamingLogger.push({ category: "PLAYBACK", message: msg, isError: true });
            onError(err as Error);
          }
        },
        onError,
        onDone
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
                    : onDone,
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

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      void buffer; // referenced by the closure indirectly via bufferRef
    },
    [videoRef, videoDurationS, requestChunk]
  );

  // ── Seek handler ───────────────────────────────────────────────────────────

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleSeeking = (): void => {
      if (isHandlingSeekRef.current) return;
      if (status !== "playing") return;
      if (!bufferRef.current) return;

      isHandlingSeekRef.current = true;
      const seekTime = videoEl.currentTime;
      const snapTime = Math.floor(seekTime / CHUNK_DURATION_S) * CHUNK_DURATION_S;

      StreamingLogger.push({
        category: "PLAYBACK",
        message: `Seek to ${seekTime.toFixed(1)}s → snapping to chunk boundary ${snapTime}s`,
        isError: false,
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

      // Cancel any in-flight background buffer
      bgStreamRef.current?.cancel();
      bgBufferRef.current?.teardown(false);

      const bgBuffer = new BufferManager(
        videoEl,
        () => bgStreamRef.current?.pause(),
        () => bgStreamRef.current?.resume()
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

            // Promote background
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            videoEl.src = objectUrl;
            videoEl.currentTime = swapTime;
            videoEl.play().catch(() => {});

            bufferRef.current = bgBuffer;
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
              requestAnimationFrame(checkReady);
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
                false,
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

      const buffer = new BufferManager(
        videoEl,
        () => activeStreamRef.current?.pause(),
        () => activeStreamRef.current?.resume()
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

  return { status, error, startPlayback };
}
