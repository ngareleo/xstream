import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { PlayerEndScreen_video$key } from "~/relay/__generated__/PlayerEndScreen_video.graphql.js";
import type { PlayerEndScreenStoryQuery } from "~/relay/__generated__/PlayerEndScreenStoryQuery.graphql.js";

import { PlayerEndScreen } from "./PlayerEndScreen.js";

/** End-screen shown on playback completion; displays suggestions + Replay button. */

const STORY_QUERY = graphql`
  query PlayerEndScreenStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...PlayerEndScreen_video
    }
  }
`;

const noopEventing = {
  bubble: (_event: EventWrapper): Promise<void> => Promise.resolve(),
};

interface WrapperProps {
  video: PlayerEndScreen_video$key;
}

function PlayerEndScreenWrapper({ video }: WrapperProps): JSX.Element {
  return (
    <div style={{ position: "relative", width: "100%", height: "400px", background: "#080808" }}>
      <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
        <PlayerEndScreen video={video} />
      </NovaEventingProvider>
    </div>
  );
}

// Per-resolver-pass counter gives each suggestion edge a distinct id for React keys.
const SUGGESTION_TITLES = ["Mad Max: Fury Road", "Dune: Part Two", "Oppenheimer", "The Batman"];
let suggestionCounter = 0;

const withSuggestionsResolvers = {
  Video: (context: { path?: readonly string[] }) => {
    const isUpNext = (context.path ?? []).includes("edges");
    if (!isUpNext) {
      suggestionCounter = 0;
      return {
        id: "Video:mock-current",
        library: {
          videos: { edges: SUGGESTION_TITLES.map(() => ({ node: {} })) },
        },
      };
    }
    const idx = suggestionCounter++ % SUGGESTION_TITLES.length;
    return {
      id: `Video:suggestion-${idx}`,
      title: SUGGESTION_TITLES[idx],
      metadata: { year: 2015 + idx, posterUrl: null },
    };
  },
};

const meta: Meta<WrapperProps> = {
  title: "Components/PlayerEndScreen",
  component: PlayerEndScreenWrapper,
  parameters: {
    layout: "fullscreen",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-current" },
      getReferenceEntry: (result: PlayerEndScreenStoryQuery["response"]) => ["video", result.video],
      mockResolvers: withSuggestionsResolvers,
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const WithSuggestions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Up Next")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    await expect(canvas.getByText("Mad Max: Fury Road")).toBeInTheDocument();
  },
};

export const NoSuggestions: Story = {
  parameters: {
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:mock-current" },
      getReferenceEntry: (result: PlayerEndScreenStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () => ({
          id: "Video:mock-current",
          library: { videos: { edges: [] } },
        }),
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    await expect(canvas.queryByText("Up Next")).toBeNull();
  },
};
