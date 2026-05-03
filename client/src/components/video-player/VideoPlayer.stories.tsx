import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { VideoPlayerStoryQuery } from "~/relay/__generated__/VideoPlayerStoryQuery.graphql.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { VideoPlayer } from "./VideoPlayer.js";

/**
 * VideoPlayer renders the <video> element + ControlBar and owns the MSE
 * streaming lifecycle. In Storybook, no actual video stream is loaded — the
 * player is shown in its initial idle state so layout, controls, and error
 * overlay can be verified visually without a running server.
 *
 * Stories use @imchhh/storybook-addon-relay to supply the fragment key via a
 * mock Relay environment.
 */

const STORY_QUERY = graphql`
  query VideoPlayerStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...VideoPlayer_video
    }
  }
`;

const meta: Meta<typeof VideoPlayer> = {
  title: "Components/VideoPlayer",
  component: VideoPlayer,
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoPlayerStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "Video:mock",
          videoStream: { height: 2160 },
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
        }),
      },
    },
  },
  decorators: [withNovaEventing],
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

/** Default idle state before any playback has started. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // ControlBar renders a play button at two breakpoints (large + small);
    // getAllByRole handles multiple matches.
    const playBtns = canvas.getAllByRole("button", { name: /play/i });
    await expect(playBtns.length).toBeGreaterThan(0);
    await expect(canvasElement.querySelector("video")).toBeInTheDocument();
  },
};

/** Capped at 1080p — used when the source is not 4K. */
export const Capped1080p: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoPlayerStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "Video:mock",
          videoStream: { height: 1080 },
          title: "Mad Max: Fury Road (2015)",
          durationSeconds: 7200,
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("video")).toBeInTheDocument();
  },
};

/** No video stream metadata available (audio-only or unrecognised format). */
export const NoStreamInfo: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock" },
      getReferenceEntry: (result: VideoPlayerStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "Video:mock",
          videoStream: null,
          title: "Unknown Format File",
          durationSeconds: 0,
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("video")).toBeInTheDocument();
  },
};
