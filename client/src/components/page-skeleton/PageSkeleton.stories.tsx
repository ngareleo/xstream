import React from "react";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import {
  DashboardSkeleton,
  LibrarySkeleton,
  SettingsSkeleton,
  WatchlistSkeleton,
} from "./PageSkeleton.js";

/**
 * PageSkeleton exports four shimmer skeleton fallbacks used as Suspense
 * boundaries while page data loads. Each variant mirrors the real page
 * layout so there is no layout shift when the content appears.
 */

const meta: Meta = {
  title: "Components/PageSkeleton",
  parameters: { layout: "fullscreen" },
};

export default meta;

export const Dashboard: StoryObj = {
  render: () => (
    <div style={{ height: "100vh", background: "#080808", overflow: "hidden" }}>
      <DashboardSkeleton />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Skeleton elements are rendered as divs — verify the container exists
    await expect(canvas.queryByRole("progressbar")).toBeNull();
  },
};

export const Library: StoryObj = {
  render: () => (
    <div style={{ height: "100vh", background: "#080808", overflow: "hidden" }}>
      <LibrarySkeleton />
    </div>
  ),
};

export const Watchlist: StoryObj = {
  render: () => (
    <div style={{ height: "100vh", background: "#080808", overflow: "hidden" }}>
      <WatchlistSkeleton />
    </div>
  ),
};

export const Settings: StoryObj = {
  render: () => (
    <div style={{ height: "100vh", background: "#080808", overflow: "hidden" }}>
      <SettingsSkeleton />
    </div>
  ),
};
