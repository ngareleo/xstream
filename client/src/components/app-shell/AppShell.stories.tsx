import React, { useRef } from "react";
import { RelayEnvironmentProvider } from "react-relay";
import { createMockEnvironment } from "relay-test-utils";
import { expect, within } from "storybook/test";
import type { Decorator, Meta, StoryObj } from "storybook-react-rsbuild";

import { AppShell } from "./AppShell.js";

// AppShell wraps AppHeader, which calls `useMutation` — that requires a
// RelayEnvironmentProvider above it in the tree. Stories don't make real
// network calls, so a mock environment is enough; mirrors AppHeader's
// own story decorator. The query-aware `~/storybook/withRelay` decorator
// expects a `relay` parameter with a query and isn't needed here.
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

const Placeholder = (): JSX.Element => (
  <div
    style={{
      paddingTop: "52px",
      paddingLeft: "24px",
      paddingRight: "24px",
      paddingBottom: "24px",
      fontFamily: "monospace",
      color: "#9aa6a0",
    }}
  >
    Page content sits at viewport y=0; pages add their own header-clearance padding.
  </div>
);

const meta: Meta<typeof AppShell> = {
  title: "Components/AppShell",
  component: AppShell,
  decorators: [withMockRelay],
  parameters: {
    layout: "fullscreen",
    router: { initialEntries: ["/"] },
  },
};

export default meta;
type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
  render: () => (
    <AppShell>
      <Placeholder />
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("main")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Xstream — home")).toBeInTheDocument();
  },
};

export const ProfilesRoute: Story = {
  parameters: { router: { initialEntries: ["/profiles"] } },
  render: () => (
    <AppShell>
      <Placeholder />
    </AppShell>
  ),
};
