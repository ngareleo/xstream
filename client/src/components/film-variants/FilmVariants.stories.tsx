import { useState } from "react";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { type FilmVariantOption, FilmVariants } from "./FilmVariants";

const SAMPLE: FilmVariantOption[] = [
  {
    id: "v1",
    resolution: "4K",
    codec: "HEVC",
    fileSizeBytes: 18_000_000_000,
    libraryName: "Endurance Movies",
  },
  {
    id: "v2",
    resolution: "1080p",
    codec: "x265",
    fileSizeBytes: 4_500_000_000,
    libraryName: "Movies",
  },
];

const Wrapper = ({ copies }: { copies: FilmVariantOption[] }) => {
  const [selected, setSelected] = useState(copies[0]?.id ?? "");
  return (
    <div style={{ width: "560px", padding: "24px", background: "#0b0d0c" }}>
      <FilmVariants copies={copies} selectedId={selected} onSelect={setSelected} />
    </div>
  );
};

const meta: Meta<typeof Wrapper> = {
  title: "Components/FilmVariants",
  component: Wrapper,
};
export default meta;
type Story = StoryObj<typeof Wrapper>;

export const TwoCopies: Story = {
  args: { copies: SAMPLE },
};

export const SingleCopy: Story = {
  // Renders nothing — the component returns null when copies.length === 1.
  args: { copies: [SAMPLE[0]] },
};

export const ThreeCopies: Story = {
  args: {
    copies: [
      ...SAMPLE,
      {
        id: "v3",
        resolution: "720p",
        codec: "x264",
        fileSizeBytes: 2_100_000_000,
        libraryName: "Endurance Movies",
      },
    ],
  },
};
