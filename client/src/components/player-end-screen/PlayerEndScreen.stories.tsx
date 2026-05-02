import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React from "react";
import { graphql } from "react-relay";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { PlayerEndScreen_video$key } from "~/relay/__generated__/PlayerEndScreen_video.graphql.js";
import type { PlayerEndScreenStoryQuery } from "~/relay/__generated__/PlayerEndScreenStoryQuery.graphql.js";

import { PlayerEndScreen } from "./PlayerEndScreen.js";

/**
 * PlayerEndScreen is shown when playback reaches the end of a video.
 * It displays up-next suggestion cards (filtered from the same library) and
 * a Replay button that bubbles a PLAY_REQUESTED Nova event.
 *
 * Stories use @imchhh/storybook-addon-relay for mock fragment data and wrap
 * the component in a NovaEventingProvider (required for useNovaEventing).
 */

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

// Relay's MockPayloadGenerator applies the `Video` resolver to every Video in
// the response — including nested suggestion edges. `context.path` is the same
// for every nested edge, so we use a per-resolver-pass counter to give each
// edge a distinct id (otherwise React warns about duplicate keys when the
// component renders multiple cards with the same id). The counter resets
// whenever a root resolver call comes in, so the addon's repeated mock-resolver
// invocations across renders stay deterministic.
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

/** Suggestion card (Relay deduplicates by id) plus the Replay button. */
export const WithSuggestions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Up Next")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Replay" })).toBeInTheDocument();
    await expect(canvas.getByText("Mad Max: Fury Road")).toBeInTheDocument();
  },
};

/** No other videos in the library — only the Replay button is shown. */
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
    // No suggestion cards → no "Up Next" header.
    await expect(canvas.queryByText("Up Next")).toBeNull();
  },
};
