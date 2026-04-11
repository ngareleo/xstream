import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { FilmRow_video$key } from "~/relay/__generated__/FilmRow_video.graphql.js";
import type { FilmRowStoryQuery } from "~/relay/__generated__/FilmRowStoryQuery.graphql.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";
import { withRelay } from "~/storybook/withRelay.js";

import { FilmRow } from "./FilmRow.js";

const STORY_QUERY = graphql`
  query FilmRowStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...FilmRow_video
    }
  }
`;

interface WrapperProps {
  video: FilmRow_video$key;
  isSelected?: boolean;
}

const FilmRowWrapper = ({ video, isSelected = false }: WrapperProps): JSX.Element => (
  <div style={{ width: 800, background: "#0f0f0f" }}>
    <FilmRow video={video} isSelected={isSelected} />
  </div>
);

const meta: Meta<WrapperProps> = {
  title: "Components/FilmRow",
  component: FilmRowWrapper,
  decorators: [withNovaEventing, withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: FilmRowStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-1",
          title: "Mad Max: Fury Road",
          durationSeconds: 7200,
          matched: true,
          mediaType: "MOVIES",
          metadata: { year: 2015 },
          videoStream: { height: 2160, width: 3840 },
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
    await expect(canvas.getByText("Mad Max: Fury Road")).toBeInTheDocument();
    await expect(canvas.getByText("4K")).toBeInTheDocument();
  },
};

export const MatchedHD: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: FilmRowStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-2",
          title: "The Dark Knight",
          durationSeconds: 9120,
          matched: true,
          mediaType: "MOVIES",
          metadata: { year: 2008 },
          videoStream: { height: 1080, width: 1920 },
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
      getReferenceEntry: (result: FilmRowStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-3",
          title: "unknown.file.2024.mkv",
          durationSeconds: 5400,
          matched: false,
          mediaType: "MOVIES",
          metadata: null,
          videoStream: { height: 1080, width: 1920 },
        }),
      },
    },
  },
};

export const Selected: Story = { args: { isSelected: true } };

export const TvShow: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: FilmRowStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "mock-4",
          title: "Breaking Bad S01E01",
          durationSeconds: 2880,
          matched: true,
          mediaType: "TV_SHOWS",
          metadata: { year: 2008 },
          videoStream: { height: 1080, width: 1920 },
        }),
      },
    },
  },
};
