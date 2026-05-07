/**
 * Lazy-loaded page chunks for the React Router config in `router.tsx`.
 *
 * Every route lazy-imports its page so the initial bundle stays small.
 * Each `lazy(() => import(...))` carries an explicit `webpackChunkName`
 * so the resulting chunks have stable, human-readable names in network
 * panels, source maps, and the rsbuild build manifest — useful when a
 * specific page is the suspected cause of a slow first paint.
 *
 * Two import shapes are in use:
 *
 *   1. **Default-exported pages** — `lazy(() => import("./X.js"))`.
 *   2. **Named-exported pages** — wrap with
 *      `.then((m) => ({ default: m.X }))` because `lazy` requires the
 *      resolved module to have a `default` export.
 *
 * Order below: shelled pages (under `<AppShell>`), then full-screen
 * solo routes, then unauthenticated auth pages.
 */

import { lazy } from "react";

// ── Shelled pages (children of <ShellLayout> in router.tsx) ──────────

export const HomePage = lazy(
  () => import(/* webpackChunkName: "HomePage" */ "./pages/homepage/HomePage.js")
);

export const ProfilesPage = lazy(
  () => import(/* webpackChunkName: "ProfilesPage" */ "./pages/profiles-page/ProfilesPage.js")
);

export const CreateProfilePage = lazy(
  () =>
    import(
      /* webpackChunkName: "CreateProfilePage" */ "./pages/create-profile-page/CreateProfilePage.js"
    )
);

export const EditProfilePage = lazy(
  () =>
    import(/* webpackChunkName: "EditProfilePage" */ "./pages/edit-profile-page/EditProfilePage.js")
);

export const WatchlistPage = lazy(
  () => import(/* webpackChunkName: "WatchlistPage" */ "./pages/watchlist-page/WatchlistPage.js")
);

export const SettingsPage = lazy(() =>
  import(/* webpackChunkName: "SettingsPage" */ "./pages/settings-page/SettingsPage.js").then(
    (m) => ({ default: m.SettingsPage })
  )
);

export const NotFoundPage = lazy(() =>
  import(/* webpackChunkName: "NotFoundPage" */ "./pages/not-found-page/NotFoundPage.js").then(
    (m) => ({ default: m.NotFoundPage })
  )
);

// ── Full-screen solo routes (bypass <AppShell>) ──────────────────────

export const PlayerPage = lazy(() =>
  import(/* webpackChunkName: "PlayerPage" */ "./pages/player-page/PlayerPage.js").then((m) => ({
    default: m.PlayerPage,
  }))
);

export const GoodbyePage = lazy(
  () => import(/* webpackChunkName: "GoodbyePage" */ "./pages/goodbye-page/GoodbyePage.js")
);

export const ErrorPage = lazy(
  () => import(/* webpackChunkName: "ErrorPage" */ "./pages/error-page/ErrorPage.js")
);

// ── Unauthenticated auth pages (children of <AuthLayout>) ────────────

export const SignInPage = lazy(
  () => import(/* webpackChunkName: "SignInPage" */ "./pages/signin-page/SignInPage.js")
);

export const SignUpPage = lazy(
  () => import(/* webpackChunkName: "SignUpPage" */ "./pages/signup-page/SignUpPage.js")
);

export const ResetPasswordPage = lazy(
  () =>
    import(
      /* webpackChunkName: "ResetPasswordPage" */ "./pages/reset-password-page/ResetPasswordPage.js"
    )
);
