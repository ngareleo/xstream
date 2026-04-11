import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { ProfilesSidebarStoryQuery } from "~/relay/__generated__/ProfilesSidebarStoryQuery.graphql.js";
import { withLayout } from "~/storybook/withLayout.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { ProfilesSidebar } from "./ProfilesSidebar.js";

/**
 * ProfilesSidebar shows library nav cards in the left pane of the Profiles page.
 * Clicking a card bubbles a LibrarySelected Nova event.
 */

const STORY_QUERY = graphql`
  query ProfilesSidebarStoryQuery($libraryId: ID!) @relay_test_operation {
    node(id: $libraryId) {
      ... on Library {
        ...ProfilesSidebar_library
      }
    }
  }
`;

const meta: Meta<typeof ProfilesSidebar> = {
  title: "Components/ProfilesSidebar",
  component: ProfilesSidebar,
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: ProfilesSidebarStoryQuery["response"]) => [
        "libraries",
        result.node ? [result.node] : [],
      ],
      mockResolvers: {
        Library: () => ({
          name: "Movies Collection",
          mediaType: "MOVIES",
          videos: { totalCount: 24 },
        }),
      },
    },
  },
  decorators: [withNovaEventing, withLayout({ width: 260 })],
};

export default meta;
type Story = StoryObj<typeof ProfilesSidebar>;

export const NoneSelected: Story = {
  args: { selectedLibraryId: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Movies Collection")).toBeInTheDocument();
  },
};

export const FirstSelected: Story = {
  args: { selectedLibraryId: "Library:mock" },
};

export const TvShows: Story = {
  args: { selectedLibraryId: null },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: ProfilesSidebarStoryQuery["response"]) => [
        "libraries",
        result.node ? [result.node] : [],
      ],
      mockResolvers: {
        Library: () => ({
          name: "TV Shows",
          mediaType: "TV_SHOWS",
          videos: { totalCount: 18 },
        }),
      },
    },
  },
};
