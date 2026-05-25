import { MemoryRouter } from "react-router-dom";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { FeedbackDialog } from "./FeedbackDialog.js";

const meta: Meta<typeof FeedbackDialog> = {
  title: "Components/FeedbackDialog",
  component: FeedbackDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/player/abc123"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    open: true,
    onClose: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof FeedbackDialog>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
    await expect(canvas.getByText("Send feedback")).toBeInTheDocument();
  },
};

export const RatingSelected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fourStars = canvas.getByRole("radio", { name: "4 of 5 stars" });
    await userEvent.click(fourStars);
    await expect(fourStars).toBeChecked();
  },
};
