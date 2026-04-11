import React from "react";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

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
    await expect(canvas.getByText("Profiles")).toBeInTheDocument();
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
};
