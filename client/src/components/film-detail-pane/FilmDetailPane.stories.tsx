import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { FilmDetailPane_video$key } from "~/relay/__generated__/FilmDetailPane_video.graphql.js";
import type { FilmDetailPaneStoryQuery } from "~/relay/__generated__/FilmDetailPaneStoryQuery.graphql.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";
import { withRelay } from "~/storybook/withRelay.js";

import { FilmDetailPane } from "./FilmDetailPane.js";

const STORY_QUERY = graphql`
  query FilmDetailPaneStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...FilmDetailPane_video
    }
  }
`;

interface WrapperProps {
  video: FilmDetailPane_video$key;
}

const FilmDetailPaneWrapper = ({ video }: WrapperProps): JSX.Element => (
  <div style={{ width: 360, height: 600, background: "#0f0f0f", overflow: "hidden" }}>
    <FilmDetailPane video={video} />
  </div>
);

const meta: Meta<WrapperProps> = {
  title: "Components/FilmDetailPane",
  component: FilmDetailPaneWrapper,
  decorators: [withNovaEventing, withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: FilmDetailPaneStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-1",
          title: "mad.max.fury.road.2015.4k.mkv",
          filename: "mad.max.fury.road.2015.4k.mkv",
          durationSeconds: 7200,
          fileSizeBytes: 58_000_000_000,
          bitrate: 180_000_000,
          matched: true,
          mediaType: "MOVIES",
          metadata: {
            imdbId: "tt1392190",
            title: "Mad Max: Fury Road",
            year: 2015,
            genre: "Action, Adventure, Sci-Fi",
            director: "George Miller",
            cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"],
            rating: 8.1,
            plot: "In a post-apocalyptic wasteland, Max teams up with a mysterious woman, Furiosa, to outrun a warlord and his army in a desperate bid for freedom.",
            posterUrl: null,
          },
          videoStream: { codec: "hevc", width: 3840, height: 2160, fps: 24 },
          audioStream: { codec: "truehd", channels: 8, sampleRate: 48000 },
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const FullMetadata: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mad Max: Fury Road")).toBeInTheDocument();
    await expect(canvas.getByText("Synopsis")).toBeInTheDocument();
    await expect(canvas.getByText("Cast")).toBeInTheDocument();
  },
};

export const Unmatched: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: FilmDetailPaneStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-2",
          title: "unknown_movie_2024.mkv",
          filename: "unknown_movie_2024.mkv",
          durationSeconds: 5400,
          fileSizeBytes: 12_000_000_000,
          bitrate: 40_000_000,
          matched: false,
          mediaType: "MOVIES",
          metadata: null,
          videoStream: { codec: "h264", width: 1920, height: 1080, fps: 24 },
          audioStream: { codec: "aac", channels: 2, sampleRate: 44100 },
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("unknown_movie_2024.mkv")).toBeInTheDocument();
  },
};

export const NoCast: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: FilmDetailPaneStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-3",
          title: "Interstellar",
          filename: "interstellar.2014.4k.mkv",
          durationSeconds: 10140,
          fileSizeBytes: 65_000_000_000,
          bitrate: 200_000_000,
          matched: true,
          mediaType: "MOVIES",
          metadata: {
            imdbId: "tt0816692",
            title: "Interstellar",
            year: 2014,
            genre: "Adventure, Drama, Sci-Fi",
            director: "Christopher Nolan",
            cast: [],
            rating: 8.7,
            plot: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
            posterUrl: null,
          },
          videoStream: { codec: "hevc", width: 3840, height: 2160, fps: 24 },
          audioStream: { codec: "dts", channels: 6, sampleRate: 48000 },
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Interstellar")).toBeInTheDocument();
    await expect(canvas.getByText("Synopsis")).toBeInTheDocument();
    // Cast section is skipped when cast is empty.
    await expect(canvas.queryByText("Cast")).toBeNull();
  },
};
