import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { MediaListStoryQuery } from "../relay/__generated__/MediaListStoryQuery.graphql.js";
import { MediaList } from "./MediaList.js";

/**
 * MediaList shows the video list/grid for the selected library profile.
 * Clicking a row bubbles VideoSelected; clicking the play button bubbles VideoPlay.
 */

const noopEventing = { bubble: (_e: EventWrapper): Promise<void> => Promise.resolve() };

const STORY_QUERY = graphql`
  query MediaListStoryQuery($libraryId: ID!) @relay_test_operation {
    node(id: $libraryId) {
      ... on Library {
        ...MediaList_library
      }
    }
  }
`;

function makeEdges(count: number): object[] {
  return Array.from({ length: count }, (_, i) => ({
    node: {
      id: `Video:mock-${i}`,
      title: `Video Title ${i + 1}`,
      durationSeconds: 5400 + i * 600,
      fileSizeBytes: (3.5 + i * 0.4) * 1e9,
      videoStream: { height: i % 3 === 0 ? 2160 : 1080 },
    },
  }));
}

const meta: Meta<typeof MediaList> = {
  title: "Components/MediaList",
  component: MediaList,
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: MediaListStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({
          name: "Movies Collection",
          videos: { totalCount: 6, edges: makeEdges(6) },
        }),
      },
    },
  },
  decorators: [
    (Story) => (
      <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
        <div style={{ display: "flex", height: "100vh", background: "#0a0a0a" }}>
          <Story />
        </div>
      </NovaEventingProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MediaList>;

export const Default: Story = {
  args: { selectedVideoId: null },
};

export const WithSelection: Story = {
  args: { selectedVideoId: "Video:mock-2" },
};

export const Empty: Story = {
  args: { selectedVideoId: null },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: MediaListStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({ name: "Movies Collection", videos: { totalCount: 0, edges: [] } }),
      },
    },
  },
};
