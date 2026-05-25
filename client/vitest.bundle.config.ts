import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Standalone config for the bundle-size gate. Kept separate from
// vitest.config.ts (which globs `src/**/*.test.ts`) because this gate asserts
// against production build output in `dist/` and must run *after* `bun run
// build` — see the `test:bundle-size` script and the CI client job.
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
