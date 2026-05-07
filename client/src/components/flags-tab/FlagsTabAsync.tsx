import { type FC } from "react";

import { NoopFC, wrapDevImport } from "~/utils/devChunk.js";

// Inline `process.env.PUBLIC_XSTREAM_DEV_FEATURES === "true"` — see
// `devChunk.tsx` for why importing IS_DEV_BUILD doesn't strip the chunk.
export const FlagsTabAsync: FC =
  process.env.PUBLIC_XSTREAM_DEV_FEATURES === "true"
    ? wrapDevImport(
        () => import(/* webpackChunkName: "FlagsTab" */ "./FlagsTab.js"),
        (m) => m.FlagsTab
      )
    : NoopFC;
