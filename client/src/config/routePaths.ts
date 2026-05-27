/** Single source of truth for the app's route path templates, consumed by the router and route-template normalization. */
export const ROUTE_PATHS = {
  home: "/",
  profiles: "/profiles",
  profilesNew: "/profiles/new",
  profileEdit: "/profiles/:profileId/edit",
  watchlist: "/watchlist",
  settings: "/settings",
  player: "/player/:videoId",
  goodbye: "/goodbye",
  errorPage: "/error",
  signin: "/signin",
  signup: "/signup",
  resetPassword: "/reset-password",
} as const;

export type RoutePath = (typeof ROUTE_PATHS)[keyof typeof ROUTE_PATHS];

/** Every route template, for matching a concrete pathname back to its template. */
export const ALL_ROUTE_PATHS: readonly RoutePath[] = Object.values(ROUTE_PATHS);
