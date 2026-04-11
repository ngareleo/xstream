import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { LibraryGridStoryQuery } from "~/relay/__generated__/LibraryGridStoryQuery.graphql.js";
import { withLayout } from "~/storybook/withLayout.js";

import { LibraryGrid } from "./LibraryGrid.js";

/**
 * LibraryGrid renders a responsive grid of VideoCards for a single library.
 * Stories use @imchhh/storybook-addon-relay to provide mock data without
 * needing a live server.
 */

const STORY_QUERY = graphql`
  query LibraryGridStoryQuery($libraryId: ID!) @relay_test_operation {
    node(id: $libraryId) {
      ... on Library {
        ...LibraryGrid_library
      }
    }
  }
`;

function makeVideoEdges(count: number): object[] {
  return Array.from({ length: count }, (_, i) => ({
    node: {
      id: `Video:mock-${i}`,
      title: `Video Title ${i + 1}`,
      durationSeconds: 3600 + i * 300,
      videoStream: { height: i % 3 === 0 ? 2160 : 1080 },
    },
  }));
}

const meta: Meta<typeof LibraryGrid> = {
  title: "Components/LibraryGrid",
  component: LibraryGrid,
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: LibraryGridStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({ videos: { edges: makeVideoEdges(12) } }),
      },
    },
  },
  decorators: [withLayout({ padding: 16 })],
};

export default meta;
type Story = StoryObj<typeof LibraryGrid>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Video Title 1")).toBeInTheDocument();
  },
};

export const SingleVideo: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: LibraryGridStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({ videos: { edges: makeVideoEdges(1) } }),
      },
    },
  },
};

export const ManyVideos: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: LibraryGridStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({ videos: { edges: makeVideoEdges(48) } }),
      },
    },
  },
};

export const Empty: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: LibraryGridStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({ videos: { edges: [] } }),
      },
    },
  },
};
