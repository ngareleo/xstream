import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { NewProfilePane as NewProfilePaneType } from "./NewProfilePane.js";

export const NewProfilePaneAsync: LazyExoticComponent<typeof NewProfilePaneType> = lazyNamedExport(
  () => import("./NewProfilePane.js"),
  (m) => m.NewProfilePane
);
