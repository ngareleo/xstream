import React from "react";
import type { Decorator } from "storybook-react-rsbuild";

/**
 * Storybook decorator that wraps a story in a plain `<div>` with the given
 * inline styles. Use this to constrain width, height, or background for
 * components that need a specific layout context.
 *
 * Usage:
 * ```ts
 * import { withLayout } from "../storybook/withLayout.js";
 *
 * const meta: Meta<typeof MyComponent> = {
 *   decorators: [withNovaEventing, withLayout({ width: 380 })],
 * };
 * ```
 */
export const withLayout =
  (style: React.CSSProperties): Decorator =>
  (Story) => (
    <div style={style}>
      <Story />
    </div>
  );
