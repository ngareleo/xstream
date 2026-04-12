import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginReact } from "@rsbuild/plugin-react";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    pluginReact(),
    // Apply babel-plugin-relay so graphql template literals are compiled at build time.
    pluginBabel({
      include: /\.(?:ts|jsx|tsx)$/,
      babelLoaderOptions(opts) {
        opts.plugins ??= [];
        opts.plugins.unshift("relay");
      },
    }),
  ],

  source: {
    entry: { index: "./src/main.tsx" },
  },

  resolve: {
    // ~ → src/ — mirrors the tsconfig paths alias
    alias: {
      "~": path.resolve(dirname, "src"),
    },
  },

  html: {
    template: "./index.html",
  },

  server: {
    port: 5173,
    proxy: {
      "/graphql": { target: "http://localhost:3001", ws: true },
      "/stream": { target: "http://localhost:3001" },
    },
  },

  performance: {
    // Print each chunk's raw and gzip size after every production build.
    printFileSize: {
      total: true,
      detail: true,
      compressed: true,
    },

    // Generate an interactive HTML bundle report in CI. Output lands at
    // dist/stats.html, which the CI workflow uploads as an artifact.
    ...(process.env.CI
      ? {
          bundleAnalyze: {
            analyzerMode: "static",
            openAnalyzer: false,
            reportFilename: "stats.html",
          },
        }
      : {}),

    /**
     * Split vendor dependencies into stable, independently-cacheable chunks.
     * Grouping by library means a UI-only change doesn't bust the relay or
     * react cache, and vice versa.
     */
    chunkSplit: {
      strategy: "custom",
      splitChunks: {
        cacheGroups: {
          // Relay + GraphQL are tightly coupled; bundle them as one cacheable unit.
          relay: {
            test: /relay-runtime|react-relay|[/+]graphql[/+]/,
            name: "vendor-relay",
            chunks: "all" as const,
          },
          // React core + DOM + scheduler.
          react: {
            test: /[/+]react@|[/+]react-dom@|\/scheduler\//,
            name: "vendor-react",
            chunks: "all" as const,
          },
          // Remaining node_modules (Griffel, Nova, router, etc.)
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendor-misc",
            chunks: "all" as const,
            priority: -10,
          },
        },
      },
    },
  },
});
