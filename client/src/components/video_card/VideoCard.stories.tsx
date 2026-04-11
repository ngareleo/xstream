import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { VideoCardStoryQuery } from "~/relay/__generated__/VideoCardStoryQuery.graphql.js";
import { withLayout } from "~/storybook/withLayout.js";

import { VideoCard } from "./VideoCard.js";

/**
 * VideoCard displays a clickable tile with the video title, duration, and
 * resolution badge. Stories use @imchhh/storybook-addon-relay to provide
 * a mock Relay environment without any boilerplate.
 */

const STORY_QUERY = graphql`
  query VideoCardStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...VideoCard_video
    }
  }
`;

const meta: Meta<typeof VideoCard> = {
  title: "Components/VideoCard",
  component: VideoCard,
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
  decorators: [withLayout({ width: 200 })],
};

export default meta;
type Story = StoryObj<typeof VideoCard>;

export const Movie4K: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mad Max: Fury Road (2015)")).toBeInTheDocument();
  },
};

export const Movie1080p: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoCardStoryQuery["response"]) => ["video", result.video],
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

export const NoStreamInfo: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
          videoStream: null,
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
      getReferenceEntry: (result: VideoCardStoryQuery["response"]) => ["video", result.video],
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

export const ShortDuration: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Short Film",
          durationSeconds: 300,
          videoStream: { height: 720 },
        }),
      },
    },
  },
};
