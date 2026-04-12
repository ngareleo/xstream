import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { PlayerSidebar_video$key } from "~/relay/__generated__/PlayerSidebar_video.graphql.js";
import type { PlayerSidebarStoryQuery } from "~/relay/__generated__/PlayerSidebarStoryQuery.graphql.js";
import { withRelay } from "~/storybook/withRelay.js";

import { PlayerSidebar } from "./PlayerSidebar.js";

const STORY_QUERY = graphql`
  query PlayerSidebarStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...PlayerSidebar_video
    }
  }
`;

interface WrapperProps {
  video: PlayerSidebar_video$key;
}

const PlayerSidebarWrapper = ({ video }: WrapperProps): JSX.Element => (
  <div style={{ display: "flex", height: "100vh", background: "#0a0a0f" }}>
    <PlayerSidebar video={video} />
  </div>
);

const MOCK_UP_NEXT = [
  { id: "v-2", title: "Fury Road Revisited", metadata: { year: 2015, posterUrl: null } },
  { id: "v-3", title: "Mad Max Beyond Thunderdome", metadata: { year: 1985, posterUrl: null } },
  { id: "v-4", title: "The Road Warrior", metadata: { year: 1981, posterUrl: null } },
];

// Relay's MockPayloadGenerator applies the Video resolver to every Video
// instance in the response tree, including Up Next nodes. A stateful counter
// lets us return distinct IDs so the `v.id !== data.id` filter in
// PlayerSidebar doesn't remove all Up Next items.
const makeWithMetadataResolvers = (): Record<string, unknown> => {
  const responses = [
    {
      id: "v-1",
      title: "mad.max.fury.road.2015.4k.mkv",
      durationSeconds: 7200,
      metadata: {
        title: "Mad Max: Fury Road",
        year: 2015,
        genre: "Action, Adventure",
        plot: "In a post-apocalyptic wasteland, Max teams up with Furiosa to outrun a warlord in a desperate bid for freedom.",
        posterUrl: null,
      },
      library: { videos: { edges: MOCK_UP_NEXT.map((v) => ({ node: v })) } },
      videoStream: { height: 2160, width: 3840 },
    },
    ...MOCK_UP_NEXT.map((v) => ({
      ...v,
      durationSeconds: 5400,
      metadata: { ...v.metadata, genre: "Action", plot: null },
      library: { videos: { edges: [] } },
      videoStream: { height: 1080, width: 1920 },
    })),
  ];
  let i = 0;
  return { Video: () => responses[i++] ?? responses[0] };
};

const meta: Meta<WrapperProps> = {
  title: "Components/PlayerSidebar",
  component: PlayerSidebarWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: makeWithMetadataResolvers(),
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const WithMetadata: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mad Max: Fury Road")).toBeInTheDocument();
    await expect(canvas.getByText("Now Playing")).toBeInTheDocument();
    await expect(canvas.getByText("Up Next")).toBeInTheDocument();
  },
};

export const NoUpNext: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "v-1",
          title: "lone.film.mkv",
          durationSeconds: 5400,
          metadata: {
            title: "Lone Film",
            year: 2020,
            genre: "Drama",
            plot: "A standalone film with no companions in the library.",
            posterUrl: null,
          },
          library: { videos: { edges: [] } },
          videoStream: { height: 1080, width: 1920 },
        }),
      },
    },
  },
};

export const NoMetadata: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "v-1",
          title: "unmatched.file.2024.mkv",
          durationSeconds: 3600,
          metadata: null,
          library: {
            videos: { edges: MOCK_UP_NEXT.map((v) => ({ node: v })) },
          },
          videoStream: { height: 1080, width: 1920 },
        }),
      },
    },
  },
};
