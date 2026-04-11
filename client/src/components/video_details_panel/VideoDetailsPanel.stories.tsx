import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { VideoDetailsPanelStoryQuery } from "~/relay/__generated__/VideoDetailsPanelStoryQuery.graphql.js";
import { withLayout } from "~/storybook/withLayout.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { VideoDetailsPanel } from "./VideoDetailsPanel.js";

/**
 * VideoDetailsPanel shows video metadata and actions in the right pane of the
 * Profiles page. Clicking "Play Video" bubbles a VideoPlay Nova event.
 */

const STORY_QUERY = graphql`
  query VideoDetailsPanelStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...VideoDetailsPanel_video
    }
  }
`;

const meta: Meta<typeof VideoDetailsPanel> = {
  title: "Components/VideoDetailsPanel",
  component: VideoDetailsPanel,
  parameters: {
    layout: "centered",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoDetailsPanelStoryQuery["response"]) => [
        "video",
        result.video,
      ],
      mockResolvers: {
        Video: () => ({
          title: "Interstellar",
          durationSeconds: 10164,
          fileSizeBytes: 8.1e9,
          videoStream: { height: 2160, codec: "H.265" },
        }),
      },
    },
  },
  decorators: [withNovaEventing, withLayout({ width: 380 })],
};

export default meta;
type Story = StoryObj<typeof VideoDetailsPanel>;

export const Movie4K: Story = {
  args: { onClose: () => {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Interstellar")).toBeInTheDocument();
  },
};

export const Movie1080p: Story = {
  args: { onClose: () => {} },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoDetailsPanelStoryQuery["response"]) => [
        "video",
        result.video,
      ],
      mockResolvers: {
        Video: () => ({
          title: "The Dark Knight",
          durationSeconds: 9150,
          fileSizeBytes: 3.5e9,
          videoStream: { height: 1080, codec: "H.264" },
        }),
      },
    },
  },
};

export const NoStreamInfo: Story = {
  args: { onClose: () => {} },
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoDetailsPanelStoryQuery["response"]) => [
        "video",
        result.video,
      ],
      mockResolvers: {
        Video: () => ({
          title: "Unknown File",
          durationSeconds: 3600,
          fileSizeBytes: 1.2e9,
          videoStream: null,
        }),
      },
    },
  },
};
