import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useFragment } from "react-relay";

import {
  isFullscreenRequestedEvent,
  isPlayRequestedEvent,
  isResolutionChangedEvent,
  isSkipRequestedEvent,
  isVolumeChangedEvent,
  type ResolutionChangedData,
  type SkipRequestedData,
  type VolumeChangedData,
} from "~/components/control-bar/ControlBar.events.js";
import { ControlBar } from "~/components/control-bar/ControlBar.js";
import type { JobProgress } from "~/hooks/useJobSubscription.js";
import { useJobSubscription } from "~/hooks/useJobSubscription.js";
import { useVideoPlayback } from "~/hooks/useVideoPlayback.js";
import { IconPlay } from "~/lib/icons.js";
import type { VideoPlayer_video$key } from "~/relay/__generated__/VideoPlayer_video.graphql.js";
import type { Resolution } from "~/types.js";
import { maxResolutionForHeight } from "~/utils/formatters.js";

const VIDEO_FRAGMENT = graphql`
  fragment VideoPlayer_video on Video {
    id
    videoStream {
      height
      width
    }
    ...ControlBar_video
  }
`;

interface Props {
  video: VideoPlayer_video$key;
}

const HIDE_DELAY_MS = 3000;

export const VideoPlayer: FC<Props> = ({ video }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nativeMax = maxResolutionForHeight(data.videoStream?.height, data.videoStream?.width);
  const [resolution, setResolution] = useState<Resolution>(nativeMax);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  const { status, error, startPlayback } = useVideoPlayback(videoRef, data.id, setActiveJobId);

  useJobSubscription(activeJobId, (progress) => {
    setJobProgress(progress);
    if (progress.status === "COMPLETE" || progress.status === "ERROR") {
      setActiveJobId(null);
    }
  });

  // Auto-hide controls after HIDE_DELAY_MS of inactivity
  const showControls = useCallback((): void => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleResolutionChange = useCallback(
    (res: Resolution): void => {
      setResolution(res);
      if (status === "playing") startPlayback(res);
    },
    [status, startPlayback]
  );

  const handlePlay = useCallback((): void => {
    startPlayback(resolution);
  }, [resolution, startPlayback]);

  const interceptor = useCallback(
    async (wrapper: EventWrapper, _forwardEvent: (e: EventWrapper) => Promise<void>) => {
      if (isPlayRequestedEvent(wrapper)) {
        handlePlay();
      } else if (isResolutionChangedEvent(wrapper) && wrapper.event.data) {
        const { resolution: res } = wrapper.event.data() as ResolutionChangedData;
        handleResolutionChange(res);
      } else if (isSkipRequestedEvent(wrapper) && wrapper.event.data) {
        const { seconds } = wrapper.event.data() as SkipRequestedData;
        const el = videoRef.current;
        if (el) el.currentTime = Math.max(0, el.currentTime + seconds);
      } else if (isVolumeChangedEvent(wrapper) && wrapper.event.data) {
        const { volume } = wrapper.event.data() as VolumeChangedData;
        const el = videoRef.current;
        if (el) el.volume = volume;
      } else if (isFullscreenRequestedEvent(wrapper)) {
        void containerRef.current?.requestFullscreen();
      }
      return wrapper;
    },
    [handlePlay, handleResolutionChange]
  );

  const progressLabel =
    status === "loading" && jobProgress && jobProgress.totalSegments != null
      ? `Transcoding ${jobProgress.completedSegments}/${jobProgress.totalSegments}`
      : null;

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onMouseLeave={() => {
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
        setControlsVisible(false);
      }}
      style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}
    >
      <video
        ref={videoRef}
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
        controls={false}
      />

      {/* Pre-play overlay — shown in idle state */}
      {status === "idle" && (
        <div
          onClick={handlePlay}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            cursor: "pointer",
          }}
        >
          <button
            onClick={handlePlay}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(206,17,38,0.15)",
              border: "1.5px solid rgba(206,17,38,0.5)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              paddingLeft: 4,
              transition: "background 0.2s ease, border-color 0.2s ease, transform 0.15s ease",
            }}
            aria-label="Play"
            type="button"
          >
            <IconPlay size={32} />
          </button>
        </div>
      )}

      {/* Loading spinner overlay */}
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.12)",
              borderTopColor: "rgba(206,17,38,0.85)",
              animation: "spin 0.75s linear infinite",
            }}
          />
        </div>
      )}

      {/* Transcode progress label */}
      {progressLabel && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            background: "rgba(0,0,0,0.8)",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            color: "#aaa",
          }}
        >
          {progressLabel}
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            right: 16,
            background: "rgba(206,17,38,0.85)",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            color: "#fff",
          }}
        >
          {error}
        </div>
      )}

      <NovaEventingInterceptor interceptor={interceptor}>
        <ControlBar
          video={data}
          videoRef={videoRef}
          resolution={resolution}
          status={status}
          isVisible={controlsVisible}
        />
      </NovaEventingInterceptor>
    </div>
  );
};
