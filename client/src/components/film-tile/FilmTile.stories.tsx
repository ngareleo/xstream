import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { FilmTile_video$key } from "~/relay/__generated__/FilmTile_video.graphql";
import type { FilmTileStoryQuery } from "~/relay/__generated__/FilmTileStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { FilmTile } from "./FilmTile.js";

const STORY_QUERY = graphql`
  query FilmTileStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...FilmTile_video
    }
  }
`;

interface WrapperProps {
  video: FilmTile_video$key;
  progress?: number;
}

const FilmTileWrapper = ({ video, progress }: WrapperProps): JSX.Element => (
  <FilmTile video={video} progress={progress} onClick={() => {}} />
);

const baseVideo = {
  id: "mock-1",
  title: "Blade Runner 2049",
  filename: "blade-runner-2049.mkv",
  mediaType: "MOVIES",
  durationSeconds: 9840,
  metadata: {
    year: 2017,
    posterUrl: "https://picsum.photos/seed/blade/200/300",
  },
};

const meta: Meta<WrapperProps> = {
  title: "Components/FilmTile",
  component: FilmTileWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-1" },
      getReferenceEntry: (result: FilmTileStoryQuery["response"]) => ["video", result.video],
      mockResolvers: { Video: () => baseVideo },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Movie: Story = {};

export const Series: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-2" },
      getReferenceEntry: (result: FilmTileStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          ...baseVideo,
          id: "mock-2",
          title: "Severance",
          mediaType: "TV_SHOWS",
          metadata: {
            year: 2022,
            posterUrl: "https://picsum.photos/seed/severance/200/300",
          },
        }),
      },
    },
  },
};

export const WithProgress: Story = {
  args: { progress: 35 },
};

export const Unmatched: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-3" },
      getReferenceEntry: (result: FilmTileStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          ...baseVideo,
          id: "mock-3",
          title: "",
          filename: "weird.file.mkv",
          metadata: { year: null, posterUrl: null },
        }),
      },
    },
  },
};

export const MissingPoster: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-4" },
      getReferenceEntry: (result: FilmTileStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          ...baseVideo,
          id: "mock-4",
          metadata: { year: 2017, posterUrl: null },
        }),
      },
    },
  },
};
