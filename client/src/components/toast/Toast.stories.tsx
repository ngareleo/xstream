import { type FC } from "react";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { useToast } from "~/hooks/useToast.js";
import { withNovaEventing } from "~/storybook/withNovaEventing.js";

import { ToastProvider } from "./Toast.js";

/**
 * Demo harness: buttons inside the ToastProvider emit toast events via
 * useToast (generateEvent flows through the provider's interceptor even with
 * the no-op root eventing decorator).
 */
const ToastDemo: FC = () => {
  const toast = useToast();
  return (
    <div style={{ display: "flex", gap: 12, fontFamily: "monospace" }}>
      <button
        type="button"
        onClick={() => toast({ variant: "success", message: 'Re-linked to "Blade Runner 2049".' })}
      >
        Success
      </button>
      <button
        type="button"
        onClick={() => toast({ variant: "error", message: "Failed to link. Try again." })}
      >
        Error
      </button>
      <button
        type="button"
        onClick={() => toast({ variant: "info", message: "Scanning library…" })}
      >
        Info
      </button>
    </div>
  );
};

const ToastHarness: FC = () => (
  <ToastProvider>
    <ToastDemo />
  </ToastProvider>
);

const meta: Meta<typeof ToastHarness> = {
  title: "Components/Toast",
  component: ToastHarness,
  parameters: { layout: "centered" },
  decorators: [withNovaEventing],
};

export default meta;

type Story = StoryObj<typeof ToastHarness>;

export const Default: Story = {};
