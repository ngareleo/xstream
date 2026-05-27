import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Standalone config for the bundle-size gate — it reads production dist/, so it
// runs separately from the unit suite (after `bun run build`).
export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // The beforeAll fallback can trigger a full production build on a cold
    // local checkout; give it room.
    hookTimeout: 300_000,
  },
});
