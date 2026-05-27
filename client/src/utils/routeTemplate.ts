const STATIC_ROUTES = new Set([
  "/",
  "/profiles",
  "/profiles/new",
  "/watchlist",
  "/settings",
  "/signin",
  "/signup",
  "/reset-password",
  "/goodbye",
  "/error",
]);

/** Collapses a pathname to a low-cardinality route template, e.g. `/player/abc123` → `/player/:videoId` (unknown paths → `/*`). */
export function routeTemplate(pathname: string): string {
  if (/^\/player\/[^/]+$/.test(pathname)) return "/player/:videoId";
  if (/^\/profiles\/[^/]+\/edit$/.test(pathname)) return "/profiles/:profileId/edit";
  return STATIC_ROUTES.has(pathname) ? pathname : "/*";
}
