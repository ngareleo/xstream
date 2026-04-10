import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef } from "react";
import { ControlBar } from "./ControlBar.js";

/**
 * ControlBar is the playback UI: seek bar, play/pause button, time display,
 * title, and resolution badge selector.
 *
 * It reads live currentTime and isPlaying from a <video> element via useVideoSync.
 * In stories, we pass a null-ref so the bar shows its static/initial state.
 */
const meta: Meta<typeof ControlBar> = {
  title: "Components/ControlBar",
  component: ControlBar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => {
      const videoRef = useRef<HTMLVideoElement>(null);
      return (
        <div style={{ position: "relative", width: "100%", maxWidth: 960, background: "#000" }}>
          {/* Hidden video element so useVideoSync has a target */}
          <video ref={videoRef} style={{ display: "none" }} />
          <Story args={{ videoRef }} />
        </div>
      );
    },
  ],
  args: {
    title: "Mad Max: Fury Road (2015)",
    durationSeconds: 7200,
    resolution: "1080p",
    maxResolution: "4k",
    status: "playing",
    onPlay: () => {},
    onResolutionChange: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ControlBar>;

/** Default playing state — all resolutions up to 4K shown. */
export const Playing: Story = {};

/** Idle state before playback has started — play button shown, no loading spinner. */
export const Idle: Story = {
  args: { status: "idle" },
};

/** Loading state while the transcode job is starting. */
export const Loading: Story = {
  args: { status: "loading" },
};

/** Capped at 1080p — resolutions above are hidden. */
export const CappedAt1080p: Story = {
  args: { maxResolution: "1080p", resolution: "1080p" },
};

/** Capped at 720p — for lower-quality source files. */
export const CappedAt720p: Story = {
  args: { maxResolution: "720p", resolution: "720p" },
};

/** Long title that should be clamped to one line. */
export const LongTitle: Story = {
  args: {
    title: "One Battle After Another: The Extremely Long Director's Cut Extended Edition (2025)",
  },
};

/** Short video — 90 seconds. */
export const ShortVideo: Story = {
  args: { durationSeconds: 90 },
};
