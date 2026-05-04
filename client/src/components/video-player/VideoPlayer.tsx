import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useFragment } from "react-relay";

import {
  isFullscreenRequestedEvent,
  isPlayRequestedEvent,
  isResolutionChangedEvent,
  isSeekRequestedEvent,
  isSkipRequestedEvent,
  isVolumeChangedEvent,
  type ResolutionChangedData,
  type SeekRequestedData,
  type SkipRequestedData,
  type VolumeChangedData,
} from "~/components/control-bar/ControlBar.events.js";
import { ControlBar } from "~/components/control-bar/ControlBar.js";
import { PlayerEndScreenAsync } from "~/components/player-end-screen/PlayerEndScreenAsync.js";
import type { JobProgress } from "~/hooks/useJobSubscription.js";
import { useJobSubscription } from "~/hooks/useJobSubscription.js";
import { useVideoPlayback } from "~/hooks/useVideoPlayback.js";
import type { VideoPlayer_video$key } from "~/relay/__generated__/VideoPlayer_video.graphql.js";
import type { Resolution } from "~/types.js";
import { maxResolutionForHeight } from "~/utils/formatters.js";

import { useVideoPlayerStyles } from "./VideoPlayer.styles.js";

const VIDEO_FRAGMENT = graphql`
  fragment VideoPlayer_video on Video {
    id
    durationSeconds
    videoStream {
      height
      width
    }
    ...ControlBar_video
    ...PlayerEndScreen_video
  }
`;

type PlayStatus = "idle" | "loading" | "playing";

interface Props {
  video: VideoPlayer_video$key;
  /**
   * Fired when the playback state machine transitions. The Player chrome
   * uses this to fade out the backdrop poster once real video frames start
   * arriving — without it, letterbox bars (`objectFit: contain`) expose
   * the dimmed backdrop during playback.
   */
  onStatusChange?: (status: PlayStatus) => void;
}

const HIDE_DELAY_MS = 3000;

export const VideoPlayer: FC<Props> = ({ video, onStatusChange }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const styles = useVideoPlayerStyles();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nativeMax = maxResolutionForHeight(data.videoStream?.height, data.videoStream?.width);
  const [resolution, setResolution] = useState<Resolution>(nativeMax);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null);
  /** Subscription-surfaced job failure (probe / encode / killed). Distinct from
   * the hook's `error` (mutation-side) so we can fail fast on the long-running
   * job dying instead of waiting for the 90s stream idle timeout. */
  const [jobError, setJobError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isEnded, setIsEnded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { status, error, startPlayback, prewarm, onTranscodeComplete, seekTo } = useVideoPlayback(
    videoRef,
    data.id,
    data.durationSeconds,
    setActiveJobId
  );

  // See docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md for prewarm strategy.
  useEffect(() => {
    prewarm(nativeMax);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data.id captured in hook's own ref
  }, [data.id]);

  useJobSubscription(activeJobId, (progress) => {
    setJobProgress(progress);
    if (progress.status === "COMPLETE" && activeJobId) {
      onTranscodeComplete(activeJobId);
    }
    if (progress.status === "ERROR") {
      const code = progress.errorCode ?? "INTERNAL";
      const detail = progress.error ?? "";
      const userMessage =
        code === "PROBE_FAILED"
          ? `This file could not be opened by ffprobe. ${detail}`
          : code === "ENCODE_FAILED"
            ? `Transcoding failed at every fallback tier. ${detail}`
            : `Playback stopped: ${detail || code}`;
      setJobError(userMessage);
    }
    if (progress.status === "COMPLETE" || progress.status === "ERROR") {
      setActiveJobId(null);
    }
  });

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

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onEnded = (): void => setIsEnded(true);
    el.addEventListener("ended", onEnded);
    return () => el.removeEventListener("ended", onEnded);
  }, [videoRef]);

  useEffect(() => {
    setIsEnded(false);
  }, [data.id]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    const onChange = (): void => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleResolutionChange = useCallback(
    (res: Resolution): void => {
      setResolution(res);
      if (status === "playing") startPlayback(res);
    },
    [status, startPlayback]
  );

  const handlePlay = useCallback((): void => {
    setIsEnded(false);
    startPlayback(resolution);
  }, [resolution, startPlayback]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code !== "Space") return;
      e.preventDefault();
      if (status === "idle") {
        handlePlay();
        return;
      }
      const el = videoRef.current;
      if (!el) return;
      if (el.paused) void el.play();
      else el.pause();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [status, handlePlay, videoRef]);

  const interceptor = useCallback(
    async (wrapper: EventWrapper, _forwardEvent: (e: EventWrapper) => Promise<void>) => {
      if (isPlayRequestedEvent(wrapper)) {
        handlePlay();
      } else if (isResolutionChangedEvent(wrapper) && wrapper.event.data) {
        const { resolution: res } = wrapper.event.data() as ResolutionChangedData;
        handleResolutionChange(res);
      } else if (isSeekRequestedEvent(wrapper) && wrapper.event.data) {
        const { targetSeconds } = wrapper.event.data() as SeekRequestedData;
        seekTo(targetSeconds);
      } else if (isSkipRequestedEvent(wrapper) && wrapper.event.data) {
        const { seconds } = wrapper.event.data() as SkipRequestedData;
        const el = videoRef.current;
        if (el) el.currentTime = Math.max(0, el.currentTime + seconds);
      } else if (isVolumeChangedEvent(wrapper) && wrapper.event.data) {
        const { volume } = wrapper.event.data() as VolumeChangedData;
        const el = videoRef.current;
        if (el) el.volume = volume;
      } else if (isFullscreenRequestedEvent(wrapper)) {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void containerRef.current?.requestFullscreen();
        }
      }
      return wrapper;
    },
    [handlePlay, handleResolutionChange, seekTo]
  );

  const progressLabel =
    status === "loading" && jobProgress && jobProgress.totalSegments != null
      ? `Transcoding ${jobProgress.completedSegments}/${jobProgress.totalSegments}`
      : null;

  return (
    <div
      ref={containerRef}
      className={styles.root}
      onMouseMove={showControls}
      onMouseEnter={showControls}
      onMouseLeave={() => {
        if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
        setControlsVisible(false);
      }}
    >
      <video
        ref={videoRef}
        className={styles.video}
        controls={false}
        onClick={() => {
          if (status !== "playing" || isEnded) return;
          const el = videoRef.current;
          if (!el) return;
          if (el.paused) void el.play();
          else el.pause();
        }}
      />

      {status === "idle" && !isEnded && (
        <button
          type="button"
          aria-label="Play"
          className={styles.idleOverlay}
          onClick={handlePlay}
        />
      )}

      {progressLabel && <div className={styles.progressLabel}>{progressLabel}</div>}

      {(error || jobError) && <div className={styles.errorOverlay}>{error ?? jobError}</div>}

      {isEnded && (
        <Suspense fallback={null}>
          <PlayerEndScreenAsync video={data} />
        </Suspense>
      )}

      <NovaEventingInterceptor interceptor={interceptor}>
        <ControlBar
          video={data}
          videoRef={videoRef}
          resolution={resolution}
          status={status}
          isVisible={(controlsVisible || status === "loading") && !isEnded}
          isFullscreen={isFullscreen}
        />
      </NovaEventingInterceptor>
    </div>
  );
};
