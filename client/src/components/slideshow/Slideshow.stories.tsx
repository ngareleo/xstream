import React from "react";
import { expect, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { Slideshow } from "./Slideshow.js";

const meta: Meta<typeof Slideshow> = {
  title: "Components/Slideshow",
  component: Slideshow,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 240, position: "relative" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Slideshow>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Dots navigation should be present
    await expect(canvas.getAllByRole("button")).toHaveLength(4);
  },
};
