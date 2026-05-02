import { afterEach, beforeEach } from "vitest";
import { setProjectAnnotations } from "@storybook/react-vite";

import * as previewAnnotations from "./preview.js";

// relay-test-utils is a Node.js library that references the `global` object.
// The Storybook vitest runner uses a browser context (Chromium) where `global`
// is not defined. Polyfill it before any story code runs.
if (typeof globalThis.global === "undefined") {
  (globalThis as Record<string, unknown>).global = globalThis;
}

// React 18 only enables act()'s automatic flushing when this flag is true.
// @storybook/addon-vitest's own setup file does not set it, which causes
// "current testing environment is not configured to support act(...)" warnings
// for any story whose render schedules a post-mount state update (NavLink
// active state, Suspense reveal, etc.). Setting it here lets composeStory()
// batch those updates correctly.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const annotations = setProjectAnnotations([previewAnnotations]);

beforeEach(annotations.beforeAll);

// Capture every console.error during a story test and surface them as a hard
// test failure. Without this, React render errors, missing-required-prop
// warnings, hook-rule violations, and similar regressions only print to the
// console — composeStory().run() never throws on them, so the vitest test
// stays green and CI lets broken stories ship. Stories that legitimately log
// (e.g., asserting an error toast) can opt out with parameters.expectConsoleErrors.
const originalConsoleError = console.error;
const capturedErrors: string[] = [];

const formatArg = (arg: unknown): string => {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

beforeEach(() => {
  capturedErrors.length = 0;
  console.error = (...args: unknown[]): void => {
    originalConsoleError(...args);
    capturedErrors.push(args.map(formatArg).join(" "));
  };
});

afterEach((ctx) => {
  console.error = originalConsoleError;
  if (capturedErrors.length === 0) return;

  const allowed =
    (ctx.task.meta as { storybook?: { parameters?: { expectConsoleErrors?: boolean } } })
      .storybook?.parameters?.expectConsoleErrors === true;
  if (allowed) {
    capturedErrors.length = 0;
    return;
  }

  const count = capturedErrors.length;
  const messages = capturedErrors.join("\n---\n");
  capturedErrors.length = 0;
  throw new Error(`Story logged ${count} console.error call(s):\n${messages}`);
});
