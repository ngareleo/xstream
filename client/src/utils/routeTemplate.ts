/**
 * Collapses a concrete pathname to a low-cardinality route template so telemetry
 * (page-visit metrics, feedback routes) groups cleanly — e.g. `/player/abc123`
 * → `/player/:videoId`. Unknown paths (404s) fold to `/*`.
 */

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

export function routeTemplate(pathname: string): string {
  if (/^\/player\/[^/]+$/.test(pathname)) return "/player/:videoId";
  if (/^\/profiles\/[^/]+\/edit$/.test(pathname)) return "/profiles/:profileId/edit";
  return STATIC_ROUTES.has(pathname) ? pathname : "/*";
}
