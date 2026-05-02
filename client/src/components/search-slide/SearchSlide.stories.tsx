import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { SearchSlide } from "./SearchSlide.js";

const meta: Meta<typeof SearchSlide> = {
  title: "Components/SearchSlide",
  component: SearchSlide,
  parameters: { layout: "padded" },
  args: {
    onOpenFilter: () => {},
    onClear: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720, minHeight: 360 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SearchSlide>;

export const Idle: Story = {
  args: {
    query: "",
    resultCount: 0,
    totalMatched: 0,
    profilesMatched: 0,
    activeFilterCount: 0,
  },
};

export const WithQuery: Story = {
  args: {
    query: "blade",
    resultCount: 4,
    totalMatched: 4,
    profilesMatched: 2,
    activeFilterCount: 0,
  },
};

export const WithQueryNoMatch: Story = {
  args: {
    query: "xyzzy",
    resultCount: 0,
    totalMatched: 0,
    profilesMatched: 0,
    activeFilterCount: 0,
  },
};

export const FiltersOnly: Story = {
  args: {
    query: "",
    resultCount: 18,
    totalMatched: 42,
    profilesMatched: 3,
    activeFilterCount: 2,
  },
};

export const QueryAndFilters: Story = {
  args: {
    query: "noir",
    resultCount: 6,
    totalMatched: 11,
    profilesMatched: 2,
    activeFilterCount: 3,
  },
};
