import { beforeAll } from "vitest";
import { setProjectAnnotations } from "@storybook/react-vite";

import * as previewAnnotations from "./preview.js";

// relay-test-utils is a Node.js library that references the `global` object.
// The Storybook vitest runner uses a browser context (Chromium) where `global`
// is not defined. Polyfill it before any story code runs.
if (typeof globalThis.global === "undefined") {
  (globalThis as Record<string, unknown>).global = globalThis;
}

const annotations = setProjectAnnotations([previewAnnotations]);

beforeAll(annotations.beforeAll);
