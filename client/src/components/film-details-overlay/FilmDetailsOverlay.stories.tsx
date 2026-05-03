import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { FilmDetailsOverlay_video$key } from "~/relay/__generated__/FilmDetailsOverlay_video.graphql";
import type { FilmDetailsOverlayStoryQuery } from "~/relay/__generated__/FilmDetailsOverlayStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { FilmDetailsOverlay } from "./FilmDetailsOverlay.js";

const STORY_QUERY = graphql`
  query FilmDetailsOverlayStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...FilmDetailsOverlay_video
    }
  }
`;

interface WrapperProps {
  video: FilmDetailsOverlay_video$key;
}

const FilmDetailsOverlayWrapper = ({ video }: WrapperProps): JSX.Element => (
  <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
    <FilmDetailsOverlay video={video} onClose={() => {}} />
  </div>
);

const movie = {
  id: "mock-movie",
  title: "Blade Runner 2049",
  filename: "blade-runner-2049.mkv",
  mediaType: "MOVIES",
  durationSeconds: 9840,
  nativeResolution: "RESOLUTION_4K",
  metadata: {
    year: 2017,
    genre: "Sci-Fi",
    director: "Denis Villeneuve",
    plot: "Thirty years after the events of the first film, a new blade runner unearths a long-buried secret.",
    rating: 8.0,
    posterUrl: "https://picsum.photos/seed/blade/1920/1080",
  },
  videoStream: { codec: "HEVC" },
  seasons: [],
};

const series = {
  id: "mock-series",
  title: "Severance",
  filename: "severance/",
  mediaType: "TV_SHOWS",
  durationSeconds: 0,
  nativeResolution: "RESOLUTION_1080P",
  metadata: {
    year: 2022,
    genre: "Drama",
    director: "Ben Stiller",
    plot: "Office workers whose memories are surgically divided between work and personal life.",
    rating: 8.7,
    posterUrl: "https://picsum.photos/seed/severance/1920/1080",
  },
  videoStream: { codec: "HEVC" },
  seasons: [
    {
      seasonNumber: 1,
      episodes: Array.from({ length: 9 }, (_, i) => ({
        episodeNumber: i + 1,
        title: `Episode ${i + 1}`,
        durationSeconds: 2820,
        onDisk: true,
      })),
    },
    {
      seasonNumber: 2,
      episodes: Array.from({ length: 10 }, (_, i) => ({
        episodeNumber: i + 1,
        title: `Episode ${i + 1}`,
        durationSeconds: 2820,
        onDisk: i < 4,
      })),
    },
  ],
};

const meta: Meta<WrapperProps> = {
  title: "Components/FilmDetailsOverlay",
  component: FilmDetailsOverlayWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-movie" },
      getReferenceEntry: (result: FilmDetailsOverlayStoryQuery["response"]) => [
        "video",
        result.video,
      ],
      mockResolvers: { Video: () => movie },
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
      variables: { videoId: "Video:mock-series" },
      getReferenceEntry: (result: FilmDetailsOverlayStoryQuery["response"]) => [
        "video",
        result.video,
      ],
      mockResolvers: { Video: () => series },
    },
  },
};

export const UnmatchedFile: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-unmatched" },
      getReferenceEntry: (result: FilmDetailsOverlayStoryQuery["response"]) => [
        "video",
        result.video,
      ],
      mockResolvers: {
        Video: () => ({
          ...movie,
          id: "mock-unmatched",
          title: "",
          filename: "weird.file.mkv",
          metadata: null,
          nativeResolution: null,
          videoStream: null,
        }),
      },
    },
  },
};
