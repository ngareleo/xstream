import { type FC } from "react";

import { devChunk, NoopFC } from "~/utils/devChunk.js";

// IS_DEV_BUILD ternary required for chunk stripping — see docs/architecture/Deployment/03-Build-Variants.md.
export const DevPanelAsync: FC = IS_DEV_BUILD
  ? devChunk(
      () => import(/* webpackChunkName: "DevPanel" */ "./DevPanel.js"),
      (m) => m.DevPanelInner
    )
  : NoopFC;
