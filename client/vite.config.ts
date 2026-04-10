import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["relay"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/graphql": "http://localhost:3001",
      "/stream": "http://localhost:3001",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
