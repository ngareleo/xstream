import { type FC } from "react";

import { devChunk, NoopFC } from "~/utils/devChunk.js";

export const FlagsTabAsync: FC = IS_DEV_BUILD
  ? devChunk(
      () => import(/* webpackChunkName: "FlagsTab" */ "./FlagsTab.js"),
      (m) => m.FlagsTab
    )
  : NoopFC;
