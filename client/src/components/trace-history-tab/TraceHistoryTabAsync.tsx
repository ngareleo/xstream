import { type FC } from "react";

import { devChunk, NoopFC } from "~/utils/devChunk.js";

export const TraceHistoryTabAsync: FC = IS_DEV_BUILD
  ? devChunk(
      () => import(/* webpackChunkName: "TraceHistoryTab" */ "./TraceHistoryTab.js"),
      (m) => m.TraceHistoryTab
    )
  : NoopFC;
