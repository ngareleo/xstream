import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { ProfileRow_library$key } from "~/relay/__generated__/ProfileRow_library.graphql.js";
import type { ProfileRowStoryQuery } from "~/relay/__generated__/ProfileRowStoryQuery.graphql.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";
import { withRelay } from "~/storybook/withRelay.js";

import { ProfileRow } from "./ProfileRow.js";

const STORY_QUERY = graphql`
  query ProfileRowStoryQuery @relay_test_operation {
    libraries {
      ...ProfileRow_library
    }
  }
`;

interface WrapperProps {
  library: ProfileRow_library$key;
  expanded?: boolean;
  selected?: boolean;
  scanning?: boolean;
  scanProgress?: { done: number; total: number } | null;
}

const ProfileRowWrapper = ({
  library,
  expanded = false,
  selected = false,
  scanning = false,
  scanProgress = null,
}: WrapperProps): JSX.Element => (
  <div style={{ width: 800, background: "#0f0f0f" }}>
    <ProfileRow
      library={library}
      expanded={expanded}
      selected={selected}
      scanning={scanning}
      scanProgress={scanProgress}
    />
  </div>
);

const BASE_RESOLVERS = {
  Library: () => ({
    id: "lib-1",
    name: "4K Movies",
    path: "/media/movies",
    mediaType: "MOVIES",
    stats: {
      totalCount: 142,
      matchedCount: 138,
      unmatchedCount: 4,
      totalSizeBytes: 4_300_000_000_000,
    },
    videos: { edges: [] },
  }),
};

const meta: Meta<WrapperProps> = {
  title: "Components/ProfileRow",
  component: ProfileRowWrapper,
  decorators: [withNovaEventing, withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: {},
      getReferenceEntry: (result: ProfileRowStoryQuery["response"]) => [
        "library",
        result.libraries[0],
      ],
      mockResolvers: BASE_RESOLVERS,
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("4K Movies")).toBeInTheDocument();
    await expect(canvas.getByText("142 films")).toBeInTheDocument();
  },
};

export const Expanded: Story = { args: { expanded: true } };

export const Selected: Story = { args: { selected: true } };

export const Scanning: Story = {
  args: { scanning: true, scanProgress: { done: 47, total: 142 } },
};

export const AllMatched: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: {},
      getReferenceEntry: (result: ProfileRowStoryQuery["response"]) => [
        "library",
        result.libraries[0],
      ],
      mockResolvers: {
        Library: () => ({
          id: "lib-2",
          name: "TV Shows",
          path: "/media/tv",
          mediaType: "TV_SHOWS",
          stats: {
            totalCount: 500,
            matchedCount: 500,
            unmatchedCount: 0,
            totalSizeBytes: 2_100_000_000_000,
          },
          videos: { edges: [] },
        }),
      },
    },
  },
};

export const HasUnmatched: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: {},
      getReferenceEntry: (result: ProfileRowStoryQuery["response"]) => [
        "library",
        result.libraries[0],
      ],
      mockResolvers: {
        Library: () => ({
          id: "lib-3",
          name: "Mixed",
          path: "/media/mixed",
          mediaType: "MOVIES",
          stats: {
            totalCount: 80,
            matchedCount: 55,
            unmatchedCount: 25,
            totalSizeBytes: 800_000_000_000,
          },
          videos: { edges: [] },
        }),
      },
    },
  },
};
