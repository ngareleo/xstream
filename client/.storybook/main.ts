import type { StorybookConfig } from "@storybook/react-vite";
import type { InlineConfig } from "vite";

import { dirname } from "path";

import { fileURLToPath } from "url";

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    // @imchhh/storybook-addon-relay is NOT listed here. It ships a CJS-only
    // build that Vite cannot serve as ESM, crashing every story iframe with
    // "exports is not defined". The decorator is re-implemented in ESM at
    // src/storybook/withRelay.tsx and registered globally in preview.tsx.
    getAbsolutePath("@chromatic-com/storybook"),
    // @storybook/addon-vitest is intentionally excluded: it injects a Vitest
    // browser-mode mocker (vite:storybook-inject-mocker-runtime) that requires
    // the Vitest runtime to define `exports`. Re-enable when setting up a
    // proper vitest --browser integration.
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
    getAbsolutePath("@storybook/addon-onboarding"),
  ],
  framework: getAbsolutePath("@storybook/react-vite"),

  viteFinal(config): InlineConfig {
    // @storybook/builder-vite unconditionally injects a Vitest browser-mode
    // mocker plugin ("vite:storybook-inject-mocker-runtime") whenever
    // @vitest/browser is installed. The plugin serves a mocker entry that
    // bundles CJS packages referencing the `exports` global, causing
    // "exports is not defined" in story iframes outside of a Vitest run.
    // Strip the plugin so Storybook works without the Vitest browser runtime.
    const plugins = (config.plugins ?? []).flat().filter(
      (p) =>
        p && typeof p === "object" && "name" in p
          ? (p as { name: string }).name !== "vite:storybook-inject-mocker-runtime"
          : true
    );
    return { ...config, plugins };
  },
};
export default config;
