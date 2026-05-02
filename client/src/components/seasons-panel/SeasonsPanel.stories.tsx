import { graphql } from "react-relay";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import type { SeasonsPanel_video$key } from "~/relay/__generated__/SeasonsPanel_video.graphql";
import type { SeasonsPanelStoryQuery } from "~/relay/__generated__/SeasonsPanelStoryQuery.graphql";
import { withRelay } from "~/storybook/withRelay";

import { type ActiveEpisode, SeasonsPanel } from "./SeasonsPanel.js";

const STORY_QUERY = graphql`
  query SeasonsPanelStoryQuery($videoId: ID!) @relay_test_operation {
    video(id: $videoId) {
      ...SeasonsPanel_video
    }
  }
`;

interface WrapperProps {
  video: SeasonsPanel_video$key;
  defaultOpenFirst?: boolean;
  accordion?: boolean;
  activeEpisode?: ActiveEpisode;
  onSelectEpisode?: (s: number, e: number) => void;
}

const SeasonsPanelWrapper = (props: WrapperProps): JSX.Element => (
  <div style={{ width: 380, background: "#0a0d0c", padding: 16 }}>
    <SeasonsPanel {...props} />
  </div>
);

const buildSeasons = (config: { num: number; available: number }[]) => ({
  seasons: config.map((cfg, idx) => ({
    seasonNumber: idx + 1,
    episodes: Array.from({ length: cfg.num }, (_, i) => ({
      episodeNumber: i + 1,
      title: `Episode ${i + 1}`,
      durationSeconds: 2820,
      onDisk: i < cfg.available,
    })),
  })),
});

const meta: Meta<WrapperProps> = {
  title: "Components/SeasonsPanel",
  component: SeasonsPanelWrapper,
  decorators: [withRelay],
  parameters: {
    layout: "padded",
    relay: {
      query: STORY_QUERY,
      variables: { videoId: "Video:show-1" },
      getReferenceEntry: (result: SeasonsPanelStoryQuery["response"]) => ["video", result.video],
      mockResolvers: {
        Video: () =>
          buildSeasons([
            { num: 10, available: 10 },
            { num: 10, available: 4 },
            { num: 10, available: 0 },
          ]),
      },
    },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Closed: Story = {};
export const DefaultOpenFirst: Story = { args: { defaultOpenFirst: true } };
export const Accordion: Story = { args: { defaultOpenFirst: true, accordion: true } };
export const InteractivePlayer: Story = {
  args: {
    activeEpisode: { seasonNumber: 1, episodeNumber: 3 },
    onSelectEpisode: () => {},
  },
};
