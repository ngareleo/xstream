import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { useCallback, useState } from "react";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { isSidebarToggledEvent } from "./Sidebar.events.js";
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
  const interceptor = useCallback(
    async (wrapper: EventWrapper): Promise<EventWrapper | undefined> => {
      if (isSidebarToggledEvent(wrapper)) {
        setCollapsed((c) => !c);
        return undefined;
      }
      return wrapper;
    },
    []
  );
  return (
    <div style={{ display: "flex", height: "100vh", background: "#080808" }}>
      <NovaEventingInterceptor interceptor={interceptor}>
        <Sidebar collapsed={collapsed} />
      </NovaEventingInterceptor>
    </div>
  );
};

const meta: Meta<WrapperProps> = {
  title: "Components/Sidebar",
  component: SidebarWrapper,
  decorators: [withNovaEventing],
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
    // When collapsed, nav labels are hidden (display:none) and tooltips are
    // aria-hidden — both are excluded from accessible queries. Verify the
    // sidebar navigation still renders in the collapsed state.
    await expect(canvas.getByRole("navigation")).toBeInTheDocument();
  },
};

export const LibraryActive: Story = {
  args: { initialCollapsed: false },
  parameters: { router: { initialEntries: ["/library"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Library")).toBeInTheDocument();
    await expect(canvas.getByText("Profiles")).toBeInTheDocument();
  },
};
