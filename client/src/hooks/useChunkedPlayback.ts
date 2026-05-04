import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import { clientConfig } from "~/config/appConfig.js";
import type { useChunkedPlaybackCancelChunksMutation } from "~/relay/__generated__/useChunkedPlaybackCancelChunksMutation.graphql.js";
import type { useChunkedPlaybackRecordSessionMutation } from "~/relay/__generated__/useChunkedPlaybackRecordSessionMutation.graphql.js";
import type { useChunkedPlaybackStartChunkMutation } from "~/relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";
import {
  type CancelTranscodeChunksFn,
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
  /** Bridges `transcodeJobUpdated → status: COMPLETE` subscription updates
   * into the controller so the serial-prefetch gate can open as soon as the
   * current foreground's encode is done. Stale updates (a previous chunk's
   * job ID) are filtered inside the controller. */
  onTranscodeComplete: (jobId: string) => void;
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

const CANCEL_CHUNKS_MUTATION = graphql`
  mutation useChunkedPlaybackCancelChunksMutation($jobIds: [ID!]!) {
    cancelTranscode(jobIds: $jobIds)
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

/** React bridge over PlaybackController; owns Relay mutations. */
export function useChunkedPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoId: string,
  videoDurationS: number,
  onJobCreated?: (jobId: string | null) => void
): UseChunkedPlaybackResult {
  const [startChunk] = useMutation<useChunkedPlaybackStartChunkMutation>(START_CHUNK_MUTATION);
  const [cancelChunks] =
    useMutation<useChunkedPlaybackCancelChunksMutation>(CANCEL_CHUNKS_MUTATION);
  const [recordSession] =
    useMutation<useChunkedPlaybackRecordSessionMutation>(RECORD_SESSION_MUTATION);

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Controller created once per mount; refs prevent teardown on prop changes.
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;
  const videoDurationSRef = useRef(videoDurationS);
  videoDurationSRef.current = videoDurationS;
  const startChunkRef = useRef(startChunk);
  startChunkRef.current = startChunk;
  const cancelChunksRef = useRef(cancelChunks);
  cancelChunksRef.current = cancelChunks;
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

    const cancelTranscodeChunks: CancelTranscodeChunksFn = (rawJobIds) => {
      // Fire-and-forget; SIGKILL escalation is deferred server-side.
      if (rawJobIds.length === 0) return;
      const jobIds = rawJobIds.map((raw) => btoa(`TranscodeJob:${raw}`));
      cancelChunksRef.current({
        variables: { jobIds },
        onCompleted: () => {},
        onError: () => {},
      });
    };

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
        cancelTranscodeChunks,
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
    // See docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md.
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

  const onTranscodeComplete = useCallback((jobId: string): void => {
    controllerRef.current?.onTranscodeComplete(jobId);
  }, []);

  return { status, error, startPlayback, prewarm, onTranscodeComplete, seekTo };
}
