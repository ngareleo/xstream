import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { FeedbackDialog } from "./FeedbackDialog.js";

const meta: Meta<typeof FeedbackDialog> = {
  title: "Components/FeedbackDialog",
  component: FeedbackDialog,
  // The global preview decorator provides the router; set the route via its
  // `router.initialEntries` param (a nested <Router> would crash).
  parameters: {
    layout: "fullscreen",
    router: { initialEntries: ["/player/abc123"] },
  },
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
