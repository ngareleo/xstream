import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { MediaListItemStoryQuery } from "~/relay/__generated__/MediaListItemStoryQuery.graphql.js";
import { withLayout } from "~/storybook/withLayout.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { MediaListItem } from "./MediaListItem.js";

/**
 * MediaListItem is a single row in the media list view. Clicking the row
 * bubbles a VideoSelected Nova event; clicking the play button bubbles VideoPlay.
 */

const STORY_QUERY = graphql`
  query MediaListItemStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...MediaListItem_video
    }
  }
`;

const meta: Meta<typeof MediaListItem> = {
  title: "Components/MediaListItem",
  component: MediaListItem,
  parameters: {
    layout: "padded",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: MediaListItemStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Interstellar",
          durationSeconds: 10164,
          fileSizeBytes: 8.1e9,
          videoStream: { height: 2160 },
        }),
      },
    },
  },
  decorators: [withNovaEventing, withLayout({ maxWidth: 800 })],
};

export default meta;
type Story = StoryObj<typeof MediaListItem>;

export const Default4K: Story = {
  args: { isSelected: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Interstellar")).toBeInTheDocument();
  },
};

export const Selected: Story = {
  args: { isSelected: true },
};

export const Movie1080p: Story = {
  args: { isSelected: false },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: MediaListItemStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "The Dark Knight",
          durationSeconds: 9150,
          fileSizeBytes: 3.5e9,
          videoStream: { height: 1080 },
        }),
      },
    },
  },
};

export const NoStreamInfo: Story = {
  args: { isSelected: false },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: MediaListItemStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Unknown File",
          durationSeconds: 3600,
          fileSizeBytes: 1.2e9,
          videoStream: null,
        }),
      },
    },
  },
};
