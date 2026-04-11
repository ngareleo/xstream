import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { PosterCard_video$key } from "~/relay/__generated__/PosterCard_video.graphql.js";
import type { PosterCardStoryQuery } from "~/relay/__generated__/PosterCardStoryQuery.graphql.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";
import { withRelay } from "~/storybook/withRelay.js";

import { PosterCard } from "./PosterCard.js";

const STORY_QUERY = graphql`
  query PosterCardStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...PosterCard_video
    }
  }
`;

interface WrapperProps {
  video: PosterCard_video$key;
  isSelected?: boolean;
}

const PosterCardWrapper = ({ video, isSelected = false }: WrapperProps): JSX.Element => (
  <div style={{ width: 160, background: "#0a0a0a", padding: 8 }}>
    <PosterCard video={video} isSelected={isSelected} />
  </div>
);

const meta: Meta<WrapperProps> = {
  title: "Components/PosterCard",
  component: PosterCardWrapper,
  decorators: [withNovaEventing, withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PosterCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-1",
          title: "Dune: Part Two",
          matched: true,
          mediaType: "MOVIES",
          metadata: { year: 2024, rating: 8.5, posterUrl: null },
          videoStream: { height: 2160 },
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Matched4K: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Dune: Part Two")).toBeInTheDocument();
    await expect(canvas.getByText("4K")).toBeInTheDocument();
  },
};

export const MatchedHD: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PosterCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-2",
          title: "Oppenheimer",
          matched: true,
          mediaType: "MOVIES",
          metadata: { year: 2023, rating: 8.9, posterUrl: null },
          videoStream: { height: 1080 },
        }),
      },
    },
  },
};

export const Unmatched: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PosterCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-3",
          title: "unknown_movie_2023.mkv",
          matched: false,
          mediaType: "MOVIES",
          metadata: null,
          videoStream: { height: 1080 },
        }),
      },
    },
  },
};

export const Selected: Story = {
  args: { isSelected: true },
};

export const NoRating: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: PosterCardStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-4",
          title: "Interstellar",
          matched: true,
          mediaType: "MOVIES",
          metadata: { year: 2014, rating: null, posterUrl: null },
          videoStream: { height: 2160 },
        }),
      },
    },
  },
};
