import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { MediaGridItemStoryQuery } from "../relay/__generated__/MediaGridItemStoryQuery.graphql.js";
import { MediaGridItem } from "./MediaGridItem.js";

/**
 * MediaGridItem is a card in the grid view. Clicking the card bubbles a
 * VideoSelected Nova event; clicking the play overlay bubbles VideoPlay.
 */

const noopEventing = { bubble: (_e: EventWrapper): Promise<void> => Promise.resolve() };

const STORY_QUERY = graphql`
  query MediaGridItemStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...MediaGridItem_video
    }
  }
`;

const meta: Meta<typeof MediaGridItem> = {
  title: "Components/MediaGridItem",
  component: MediaGridItem,
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: MediaGridItemStoryQuery["response"]) => ["video", result.video],
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
  decorators: [
    (Story) => (
      <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
        <div style={{ width: 240 }}>
          <Story />
        </div>
      </NovaEventingProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MediaGridItem>;

export const Movie4K: Story = {};

export const Movie1080p: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: MediaGridItemStoryQuery["response"]) => ["video", result.video],
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
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: MediaGridItemStoryQuery["response"]) => ["video", result.video],
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
