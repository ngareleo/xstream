import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { DetailPane_video$key } from "~/relay/__generated__/DetailPane_video.graphql";
import type { DetailPaneStoryQuery } from "~/relay/__generated__/DetailPaneStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { DetailPane } from "./DetailPane.js";

const STORY_QUERY = graphql`
  query DetailPaneStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...DetailPane_video
    }
  }
`;

interface WrapperProps {
  video: DetailPane_video$key;
  initialEdit?: boolean;
}

const DetailPaneWrapper = ({ video, initialEdit }: WrapperProps): JSX.Element => (
  <div style={{ width: 480, height: "100vh", background: "#050706" }}>
    <DetailPane video={video} initialEdit={initialEdit} onClose={() => undefined} />
  </div>
);

const movieMockResolvers = {
  Video: () => ({
    title: "Oppenheimer",
    filename: "Oppenheimer.2023.2160p.UHD.mkv",
    mediaType: "MOVIES",
    durationSeconds: 10800,
    fileSizeBytes: 25_000_000_000,
    bitrate: 18_500_000,
    nativeResolution: "RESOLUTION_4K",
    metadata: {
      year: 2023,
      genre: "Biography · Drama · History",
      director: "Christopher Nolan",
      plot: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
      rating: 8.4,
      posterUrl: "https://m.media-amazon.com/images/I/71qH0L8m5vL._AC_SL1500_.jpg",
    },
    videoStream: { codec: "hevc" },
    audioStream: { codec: "atmos", channels: 8 },
    seasons: [],
  }),
};

const meta: Meta<WrapperProps> = {
  title: "Components/DetailPane",
  component: DetailPaneWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:movie-1" },
      getReferenceEntry: (result: DetailPaneStoryQuery["response"]) => ["video", result.video],
      mockResolvers: movieMockResolvers,
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const ViewMovie: Story = {};
export const EditMode: Story = { args: { initialEdit: true } };
