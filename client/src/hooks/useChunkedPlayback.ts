import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import type { useChunkedPlaybackRecordSessionMutation } from "~/relay/__generated__/useChunkedPlaybackRecordSessionMutation.graphql.js";
import type { useChunkedPlaybackStartChunkMutation } from "~/relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";
import {
  PlaybackController,
  type PlaybackStatus,
  type RecordSessionFn,
  type StartTranscodeChunkFn,
} from "~/services/PlaybackController.js";
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
      id
      status
      completedSegments
      totalSegments
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
            const globalJobId = response.startTranscode.id;
            const rawJobId = atob(globalJobId).replace("TranscodeJob:", "");
            resolve({ rawJobId, globalJobId });
          },
          onError: (err) => reject(new Error(`Mutation error: ${err.message}`)),
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

  const seekTo = useCallback((targetSeconds: number): void => {
    controllerRef.current?.seekTo(targetSeconds);
  }, []);

  return { status, error, startPlayback, seekTo };
}
