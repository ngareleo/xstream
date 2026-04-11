import type { LazyExoticComponent } from "react";

import { lazyNamedExport } from "~/utils/lazy.js";

import type { FilmDetailPane as FilmDetailPaneType } from "./FilmDetailPane.js";

export const FilmDetailPaneAsync: LazyExoticComponent<typeof FilmDetailPaneType> = lazyNamedExport(
  () => import("./FilmDetailPane.js"),
  (m) => m.FilmDetailPane
);
