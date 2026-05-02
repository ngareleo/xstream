import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { MediaKindBadge } from "./MediaKindBadge.js";

const meta: Meta<typeof MediaKindBadge> = {
  title: "Components/MediaKindBadge",
  component: MediaKindBadge,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof MediaKindBadge>;

export const MovieRow: Story = { args: { kind: "MOVIES", variant: "row" } };
export const SeriesRow: Story = { args: { kind: "TV_SHOWS", variant: "row" } };

export const MovieTile: Story = {
  args: { kind: "MOVIES", variant: "tile" },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 60, height: 90, background: "#222" }}>
        <Story />
      </div>
    ),
  ],
};
export const SeriesTile: Story = {
  args: { kind: "TV_SHOWS", variant: "tile" },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 60, height: 90, background: "#222" }}>
        <Story />
      </div>
    ),
  ],
};
