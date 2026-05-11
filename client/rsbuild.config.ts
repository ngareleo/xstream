import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginReact } from "@rsbuild/plugin-react";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Dev-only proxy target for the Axiom relay. The browser can't POST OTLP
// directly to `*.axiom.co` from a `http://localhost:5173` origin (CORS), so
// when `flag.useAxiomExporter` is ON the client posts to same-origin
// `/relay/axiom/v1/...` and Rsbuild forwards server-to-server to whatever
// host PUBLIC_OTEL_AXIOM_ENDPOINT points at (loaded from repo-root .env via
// the dev script).
const AXIOM_PROXY_TARGET = process.env.PUBLIC_OTEL_AXIOM_ENDPOINT ?? "https://api.axiom.co";

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
    // Bare-identifier global substituted by Rspack's DefinePlugin during
    // parsing. Any `if (IS_DEV_BUILD)` / `IS_DEV_BUILD ? … : …` branch becomes
    // statically dead in prod, so dynamic `import()` calls inside the dead
    // branch are dropped before chunks are emitted.
    //
    // Declared as a global in `src/types/env.d.ts` so call sites don't need
    // to import anything to reference it.
    define: {
      IS_DEV_BUILD: JSON.stringify(process.env.XSTREAM_VARIANT === "dev"),
    },
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
      // Forward client OTLP telemetry to local Seq — avoids CORS issues in dev.
      // In production the client bundle is configured to POST directly to the
      // cloud OTLP endpoint (e.g. Axiom) via PUBLIC_OTEL_ENDPOINT.
      "/ingest/otlp": { target: "http://localhost:5341", changeOrigin: true },
      // Axiom relay (dev only). Browser POSTs to same-origin /relay/axiom/v1/...
      // so there is no CORS preflight; Rsbuild forwards to AXIOM_PROXY_TARGET
      // server-to-server with the Authorization + X-Axiom-Dataset headers from
      // the client bundle. See docs/architecture/Deployment/04-Axiom-Production-Backend.md
      // § "Dev flow".
      "/relay/axiom": {
        target: AXIOM_PROXY_TARGET,
        changeOrigin: true,
        pathRewrite: { "^/relay/axiom": "" },
      },
      "/stream": {
        target: "http://localhost:3001",
        // Streaming responses are long-lived — disable proxy timeout so the
        // connection isn't killed before init.mp4 is written (ffprobe can take
        // 10+ seconds on large 4K files before the first byte is sent).
        proxyTimeout: 0,
        timeout: 0,
      },
    },
  },

  tools: {
    rspack: {
      optimization: {
        // Name the Rspack runtime chunk so it shows up as "runtime" in bundle
        // analysis instead of an anonymous numeric ID.
        runtimeChunk: { name: "runtime" },
      },
    },
  },

  performance: {
    // Print each chunk's raw and gzip size after every production build.
    printFileSize: {
      total: true,
      detail: true,
      compressed: true,
    },

    // Generate an interactive HTML bundle report in CI (uploaded as an
    // artifact) or on demand locally via `bun run analyze`
    // (BUNDLE_ANALYZE=1). Output lands at dist/stats.html. Local runs open
    // the report in a browser; CI stays headless.
    ...(process.env.CI || process.env.BUNDLE_ANALYZE
      ? {
          bundleAnalyze: {
            analyzerMode: "static",
            openAnalyzer: !process.env.CI,
            reportFilename: "stats.html",
          },
        }
      : {}),

    /**
     * Split vendor dependencies into stable, independently-cacheable chunks
     * grouped by upgrade cadence — libraries that version together live in
     * the same chunk so one dependency bump invalidates as little as possible.
     *
     * When adding a new heavy dependency, give it its own group if its
     * upgrade cadence is independent of an existing group; otherwise extend
     * the closest match. vendor-misc is the residual bucket for small,
     * unrelated libraries — anything growing past ~50 KB there deserves its
     * own group.
     */
    chunkSplit: {
      strategy: "custom",
      splitChunks: {
        cacheGroups: {
          // Relay + GraphQL runtime + WS transport — the data layer.
          relay: {
            test: /relay-runtime|react-relay|[\\/]graphql[\\/]|[\\/]graphql-ws[\\/]/,
            name: "vendor-relay",
            chunks: "all" as const,
          },
          // React core + DOM + scheduler. The `node_modules/<pkg>/` anchor
          // avoids colliding with bun's outer `@scope+react@ver` directories
          // (e.g. `@nova+react@…`) which would otherwise absorb scoped
          // packages whose name contains `react`.
          react: {
            test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
            name: "vendor-react",
            chunks: "all" as const,
          },
          // OpenTelemetry (api + sdk + exporters + instrumentations).
          otel: {
            test: /[\\/]@opentelemetry[\\/]/,
            name: "vendor-otel",
            chunks: "all" as const,
          },
          // Atomic CSS-in-JS runtime.
          griffel: {
            test: /[\\/]@griffel[\\/]/,
            name: "vendor-griffel",
            chunks: "all" as const,
          },
          // Nova eventing runtime. `enforce` overrides the default minSize
          // threshold — @nova is small (<10 KB) but upgrades on its own
          // cadence, so a dedicated chunk is worth one extra HTTP request.
          nova: {
            test: /[\\/]@nova[\\/]/,
            name: "vendor-nova",
            chunks: "all" as const,
            enforce: true,
          },
          // React Router + its history/remix dependencies.
          router: {
            test: /[\\/](?:react-router|react-router-dom|@remix-run[\\/]router|history)[\\/]/,
            name: "vendor-router",
            chunks: "all" as const,
          },
          // Residual node_modules — small, unrelated libs (react-localization, etc.).
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendor-misc",
            chunks: "all" as const,
            priority: -10,
          },
          // App source modules shared by 2+ async page/component chunks.
          // Without this, Rspack auto-generates an anonymous numeric chunk.
          shared: {
            name: "shared",
            minChunks: 2,
            chunks: "async" as const,
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      },
    },
  },
});
