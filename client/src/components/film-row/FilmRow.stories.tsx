import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { FilmRow_video$key } from "~/relay/__generated__/FilmRow_video.graphql";
import type { FilmRowStoryQuery } from "~/relay/__generated__/FilmRowStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

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
  selected: boolean;
}

const FilmRowWrapper = ({ video, selected }: WrapperProps): JSX.Element => (
  <div style={{ width: 720, background: "#050706" }}>
    <FilmRow video={video} selected={selected} onOpen={() => undefined} onEdit={() => undefined} />
  </div>
);

const meta: Meta<WrapperProps> = {
  title: "Components/FilmRow",
  component: FilmRowWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:movie-1" },
      getReferenceEntry: (result: FilmRowStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          title: "Oppenheimer",
          filename: "Oppenheimer.2023.2160p.UHD.mkv",
          mediaType: "MOVIES",
          durationSeconds: 10800,
          matched: true,
          nativeResolution: "RESOLUTION_4K",
          metadata: {
            year: 2023,
            genre: "Biography · Drama",
            rating: 8.4,
            posterUrl: null,
          },
          seasons: [],
        }),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Movie: Story = { args: { selected: false } };
export const MovieSelected: Story = { args: { selected: true } };
