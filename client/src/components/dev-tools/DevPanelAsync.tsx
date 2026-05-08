/**
 * DevPanelAsync — lazy-loaded wrapper around DevPanelInner.
 *
 * In dev builds (XSTREAM_VARIANT=dev): DevPanelInner is dynamically imported
 * into its own chunk, fetched lazily on first render.
 *
 * In prod builds: `IS_DEV_BUILD` is statically replaced with `false`, the
 * dynamic import lives in a dead branch, and Rspack drops the DevPanel
 * chunk file from the bundle entirely.
 */

import { type FC } from "react";

import { devChunk, NoopFC } from "~/utils/devChunk.js";

export const DevPanelAsync: FC = IS_DEV_BUILD
  ? devChunk(
      () => import(/* webpackChunkName: "DevPanel" */ "./DevPanel.js"),
      (m) => m.DevPanelInner
    )
  : NoopFC;
