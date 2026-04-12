import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { AppHeader } from "./AppHeader.js";

/**
 * AppHeader renders the top navigation bar with the logo and tab links.
 * Stories use the global preview's MemoryRouter via `parameters.router.initialEntries`
 * to control which tab appears active.
 */

const meta: Meta<typeof AppHeader> = {
  title: "Components/AppHeader",
  component: AppHeader,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppHeader>;

export const ProfilesActive: Story = {
  parameters: { router: { initialEntries: ["/"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // AppHeader contains the brand name; nav tabs live in the Sidebar.
    await expect(canvas.getByText("MORAN")).toBeInTheDocument();
  },
};

export const SetupActive: Story = {
  parameters: { router: { initialEntries: ["/setup"] } },
};

export const LibraryActive: Story = {
  parameters: { router: { initialEntries: ["/library"] } },
};
