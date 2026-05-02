import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { FilmTile } from "~/components/film-tile/FilmTile";
import type { PosterRowStoryQuery } from "~/relay/__generated__/PosterRowStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { PosterRow } from "./PosterRow.js";

const STORY_QUERY = graphql`
  query PosterRowStoryQuery @relay_test_operation {
    videos(first: 12) {
      edges {
        node {
          id
          ...FilmTile_video
        }
      }
    }
  }
`;

interface WrapperProps {
  data: PosterRowStoryQuery["response"];
  title: string;
  count: number;
}

const PosterRowWrapper = ({ data, title, count }: WrapperProps): JSX.Element => (
  <PosterRow title={title}>
    {data.videos.edges.slice(0, count).map((edge) => (
      <FilmTile key={edge.node.id} video={edge.node} onClick={() => {}} />
    ))}
  </PosterRow>
);

const meta: Meta<WrapperProps> = {
  title: "Components/PosterRow",
  component: PosterRowWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "padded",
    relay: {
      query: STORY_QUERY,
      getReferenceEntry: (result: PosterRowStoryQuery["response"]) => ["data", result],
      mockResolvers: {
        VideoConnection: () => ({
          edges: Array.from({ length: 12 }, (_, i) => ({
            node: {
              id: `mock-${i + 1}`,
              title: `Film ${i + 1}`,
              filename: `film-${i + 1}.mkv`,
              mediaType: i % 3 === 0 ? "TV_SHOWS" : "MOVIES",
              durationSeconds: 6000 + i * 60,
              metadata: {
                year: 2000 + i,
                posterUrl: `https://picsum.photos/seed/poster${i + 1}/200/300`,
              },
            },
          })),
        }),
      },
    },
  },
  args: { title: "New releases", count: 3 },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Few: Story = { args: { title: "New releases", count: 3 } };
export const Overflowing: Story = { args: { title: "Continue watching", count: 12 } };
export const Empty: Story = { args: { title: "Watchlist", count: 0 } };
