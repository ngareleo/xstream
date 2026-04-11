import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["relay"],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
