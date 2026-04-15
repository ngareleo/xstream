import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { useRef } from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { ControlBar_video$key } from "~/relay/__generated__/ControlBar_video.graphql.js";
import type { ControlBarStoryQuery } from "~/relay/__generated__/ControlBarStoryQuery.graphql.js";

import { ControlBar } from "./ControlBar.js";

/**
 * ControlBar is the playback UI: seek bar, play/pause, time display, title,
 * and resolution badges. It reads video metadata via a Relay fragment and live
 * state via useVideoSync.
 *
 * Stories use @imchhh/storybook-addon-relay to supply mock fragment data.
 * The addon injects the fragment key as the `video` prop automatically via
 * getReferenceEntry.
 *
 * NovaEventingProvider is required because ControlBar uses useNovaEventing()
 * internally to bubble play and resolution-change events instead of accepting
 * callback props.
 */

const STORY_QUERY = graphql`
  query ControlBarStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...ControlBar_video
    }
  }
`;

const noopEventing = {
  bubble: (_event: EventWrapper): Promise<void> => Promise.resolve(),
};

/**
 * Thin wrapper: receives the fragment key that the addon injects and renders
 * ControlBar inside a NovaEventingProvider with static playback props. This
 * lets us control `resolution` and `status` via Storybook args while Relay
 * provides the video data.
 */
interface WrapperProps {
  video: ControlBar_video$key;
  resolution: "240p" | "360p" | "480p" | "720p" | "1080p" | "4k";
  status: "idle" | "loading" | "playing";
}

function ControlBarWrapper({ video, resolution, status }: WrapperProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 960,
        background: "#000",
        minHeight: 80,
      }}
    >
      <video ref={videoRef} style={{ display: "none" }} />
      <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
        <ControlBar
          video={video}
          videoRef={videoRef}
          resolution={resolution}
          status={status}
          isVisible={true}
          isFullscreen={false}
        />
      </NovaEventingProvider>
    </div>
  );
}

const meta: Meta<WrapperProps> = {
  title: "Components/ControlBar",
  component: ControlBarWrapper,
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: ControlBarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
  args: {
    resolution: "1080p",
    status: "playing",
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Playing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /play|pause/i })).toBeInTheDocument();
    await expect(canvas.getByText(/0:00/)).toBeInTheDocument();
    await expect(canvas.getByText("Mad Max: Fury Road (2015)")).toBeInTheDocument();
  },
};

export const Idle: Story = { args: { status: "idle" } };

export const Loading: Story = { args: { status: "loading" } };

export const CappedAt1080p: Story = {
  args: { resolution: "1080p" },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: ControlBarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
          videoStream: { height: 1080 },
        }),
      },
    },
  },
};

export const CappedAt720p: Story = {
  args: { resolution: "720p" },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: ControlBarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
          videoStream: { height: 720 },
        }),
      },
    },
  },
};

export const LongTitle: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: ControlBarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "One Battle After Another: The Director's Cut Extended Edition (2025)",
          durationSeconds: 7200,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
};

export const ShortVideo: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: ControlBarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 90,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
};
