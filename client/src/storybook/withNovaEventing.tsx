import { mapEventMetadata, NovaEventingProvider } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React from "react";
import type { Decorator } from "storybook-react-rsbuild";

/**
 * Storybook decorator that wraps a story in a no-op NovaEventingProvider.
 *
 * Required for any component that calls `useNovaEventing()` — the hook throws
 * without a provider ancestor. The no-op eventing silently discards all
 * bubbled events so stories remain self-contained.
 *
 * Usage:
 * ```ts
 * import { withNovaEventing } from "../storybook/withNovaEventing.js";
 *
 * const meta: Meta<typeof MyComponent> = {
 *   decorators: [withNovaEventing],
 * };
 * ```
 */

const noopEventing = { bubble: (_e: EventWrapper): Promise<void> => Promise.resolve() };

export const withNovaEventing: Decorator = (Story) => (
  <NovaEventingProvider eventing={noopEventing} reactEventMapper={mapEventMetadata}>
    <Story />
  </NovaEventingProvider>
);
