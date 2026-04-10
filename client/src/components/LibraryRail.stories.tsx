import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { LibraryRailStoryQuery } from "../relay/__generated__/LibraryRailStoryQuery.graphql.js";
import { LibraryRail } from "./LibraryRail.js";

/**
 * LibraryRail renders a narrow icon-rail sidebar for library selection.
 * Clicking an icon bubbles a LibraryRailSelected Nova event.
 */

const noopEventing = { bubble: (_e: EventWrapper): Promise<void> => Promise.resolve() };

const STORY_QUERY = graphql`
  query LibraryRailStoryQuery($libraryId: ID!) @relay_test_operation {
    node(id: $libraryId) {
      ... on Library {
        ...LibraryRail_library
      }
    }
  }
`;

const meta: Meta<typeof LibraryRail> = {
  title: "Components/LibraryRail",
  component: LibraryRail,
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: LibraryRailStoryQuery["response"]) => [
        "libraries",
        [result.node],
      ],
      mockResolvers: {
        Library: () => ({ name: "Movies", mediaType: "MOVIES" }),
      },
    },
  },
  decorators: [
    (Story) => (
      <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
        <div style={{ height: 400, display: "flex" }}>
          <Story />
        </div>
      </NovaEventingProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LibraryRail>;

export const NoneSelected: Story = {
  args: { selectedLibraryId: null },
};

export const MoviesSelected: Story = {
  args: { selectedLibraryId: "Library:mock" },
};

export const MultipleLibraries: Story = {
  args: { selectedLibraryId: null },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { libraryId: "Library:mock" },
      getReferenceEntry: (result: LibraryRailStoryQuery["response"]) => [
        "libraries",
        [result.node, result.node],
      ],
      mockResolvers: {
        Library: () => ({ name: "Movies", mediaType: "MOVIES" }),
      },
    },
  },
};
