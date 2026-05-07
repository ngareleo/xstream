/** Lazy-loaded page chunks for `router.tsx`. See docs/code-style/Client-Conventions/00-Patterns.md. */

import { lazy } from "react";

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
