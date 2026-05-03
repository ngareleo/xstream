import React, { useRef } from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { createMockEnvironment } from "relay-test-utils";
import { expect, within } from "storybook/test";
import type { Decorator, Meta, StoryObj } from "storybook-react-rsbuild";

import { AppHeader } from "./AppHeader.js";

const MockRelayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const envRef = useRef<ReturnType<typeof createMockEnvironment> | null>(null);
  if (envRef.current === null) envRef.current = createMockEnvironment();
  return (
    <RelayEnvironmentProvider environment={envRef.current}>{children}</RelayEnvironmentProvider>
  );
};

const withMockRelay: Decorator = (Story) => (
  <MockRelayProvider>
    <Story />
  </MockRelayProvider>
);

const meta: Meta<typeof AppHeader> = {
  title: "Components/AppHeader",
  component: AppHeader,
  decorators: [withMockRelay],
  parameters: {
    layout: "fullscreen",
    router: { initialEntries: ["/"] },
  },
};

export default meta;
type Story = StoryObj<typeof AppHeader>;

export const HomeActive: Story = {
  parameters: { router: { initialEntries: ["/"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Xstream — home")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "home" })).toBeInTheDocument();
  },
};

export const ProfilesActive: Story = {
  parameters: { router: { initialEntries: ["/profiles"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "profiles" })).toBeInTheDocument();
  },
};

export const WatchlistActive: Story = {
  parameters: { router: { initialEntries: ["/watchlist"] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "watchlist" })).toBeInTheDocument();
  },
};
