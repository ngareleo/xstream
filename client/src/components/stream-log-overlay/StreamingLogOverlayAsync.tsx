/**
 * StreamingLogOverlayAsync — lazy-loaded wrapper around StreamingLogOverlay.
 *
 * In development: dynamically imported into its own chunk so it is excluded
 * from the initial bundle.
 *
 * In production: the conditional is statically replaced by the bundler,
 * the dynamic import becomes dead code, and tree-shaking removes it entirely.
 */

import { type FC, type LazyExoticComponent, Suspense } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { StreamingLogOverlay as StreamingLogOverlayType } from "./StreamingLogOverlay.js";

const Inner: LazyExoticComponent<typeof StreamingLogOverlayType> = lazyNamedExport(
  () => import(/* webpackChunkName: "StreamingLogOverlay" */ "./StreamingLogOverlay.js"),
  (m) => m.StreamingLogOverlay
);

const StreamingLogOverlayLazy: FC = () => (
  <Suspense fallback={null}>
    <Inner />
  </Suspense>
);

const Noop: FC = () => null;

export const StreamingLogOverlayAsync: FC =
  process.env.NODE_ENV !== "production" ? StreamingLogOverlayLazy : Noop;
