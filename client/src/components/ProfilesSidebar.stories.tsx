import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { ProfilesSidebarStoryQuery } from "../relay/__generated__/ProfilesSidebarStoryQuery.graphql.js";
import { ProfilesSidebar } from "./ProfilesSidebar.js";

/**
 * ProfilesSidebar shows library nav cards in the left pane of the Profiles page.
 * Clicking a card bubbles a LibrarySelected Nova event.
 */

const noopEventing = { bubble: (_e: EventWrapper): Promise<void> => Promise.resolve() };

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
  decorators: [
    (Story) => (
      <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
        <div style={{ width: 260 }}>
          <Story />
        </div>
      </NovaEventingProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProfilesSidebar>;

export const NoneSelected: Story = {
  args: { selectedLibraryId: null },
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
