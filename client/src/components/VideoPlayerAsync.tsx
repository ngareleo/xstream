import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "../utils/lazy.js";
import type { VideoPlayer as VideoPlayerType } from "./VideoPlayer.js";

export const VideoPlayer: LazyExoticComponent<typeof VideoPlayerType> = lazyNamedExport(
  () => import("./VideoPlayer.js"),
  (m) => m.VideoPlayer
);
