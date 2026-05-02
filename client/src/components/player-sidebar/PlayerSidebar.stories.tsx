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
// instance in the response tree, including Up Next nodes. We use context.path
// to distinguish the root video from nested Up Next nodes — no stateful
// counter needed, so the mock works correctly on re-renders.
const withMetadataResolvers = {
  Video: (context: { path?: readonly string[] }) => {
    const isUpNext = (context.path ?? []).includes("edges");
    if (!isUpNext) {
      return {
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
      };
    }
    // Up Next node — return a distinct id so the v.id !== data.id filter keeps it.
    // Relay fills in id from the mock resolver; we embed the path to make it unique.
    const pathKey = (context.path ?? []).join("_");
    return {
      id: `up-${pathKey}`,
      title: "Up Next Film",
      durationSeconds: 5400,
      metadata: { title: null, year: 2020, genre: "Action", plot: null, posterUrl: null },
      library: { videos: { edges: [] } },
      videoStream: { height: 1080, width: 1920 },
    };
  },
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
      mockResolvers: withMetadataResolvers,
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Lone Film")).toBeInTheDocument();
    await expect(canvas.getByText("Now Playing")).toBeInTheDocument();
    // Library has no other videos → Up Next section is hidden.
    await expect(canvas.queryByText("Up Next")).toBeNull();
  },
};

export const NoMetadata: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PlayerSidebarStoryQuery["response"]) => ["video", result.video],
      // Path-aware resolver — see WithMetadata for rationale. A static Video
      // resolver collapses every Up Next node to id "v-1", which the component
      // then filters out, hiding the section.
      mockResolvers: {
        Video: (context: { path?: readonly (string | number)[] }) => {
          const isUpNext = (context.path ?? []).includes("edges");
          if (!isUpNext) {
            return {
              id: "v-1",
              title: "unmatched.file.2024.mkv",
              durationSeconds: 3600,
              metadata: null,
              library: {
                videos: { edges: MOCK_UP_NEXT.map((v) => ({ node: v })) },
              },
              videoStream: { height: 1080, width: 1920 },
            };
          }
          const pathKey = (context.path ?? []).join("_");
          return {
            id: `up-${pathKey}`,
            title: "Up Next Film",
            durationSeconds: 5400,
            metadata: { title: null, year: 2020, genre: null, plot: null, posterUrl: null },
            library: { videos: { edges: [] } },
            videoStream: { height: 1080, width: 1920 },
          };
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // No OMDb metadata → falls back to filename.
    await expect(canvas.getByText("unmatched.file.2024.mkv")).toBeInTheDocument();
    await expect(canvas.getByText("Up Next")).toBeInTheDocument();
  },
};
