import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const dirname =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["relay"],
      },
    }),
  ],
  resolve: {
    alias: {
      "~": path.resolve(dirname, "src"),
    },
  },
  // Mirror the Rsbuild `source.define` so module-level references to
  // IS_DEV_BUILD don't blow up under Vite/Rolldown. Tests always run as the
  // dev variant (full feature set).
  define: {
    IS_DEV_BUILD: "true",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
