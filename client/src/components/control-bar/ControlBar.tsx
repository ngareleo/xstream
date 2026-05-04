import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent, type RefObject, useState } from "react";
import { graphql, useFragment } from "react-relay";

import { useVideoSync } from "~/hooks/useVideoSync.js";
import { IconArrowsIn, IconArrowsOut, IconPause, IconPlay, IconSpeaker } from "~/lib/icons.js";
import type { ControlBar_video$key } from "~/relay/__generated__/ControlBar_video.graphql.js";
import type { Resolution } from "~/types.js";
import { ALL_RESOLUTIONS, RESOLUTION_ORDER } from "~/types.js";
import { formatDuration, maxResolutionForHeight } from "~/utils/formatters.js";

import {
  createFullscreenRequestedEvent,
  createPlayRequestedEvent,
  createResolutionChangedEvent,
  createSeekRequestedEvent,
  createSkipRequestedEvent,
  createVolumeChangedEvent,
} from "./ControlBar.events.js";
import { useControlBarStyles } from "./ControlBar.styles.js";

const VIDEO_FRAGMENT = graphql`
  fragment ControlBar_video on Video {
    durationSeconds
    videoStream {
      height
      width
    }
  }
`;

interface Props {
  video: ControlBar_video$key;
  videoRef: RefObject<HTMLVideoElement | null>;
  resolution: Resolution;
  status: "idle" | "loading" | "playing";
  isVisible: boolean;
  isFullscreen: boolean;
}

export const ControlBar: FC<Props> = ({
  video,
  videoRef,
  resolution,
  status,
  isVisible,
  isFullscreen,
}) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const styles = useControlBarStyles();
  const { currentTime, isPlaying } = useVideoSync(videoRef);
  const { bubble } = useNovaEventing();

  const [resMenuOpen, setResMenuOpen] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const maxResolution = maxResolutionForHeight(data.videoStream?.height, data.videoStream?.width);
  const availableResolutions = ALL_RESOLUTIONS.filter(
    (r) => RESOLUTION_ORDER[r] <= RESOLUTION_ORDER[maxResolution]
  );

  const togglePlayPause = (reactEvent: MouseEvent): void => {
    const el = videoRef.current;
    if (!el) return;
    if (status === "idle") {
      void bubble({ reactEvent, event: createPlayRequestedEvent() });
      return;
    }
    if (el.paused) void el.play();
    else el.pause();
  };

  const handleSeek = (e: MouseEvent<HTMLDivElement>): void => {
    if (!data.durationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSeconds = fraction * data.durationSeconds;
    // Fire Nova event to preserve unclamped position before browser clamps currentTime.
    void bubble({ reactEvent: e, event: createSeekRequestedEvent(targetSeconds) });
  };

  // Hover tooltip: same x→seconds math as handleSeek to keep tooltip/click in sync.
  const [hoverPx, setHoverPx] = useState<number | null>(null);
  const [hoverSeconds, setHoverSeconds] = useState<number>(0);
  const handleSeekHover = (e: MouseEvent<HTMLDivElement>): void => {
    if (!data.durationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const fraction = x / rect.width;
    setHoverPx(x);
    setHoverSeconds(fraction * data.durationSeconds);
  };
  const handleSeekHoverEnd = (): void => setHoverPx(null);

  const handleSkip =
    (seconds: number) =>
    (reactEvent: MouseEvent): void => {
      void bubble({ reactEvent, event: createSkipRequestedEvent(seconds) });
    };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    void bubble({
      reactEvent: e as unknown as MouseEvent,
      event: createVolumeChangedEvent(parseFloat(e.target.value)),
    });
  };

  const handleResolutionClick = (reactEvent: MouseEvent, r: Resolution): void => {
    void bubble({ reactEvent, event: createResolutionChangedEvent(r) });
    setResMenuOpen(false);
  };

  const handleFullscreen = (reactEvent: MouseEvent): void => {
    void bubble({ reactEvent, event: createFullscreenRequestedEvent() });
  };

  const progressPct = data.durationSeconds > 0 ? (currentTime / data.durationSeconds) * 100 : 0;

  const playIcon =
    status === "loading" ? (
      <div className={styles.loadingSpinner} />
    ) : isPlaying ? (
      <IconPause size={20} />
    ) : (
      <IconPlay size={20} />
    );

  return (
    <div className={mergeClasses(styles.root, !isVisible && styles.rootHidden)}>
      <div className={styles.progressRow}>
        <span className={styles.timeLabel}>{formatDuration(currentTime)}</span>
        <div
          className={styles.track}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={data.durationSeconds}
          aria-valuenow={currentTime}
          tabIndex={0}
          onClick={handleSeek}
          onMouseMove={handleSeekHover}
          onMouseLeave={handleSeekHoverEnd}
        >
          <div className={styles.trackFill} style={{ width: `${progressPct}%` }} />
          <div className={styles.trackKnob} style={{ left: `${progressPct}%` }} />
          {hoverPx !== null && (
            <div className={styles.trackTooltip} style={{ left: `${hoverPx}px` }}>
              {formatDuration(hoverSeconds)}
            </div>
          )}
        </div>
        <span className={styles.timeLabelDim}>{formatDuration(data.durationSeconds)}</span>
      </div>

      <div className={styles.controlsRow}>
        <button className={styles.ctrlBtn} aria-label="Rewind 10 seconds" onClick={handleSkip(-10)}>
          −10s
        </button>
        <button
          className={mergeClasses(
            styles.ctrlBtn,
            styles.ctrlBtnPlay,
            status === "idle" && styles.ctrlBtnPlayIdle
          )}
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={togglePlayPause}
        >
          {playIcon}
        </button>
        <button className={styles.ctrlBtn} aria-label="Forward 10 seconds" onClick={handleSkip(10)}>
          +10s
        </button>

        <span className={styles.flexFill} />

        <div
          className={styles.volumeGroup}
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <IconSpeaker size={18} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            defaultValue={1}
            onChange={handleVolumeChange}
            className={styles.volumeSlider}
            style={{
              width: showVolumeSlider ? 80 : 0,
              opacity: showVolumeSlider ? 1 : 0,
            }}
            aria-label="Volume level"
          />
        </div>

        <div className={styles.resWrapper}>
          <button
            className={styles.resChip}
            onClick={() => setResMenuOpen((o) => !o)}
            aria-label={`Resolution: ${resolution}`}
          >
            {resolution}
          </button>
          {resMenuOpen && (
            <div className={styles.resMenu}>
              {availableResolutions.map((r) => (
                <button
                  key={r}
                  className={mergeClasses(styles.resItem, r === resolution && styles.resItemActive)}
                  onClick={(e) => handleResolutionClick(e, r)}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={styles.ctrlBtn}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={handleFullscreen}
        >
          {isFullscreen ? <IconArrowsIn size={18} /> : <IconArrowsOut size={18} />}
        </button>
      </div>
    </div>
  );
};
