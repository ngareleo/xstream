import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useMutation } from "react-relay";

import type { useVideoPlaybackStartTranscodeMutation } from "~/relay/__generated__/useVideoPlaybackStartTranscodeMutation.graphql.js";
import { BufferManager } from "~/services/BufferManager.js";
import { StreamingService } from "~/services/StreamingService.js";
import type { Resolution } from "~/types.js";
import { DISPLAY_TO_GQL, RESOLUTION_MIME_TYPE } from "~/types.js";

const START_TRANSCODE_MUTATION = graphql`
  mutation useVideoPlaybackStartTranscodeMutation($videoId: ID!, $resolution: Resolution!) {
    startTranscode(videoId: $videoId, resolution: $resolution) {
      id
      status
      completedSegments
      totalSegments
    }
  }
`;

export type PlaybackStatus = "idle" | "loading" | "playing";

interface UseVideoPlaybackResult {
  status: PlaybackStatus;
  error: string | null;
  startPlayback: (res: Resolution) => void;
}

export function useVideoPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoId: string,
  onJobCreated?: (jobId: string | null) => void
): UseVideoPlaybackResult {
  const [startTranscode] =
    useMutation<useVideoPlaybackStartTranscodeMutation>(START_TRANSCODE_MUTATION);

  const streamingRef = useRef<StreamingService | null>(null);
  const bufferRef = useRef<BufferManager | null>(null);

  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const onJobCreatedRef = useRef(onJobCreated);
  onJobCreatedRef.current = onJobCreated;

  const teardown = useCallback(() => {
    streamingRef.current?.cancel();
    bufferRef.current?.teardown();
    streamingRef.current = null;
    bufferRef.current = null;
    onJobCreatedRef.current?.(null);
  }, []);

  const startPlayback = useCallback(
    (res: Resolution) => {
      const videoEl = videoRef.current;
      if (!videoEl) return;

      teardown();
      setError(null);
      setStatus("loading");

      startTranscode({
        variables: {
          videoId,
          resolution: DISPLAY_TO_GQL[res] as Parameters<
            typeof startTranscode
          >[0]["variables"]["resolution"],
        },
        onCompleted: (response) => {
          const jobGlobalId = response.startTranscode.id;
          const rawJobId = atob(jobGlobalId).replace("TranscodeJob:", "");
          onJobCreatedRef.current?.(jobGlobalId);
          void (async () => {
            const buffer = new BufferManager(
              videoEl,
              () => streamingRef.current?.pause(),
              () => streamingRef.current?.resume()
            );
            bufferRef.current = buffer;

            try {
              await buffer.init(RESOLUTION_MIME_TYPE[res]);
            } catch (err) {
              setError(`MSE init failed: ${(err as Error).message}`);
              setStatus("idle");
              return;
            }

            const streaming = new StreamingService();
            streamingRef.current = streaming;

            void streaming.start(
              rawJobId,
              0,
              async (segData, isInit) => {
                try {
                  await buffer.appendSegment(segData);
                  if (isInit) {
                    videoEl.play().catch(() => {});
                    setStatus("playing");
                  }
                } catch (err) {
                  setError(`Buffer error: ${(err as Error).message}`);
                }
              },
              (err) => setError(err.message),
              () => buffer.markStreamDone()
            );
          })();
        },
        onError: (err) => {
          setError(err.message);
          setStatus("idle");
        },
      });
    },
    [videoId, startTranscode, teardown, videoRef]
  );

  // Cleanup on unmount
  useEffect(() => () => teardown(), [teardown]);

  return { status, error, startPlayback };
}
