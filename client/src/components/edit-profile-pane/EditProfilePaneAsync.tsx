import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { EditProfilePane as EditProfilePaneType } from "./EditProfilePane.js";

export const EditProfilePaneAsync: LazyExoticComponent<typeof EditProfilePaneType> =
  lazyNamedExport(
    () => import(/* webpackChunkName: "EditProfilePane" */ "./EditProfilePane.js"),
    (m) => m.EditProfilePane
  );
