/**
 * DevPanelAsync — lazy-loaded wrapper around DevPanelInner.
 *
 * In dev builds (XSTREAM_VARIANT=dev): DevPanelInner is dynamically imported
 * into its own chunk, fetched lazily on first render.
 *
 * In prod builds: PUBLIC_XSTREAM_DEV_FEATURES is statically replaced with
 * "false" by Rspack's DefinePlugin during parsing, the ternary collapses
 * before the dynamic import is registered, and Rspack drops the DevPanel
 * chunk file from the bundle entirely.
 *
 * The literal `process.env.PUBLIC_XSTREAM_DEV_FEATURES === "true"` MUST be
 * inlined at the call site — importing IS_DEV_BUILD from devChunk.ts breaks
 * chunk-level dead-code elimination, since cross-module const propagation
 * runs after dynamic imports have already been registered as chunks.
 */

import { type FC } from "react";

import { NoopFC, wrapDevImport } from "~/utils/devChunk.js";

export const DevPanelAsync: FC =
  process.env.PUBLIC_XSTREAM_DEV_FEATURES === "true"
    ? wrapDevImport(
        () => import(/* webpackChunkName: "DevPanel" */ "./DevPanel.js"),
        (m) => m.DevPanelInner
      )
    : NoopFC;
