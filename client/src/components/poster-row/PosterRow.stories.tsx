import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { FilmTile, type FilmTileViewModel } from "~/components/film-tile/FilmTile";

import { PosterRow } from "./PosterRow.js";

const film = (id: number): FilmTileViewModel => ({
  id: String(id),
  title: `Film ${id}`,
  filename: `film-${id}.mkv`,
  kind: id % 3 === 0 ? "TV_SHOWS" : "MOVIES",
  posterUrl: `https://picsum.photos/seed/poster${id}/200/300`,
  year: 2000 + id,
  durationLabel: "1h 40m",
});

const meta: Meta<typeof PosterRow> = {
  title: "Components/PosterRow",
  component: PosterRow,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PosterRow>;

export const Few: Story = {
  args: {
    title: "New releases",
    children: [1, 2, 3].map((i) => <FilmTile key={i} film={film(i)} onClick={() => {}} />),
  },
};

export const Overflowing: Story = {
  args: {
    title: "Continue watching",
    children: Array.from({ length: 12 }, (_, i) => (
      <FilmTile
        key={i + 1}
        film={film(i + 1)}
        progress={i % 4 === 0 ? 35 : undefined}
        onClick={() => {}}
      />
    )),
  },
};

export const Empty: Story = {
  args: { title: "Watchlist", children: null },
};
