import React from "react";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { AppShell } from "./AppShell.js";

/**
 * AppShell is the root layout: header + sidebar + main content area.
 * Stories render a placeholder content block in the main slot.
 * The global MemoryRouter decorator handles NavLink routing.
 */

const Placeholder = (): JSX.Element => (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#444",
      fontSize: 13,
    }}
  >
    Page content here
  </div>
);

const meta: Meta<typeof AppShell> = {
  title: "Components/AppShell",
  component: AppShell,
  decorators: [withNovaEventing],
  parameters: {
    layout: "fullscreen",
    router: { initialEntries: ["/"] },
  },
};

export default meta;
type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
  render: () => (
    <div style={{ height: "100vh" }}>
      <AppShell>
        <Placeholder />
      </AppShell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // AppShell mounts two lazy chunks (SidebarAsync, DevPanelAsync) that both
    // need to commit inside the test's act() window — see LibraryRoute.
    await canvas.findByText("Profiles"); // from SidebarAsync
    await canvas.findByText("DEV"); // from DevPanelAsync (collapsed pill button)
    await expect(canvas.getByText("MORAN")).toBeInTheDocument();
  },
};

export const LibraryRoute: Story = {
  render: () => (
    <div style={{ height: "100vh" }}>
      <AppShell>
        <Placeholder />
      </AppShell>
    </div>
  ),
  parameters: { router: { initialEntries: ["/library"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // AppShell mounts two lazy chunks: SidebarAsync (wrapped in <Suspense>)
    // and DevPanelAsync (top-level). Both must resolve inside the test's
    // act() window or React logs a "suspended resource finished loading"
    // warning that flips the console.error shim red. Awaiting one piece of
    // text from each chunk waits for both to commit.
    await canvas.findByText("Library"); // from SidebarAsync
    await canvas.findByText("DEV"); // from DevPanelAsync (collapsed pill button)
    await expect(canvas.getByText("MORAN")).toBeInTheDocument();
  },
};
