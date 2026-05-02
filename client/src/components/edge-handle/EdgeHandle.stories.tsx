import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "storybook-react-rsbuild";

import { EdgeHandle } from "./EdgeHandle.js";

interface WrapperProps {
  initialX: number;
  initialY: number;
}

const EdgeHandleWrapper = ({ initialX, initialY }: WrapperProps): JSX.Element => {
  const [pos, setPos] = useState({ x: initialX, y: initialY });

  useEffect(() => {
    const onMove = (e: MouseEvent): void => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(135deg, #0a0f0c, #050706)",
        overflow: "hidden",
      }}
    >
      <p
        style={{
          color: "rgba(255,255,255,0.6)",
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          padding: 24,
        }}
      >
        Move the cursor toward the right edge — the disc bulges into view.
      </p>
      <EdgeHandle cursorX={pos.x} cursorY={pos.y} onActivate={() => undefined} />
    </div>
  );
};

const meta: Meta<WrapperProps> = {
  title: "Components/EdgeHandle",
  component: EdgeHandleWrapper,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<WrapperProps>;

export const Default: Story = {
  args: { initialX: 0, initialY: 400 },
};
