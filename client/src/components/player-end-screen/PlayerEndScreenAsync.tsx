import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { PlayerEndScreen as PlayerEndScreenType } from "./PlayerEndScreen.js";

export const PlayerEndScreenAsync: LazyExoticComponent<typeof PlayerEndScreenType> =
  lazyNamedExport(
    () => import(/* webpackChunkName: "PlayerEndScreen" */ "./PlayerEndScreen.js"),
    (m) => m.PlayerEndScreen
  );
