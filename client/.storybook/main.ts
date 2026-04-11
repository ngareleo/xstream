import type { StorybookConfig } from "storybook-react-rsbuild";
import { pluginBabel } from "@rsbuild/plugin-babel";

import { dirname, resolve } from "path";
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
    // @imchhh/storybook-addon-relay is NOT listed here — it ships CJS-only and
    // is re-implemented in ESM at src/storybook/withRelay.tsx.
    getAbsolutePath("@chromatic-com/storybook"),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-docs"),
    getAbsolutePath("@storybook/addon-onboarding"),
    getAbsolutePath("@storybook/addon-vitest"),
  ],
  framework: {
    name: getAbsolutePath("storybook-react-rsbuild") as "storybook-react-rsbuild",
    options: {},
  },
  rsbuildFinal(config) {
    // Apply babel-plugin-relay so graphql template literals in story and
    // component files are transformed at build time.
    config.plugins ??= [];
    config.plugins.push(
      pluginBabel({
        babelLoaderOptions: {
          plugins: ["relay"],
        },
      })
    );

    // Mirror the ~ → src/ alias from rsbuild.config.ts so story imports resolve.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    config.source ??= {};
    (config.source.alias as Record<string, string>)["~"] = resolve(__dirname, "../src");

    return config;
  },
};

export default config;
