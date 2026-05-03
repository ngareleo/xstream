import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import { clientConfig } from "~/config/appConfig.js";
import type { useChunkedPlaybackRecordSessionMutation } from "~/relay/__generated__/useChunkedPlaybackRecordSessionMutation.graphql.js";
import type { useChunkedPlaybackStartChunkMutation } from "~/relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";
import {
  PlaybackController,
  type PlaybackStatus,
  type RecordSessionFn,
  type StartTranscodeChunkFn,
} from "~/services/playbackController.js";
import { PlaybackError } from "~/services/playbackErrors.js";
import { DISPLAY_TO_GQL, type Resolution } from "~/types.js";

export type { PlaybackStatus };

export interface UseChunkedPlaybackResult {
  /** Current pipeline state: idle (not started), loading (buffering), or playing. */
  status: PlaybackStatus;
  /** Human-readable error message, or null when no error is active. */
  error: string | null;
  /** Start (or restart) playback at the given resolution. While playing, this
   * triggers a background-buffer resolution switch instead of a full teardown. */
  startPlayback: (res: Resolution) => void;
  /** Fire-and-forget warm-up of chunk 0 at the given resolution. Issues the
   * `startTranscode` mutation for `[0, chunkRampS[0])` without setting up
   * MSE / a stream connection, so ffmpeg starts encoding the moment the
   * player page mounts — by the time the user clicks Play, init.mp4 is
   * usually already on disk and the click-path mutation hits the
   * deterministic job-id cache. The server's `orphan_timeout_ms = 30 s`
   * cleans up the encode if the user never clicks Play. Resolution mismatch
   * (e.g. the user toggles 4k → 1080p before playing) is acceptable: the
   * click-path mutation simply spawns fresh, identical to today's
   * behaviour. */
  prewarm: (res: Resolution) => void;
  /** Seek to an absolute position. Stores the intended target before triggering
   * the seeking DOM event so the controller reads the unclamped value. */
  seekTo: (targetSeconds: number) => void;
}

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
      __typename
      ... on TranscodeJob {
        id
        status
        completedSegments
        totalSegments
      }
      ... on PlaybackError {
        code
        message
        retryable
        retryAfterMs
      }
    }
  }
`;

const RECORD_SESSION_MUTATION = graphql`
  mutation useChunkedPlaybackRecordSessionMutation(
    $traceId: String!
    $videoId: ID!
    $resolution: Resolution!
  ) {
    recordPlaybackSession(traceId: $traceId, videoId: $videoId, resolution: $resolution) {
      id
      traceId
      startedAt
    }
  }
`;

/**
 * Thin React bridge over PlaybackController. Owns the Relay mutation plumbing
 * and bridges controller state transitions into useState, but delegates all
 * playback orchestration (chunk scheduling, MSE buffering, seeking, resolution
 * switching) to the controller.
 */
export function useChunkedPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoId: string,
  videoDurationS: number,
  onJobCreated?: (jobId: string | null) => void
): UseChunkedPlaybackResult {
  const [startChunk] = useMutation<useChunkedPlaybackStartChunkMutation>(START_CHUNK_MUTATION);
  const [recordSession] =
    useMutation<useChunkedPlaybackRecordSessionMutation>(RECORD_SESSION_MUTATION);

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Mirror mutable props/callbacks into refs so the controller (created once
  // per mount) always reads the latest values without needing to be recreated.
  // This preserves the original hook's behaviour where videoId changes didn't
  // trigger a teardown.
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const videoDurationSRef = useRef(videoDurationS);
  videoDurationSRef.current = videoDurationS;
  const startChunkRef = useRef(startChunk);
  startChunkRef.current = startChunk;
  const recordSessionRef = useRef(recordSession);
  recordSessionRef.current = recordSession;
  const onJobCreatedRef = useRef(onJobCreated);
  onJobCreatedRef.current = onJobCreated;

  const controllerRef = useRef<PlaybackController | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const startTranscodeChunk: StartTranscodeChunkFn = ({
      resolution,
      startTimeSeconds,
      endTimeSeconds,
    }) =>
      new Promise((resolve, reject) => {
        startChunkRef.current({
          variables: {
            videoId: videoIdRef.current,
            resolution: DISPLAY_TO_GQL[resolution] as Parameters<
              typeof startChunk
            >[0]["variables"]["resolution"],
            startTimeSeconds,
            endTimeSeconds,
          },
          onCompleted: (response) => {
            const result = response.startTranscode;
            if (result.__typename === "PlaybackError") {
              // Typed failure — preserve code/retryable/retryAfterMs so
              // PlaybackController.requestChunk's retry policy can decide.
              reject(
                new PlaybackError({
                  code: result.code as ConstructorParameters<typeof PlaybackError>[0]["code"],
                  message: result.message,
                  retryable: result.retryable,
                  retryAfterMs: result.retryAfterMs ?? null,
                })
              );
              return;
            }
            if (result.__typename !== "TranscodeJob") {
              // Defensive: server added a new union member without a client
              // update. Treat as INTERNAL — non-retryable, surfaces to user.
              reject(
                new PlaybackError({
                  code: "INTERNAL",
                  message: `Unknown StartTranscodeResult variant: ${result.__typename}`,
                  retryable: false,
                  retryAfterMs: null,
                })
              );
              return;
            }
            const globalJobId = result.id;
            const rawJobId = atob(globalJobId).replace("TranscodeJob:", "");
            resolve({ rawJobId, globalJobId });
          },
          onError: (err) =>
            // Network / Relay protocol errors (not domain errors) — non-retryable.
            // Domain errors land in onCompleted as the PlaybackError union member.
            reject(
              new PlaybackError({
                code: "INTERNAL",
                message: `Mutation transport error: ${err.message}`,
                retryable: false,
                retryAfterMs: null,
              })
            ),
        });
      });

    const recordSessionFn: RecordSessionFn = ({ traceId, resolution }) => {
      recordSessionRef.current({
        variables: {
          traceId,
          videoId: videoIdRef.current,
          resolution: DISPLAY_TO_GQL[resolution] as Parameters<
            typeof recordSession
          >[0]["variables"]["resolution"],
        },
        onError: () => {},
      });
    };

    const controller = new PlaybackController(
      {
        videoEl,
        getVideoId: () => videoIdRef.current,
        getVideoDurationS: () => videoDurationSRef.current,
        startTranscodeChunk,
        recordSession: recordSessionFn,
      },
      {
        onStatusChange: setStatus,
        onError: setError,
        onJobCreated: (id) => onJobCreatedRef.current?.(id),
      }
    );
    controllerRef.current = controller;

    return () => {
      controller.teardown();
      controllerRef.current = null;
    };
  }, [videoRef, startChunk, recordSession]);

  const startPlayback = useCallback((res: Resolution): void => {
    controllerRef.current?.startPlayback(res);
  }, []);

  const prewarm = useCallback((res: Resolution): void => {
    // Fire just the GraphQL mutation — no MSE init, no stream connection,
    // no PlaybackController state. The server creates the job, ffmpeg
    // starts encoding chunk 0 to disk. When the user clicks Play, the
    // click-path mutation produces the same job-id (deterministic SHA1 of
    // content_fp + res + 0 + ramp[0]) and the server returns the cached
    // job — segments already written are pulled immediately.
    //
    // Errors are swallowed: if the warmup fails (network blip, server
    // restart) the click-path mutation will retry from scratch via
    // PlaybackController's three-tier retry, identical to today's
    // behaviour. Re-surfacing the failure here would only add noise.
    startChunkRef.current({
      variables: {
        videoId: videoIdRef.current,
        resolution: DISPLAY_TO_GQL[res] as Parameters<
          typeof startChunk
        >[0]["variables"]["resolution"],
        startTimeSeconds: 0,
        endTimeSeconds:
          clientConfig.playback.chunkRampS[0] ?? clientConfig.playback.chunkSteadyStateS,
      },
      onCompleted: () => {},
      onError: () => {},
    });
  }, []);

  const seekTo = useCallback((targetSeconds: number): void => {
    controllerRef.current?.seekTo(targetSeconds);
  }, []);

  return { status, error, startPlayback, prewarm, seekTo };
}
