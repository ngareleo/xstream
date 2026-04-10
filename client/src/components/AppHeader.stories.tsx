import { MemoryRouter } from "react-router-dom";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { AppHeader } from "./AppHeader.js";

/**
 * AppHeader renders the top navigation bar with the logo and tab links.
 * Stories use MemoryRouter to control which route appears active.
 */

const meta: Meta<typeof AppHeader> = {
  title: "Components/AppHeader",
  component: AppHeader,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppHeader>;

export const ProfilesActive: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export const SetupActive: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/setup"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export const LibraryActive: Story = {
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/library"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
};
