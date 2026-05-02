import { useState } from "react";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { EMPTY_FILTERS, type Filters } from "~/utils/filters";

import { FilterSlide } from "./FilterSlide.js";

interface WrapperProps {
  initialFilters: Filters;
  query: string;
  resultCount: number;
  totalMatched: number;
  profileCount: number;
}

const Wrapper = ({
  initialFilters,
  query,
  resultCount,
  totalMatched,
  profileCount,
}: WrapperProps): JSX.Element => {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  return (
    <div style={{ width: 720, minHeight: 360 }}>
      <FilterSlide
        query={query}
        filters={filters}
        setFilters={setFilters}
        resultCount={resultCount}
        totalMatched={totalMatched}
        profileCount={profileCount}
        onClose={() => {}}
        onClearFilters={() => setFilters(EMPTY_FILTERS)}
      />
    </div>
  );
};

const meta: Meta<WrapperProps> = {
  title: "Components/FilterSlide",
  component: Wrapper,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Empty: Story = {
  args: {
    initialFilters: EMPTY_FILTERS,
    query: "",
    resultCount: 42,
    totalMatched: 42,
    profileCount: 3,
  },
};

export const OneDimension: Story = {
  args: {
    initialFilters: { ...EMPTY_FILTERS, resolutions: new Set(["4K"]) },
    query: "",
    resultCount: 12,
    totalMatched: 42,
    profileCount: 3,
  },
};

export const WithQuery: Story = {
  args: {
    initialFilters: { ...EMPTY_FILTERS, codecs: new Set(["HEVC"]) },
    query: "noir",
    resultCount: 4,
    totalMatched: 11,
    profileCount: 2,
  },
};
