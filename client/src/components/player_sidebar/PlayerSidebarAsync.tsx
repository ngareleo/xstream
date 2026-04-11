import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { PlayerSidebar as PlayerSidebarType } from "./PlayerSidebar.js";

export const PlayerSidebarAsync: LazyExoticComponent<typeof PlayerSidebarType> = lazyNamedExport(
  () => import("./PlayerSidebar.js"),
  (m) => m.PlayerSidebar
);
