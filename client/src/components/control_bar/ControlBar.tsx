import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent, type RefObject, useState } from "react";
import { graphql, useFragment } from "react-relay";

import { useVideoSync } from "~/hooks/useVideoSync.js";
import type { ControlBar_video$key } from "~/relay/__generated__/ControlBar_video.graphql.js";
import type { Resolution } from "~/types.js";
import { ALL_RESOLUTIONS, RESOLUTION_ORDER } from "~/types.js";
import { formatDuration, maxResolutionForHeight } from "~/utils/formatters.js";

import {
  createFullscreenRequestedEvent,
  createPlayRequestedEvent,
  createResolutionChangedEvent,
  createSkipRequestedEvent,
  createVolumeChangedEvent,
} from "./ControlBar.events.js";

const VIDEO_FRAGMENT = graphql`
  fragment ControlBar_video on Video {
    title
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
  /** Controls visibility for the auto-hide overlay behaviour. */
  isVisible: boolean;
}

const BTN: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "white",
  cursor: "pointer",
  padding: "6px 8px",
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  lineHeight: 1,
};

export const ControlBar: FC<Props> = ({ video, videoRef, resolution, status, isVisible }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
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
    const el = videoRef.current;
    if (!el || !data.durationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = fraction * data.durationSeconds;
  };

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

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
        padding: "40px 16px 16px",
        opacity: isVisible ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      {/* Progress bar */}
      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={data.durationSeconds}
        aria-valuenow={currentTime}
        tabIndex={0}
        onClick={handleSeek}
        style={{
          position: "relative",
          height: 6,
          background: "rgba(255,255,255,0.25)",
          borderRadius: 3,
          cursor: "pointer",
          marginBottom: 12,
          transition: "height 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.height = "10px";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.height = "6px";
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${progressPct}%`,
            background: "#d4a84b",
            borderRadius: 3,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Play/Pause */}
          <button style={BTN} aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlayPause}>
            {status === "loading" ? "⏳" : isPlaying ? "⏸" : "▶"}
          </button>

          {/* Skip −10s */}
          <button style={BTN} aria-label="Rewind 10 seconds" onClick={handleSkip(-10)}>
            ⏮ 10
          </button>

          {/* Skip +10s */}
          <button style={BTN} aria-label="Forward 10 seconds" onClick={handleSkip(10)}>
            10 ⏭
          </button>

          {/* Volume */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 4 }}
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button style={BTN} aria-label="Volume">
              🔊
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              defaultValue={1}
              onChange={handleVolumeChange}
              style={{
                width: showVolumeSlider ? 72 : 0,
                opacity: showVolumeSlider ? 1 : 0,
                transition: "width 0.2s, opacity 0.2s",
                cursor: "pointer",
                accentColor: "#d4a84b",
              }}
              aria-label="Volume level"
            />
          </div>

          {/* Time */}
          <span
            style={{
              color: "#aaa",
              fontSize: 13,
              marginLeft: 4,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatDuration(currentTime)} / {formatDuration(data.durationSeconds)}
          </span>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
          {/* Title */}
          <span
            style={{
              color: "white",
              fontSize: 13,
              fontWeight: 500,
              maxWidth: 280,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginRight: 8,
            }}
          >
            {data.title}
          </span>

          {/* Resolution dropdown */}
          <div style={{ position: "relative" }}>
            <button
              style={{
                ...BTN,
                fontSize: 13,
                padding: "4px 10px",
                background: "rgba(255,255,255,0.15)",
                borderRadius: 4,
              }}
              onClick={() => setResMenuOpen((o) => !o)}
              aria-label={`Resolution: ${resolution}`}
            >
              {resolution}
            </button>
            {resMenuOpen && (
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  right: 0,
                  background: "#1a1a2e",
                  border: "1px solid #2a2a40",
                  borderRadius: 8,
                  overflow: "hidden",
                  minWidth: 100,
                  zIndex: 100,
                }}
              >
                {availableResolutions.map((r) => (
                  <button
                    key={r}
                    style={{
                      ...BTN,
                      width: "100%",
                      justifyContent: "flex-start",
                      fontSize: 13,
                      padding: "8px 14px",
                      color: r === resolution ? "#d4a84b" : "white",
                      background: r === resolution ? "rgba(212,168,75,0.1)" : "transparent",
                      borderRadius: 0,
                    }}
                    onClick={(e) => handleResolutionClick(e, r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen */}
          <button style={BTN} aria-label="Fullscreen" onClick={handleFullscreen}>
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
};
