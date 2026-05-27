import { matchPath } from "react-router-dom";

import { ALL_ROUTE_PATHS } from "~/config/routePaths.js";

/** Collapses a pathname to its route template, e.g. `/player/abc123` → `/player/:videoId` (unknown paths → `/*`). */
export function routeTemplate(pathname: string): string {
  for (const template of ALL_ROUTE_PATHS) {
    if (matchPath(template, pathname)) return template;
  }
  return "/*";
}
