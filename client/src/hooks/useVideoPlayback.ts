import type { RefObject } from "react";

import { useChunkedPlayback, type UseChunkedPlaybackResult } from "./useChunkedPlayback.js";

export type { PlaybackStatus } from "./useChunkedPlayback.js";

/**
 * Thin wrapper around useChunkedPlayback that preserves the original call-site
 * signature used by VideoPlayer. Pass videoDurationS (from the fragment's
 * durationSeconds field) so the chunk scheduler can clamp chunk windows to the
 * actual video length.
 */
export function useVideoPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoId: string,
  videoDurationS: number,
  onJobCreated?: (jobId: string | null) => void
): UseChunkedPlaybackResult {
  return useChunkedPlayback(videoRef, videoId, videoDurationS, onJobCreated);
}
