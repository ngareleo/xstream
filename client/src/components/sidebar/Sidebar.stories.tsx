import React, { useState } from "react";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { Sidebar } from "./Sidebar.js";

/**
 * Sidebar renders the left navigation with NavLinks and a collapse toggle.
 * The global Storybook preview wraps every story in MemoryRouter, so NavLinks
 * work without any extra setup.
 */

interface WrapperProps {
  initialCollapsed?: boolean;
}

const SidebarWrapper = ({ initialCollapsed = false }: WrapperProps): JSX.Element => {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <div style={{ display: "flex", height: "100vh", background: "#080808" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
    </div>
  );
};

const meta: Meta<WrapperProps> = {
  title: "Components/Sidebar",
  component: SidebarWrapper,
  parameters: {
    layout: "fullscreen",
    router: { initialEntries: ["/"] },
  },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Expanded: Story = {
  args: { initialCollapsed: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Profiles")).toBeInTheDocument();
    await expect(canvas.getByText("Library")).toBeInTheDocument();
  },
};

export const Collapsed: Story = {
  args: { initialCollapsed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Labels should be hidden when collapsed
    await expect(canvas.queryByText("Profiles")).not.toBeInTheDocument();
  },
};

export const LibraryActive: Story = {
  args: { initialCollapsed: false },
  parameters: { router: { initialEntries: ["/library"] } },
};
