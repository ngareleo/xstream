import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { ProfileRow_library$key } from "~/relay/__generated__/ProfileRow_library.graphql";
import type { ProfileRowStoryQuery } from "~/relay/__generated__/ProfileRowStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { ProfileRow } from "./ProfileRow.js";

const STORY_QUERY = graphql`
  query ProfileRowStoryQuery($id: ID!) @relay_test_operation {
    node(id: $id) {
      ... on Library {
        ...ProfileRow_library
      }
    }
  }
`;

interface WrapperProps {
  library: ProfileRow_library$key;
  expanded: boolean;
  scanning?: boolean;
  scanProgress?: { done: number; total: number } | null;
}

const ProfileRowWrapper = ({
  library,
  expanded,
  scanning,
  scanProgress,
}: WrapperProps): JSX.Element => (
  <div style={{ width: 720, background: "#050706" }}>
    <ProfileRow
      library={library}
      expanded={expanded}
      onToggle={() => undefined}
      scanning={scanning}
      scanProgress={scanProgress}
    />
  </div>
);

const meta: Meta<WrapperProps> = {
  title: "Components/ProfileRow",
  component: ProfileRowWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { id: "Library:lib-1" },
      getReferenceEntry: (result: ProfileRowStoryQuery["response"]) => ["library", result.node],
      mockResolvers: {
        Library: () => ({
          name: "Films / 4K UHD",
          path: "/media/films/4k",
          stats: {
            totalCount: 142,
            matchedCount: 138,
            unmatchedCount: 4,
            totalSizeBytes: 5_280_000_000_000,
          },
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Collapsed: Story = { args: { expanded: false } };
export const Expanded: Story = { args: { expanded: true } };
export const Scanning: Story = {
  args: { expanded: false, scanning: true, scanProgress: { done: 87, total: 142 } },
};
