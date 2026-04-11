import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { VideoDetailsPanel as VideoDetailsPanelType } from "./VideoDetailsPanel.js";

export const VideoDetailsPanelAsync: LazyExoticComponent<typeof VideoDetailsPanelType> =
  lazyNamedExport(
    () => import("./VideoDetailsPanel.js"),
    (m) => m.VideoDetailsPanel
  );
