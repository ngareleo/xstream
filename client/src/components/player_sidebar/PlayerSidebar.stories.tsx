import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { PlayerSidebar_video$key } from "~/relay/__generated__/PlayerSidebar_video.graphql.js";
import type { PlayerSidebarStoryQuery } from "~/relay/__generated__/PlayerSidebarStoryQuery.graphql.js";

import { PlayerSidebar } from "./PlayerSidebar.js";

const STORY_QUERY = graphql`
  query PlayerSidebarStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...PlayerSidebar_video
    }
  }
`;

interface WrapperProps {
  video: PlayerSidebar_video$key;
}

function PlayerSidebarWrapper({ video }: WrapperProps): JSX.Element {
  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0f" }}>
      <PlayerSidebar video={video} />
    </div>
  );
}

const meta: Meta<WrapperProps> = {
  title: "Components/PlayerSidebar",
  component: PlayerSidebarWrapper,
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mad Max: Fury Road (2015)")).toBeInTheDocument();
    await expect(canvas.getByText("4k")).toBeInTheDocument();
  },
};

export const LongTitle: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "One Battle After Another: The Director's Cut Extended Edition (2025)",
          durationSeconds: 10800,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
};

export const CappedAt1080p: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
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
