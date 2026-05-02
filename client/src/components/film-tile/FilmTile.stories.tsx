import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { FilmTile, type FilmTileViewModel } from "./FilmTile.js";

const movie: FilmTileViewModel = {
  id: "1",
  title: "Blade Runner 2049",
  filename: "blade-runner-2049.mkv",
  kind: "MOVIES",
  posterUrl: "https://picsum.photos/seed/blade/200/300",
  year: 2017,
  durationLabel: "2h 44m",
};

const series: FilmTileViewModel = {
  id: "2",
  title: "Severance",
  filename: "severance.s01.mkv",
  kind: "TV_SHOWS",
  posterUrl: "https://picsum.photos/seed/severance/200/300",
  year: 2022,
  durationLabel: null,
};

const meta: Meta<typeof FilmTile> = {
  title: "Components/FilmTile",
  component: FilmTile,
  parameters: { layout: "centered" },
  args: { onClick: () => {} },
};

export default meta;
type Story = StoryObj<typeof FilmTile>;

export const Movie: Story = { args: { film: movie } };
export const Series: Story = { args: { film: series } };
export const WithProgress: Story = { args: { film: movie, progress: 35 } };
export const ProgressFull: Story = { args: { film: movie, progress: 100 } };
export const Unmatched: Story = {
  args: {
    film: {
      ...movie,
      title: null,
      filename: "weird.file.mkv",
      year: null,
      durationLabel: null,
    },
  },
};
export const MissingPoster: Story = {
  args: { film: { ...movie, posterUrl: null } },
};
