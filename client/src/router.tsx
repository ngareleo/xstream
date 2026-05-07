import { type FC, lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AppShell } from "~/components/app-shell/AppShell.js";
import { AuthLayout } from "~/components/auth-layout/AuthLayout.js";
import { ErrorBoundary } from "~/components/error-boundary/ErrorBoundary.js";

const HomePage = lazy(
  () => import(/* webpackChunkName: "HomePage" */ "./pages/homepage/HomePage.js")
);
const ProfilesPage = lazy(
  () => import(/* webpackChunkName: "ProfilesPage" */ "./pages/profiles-page/ProfilesPage.js")
);
const CreateProfilePage = lazy(
  () =>
    import(
      /* webpackChunkName: "CreateProfilePage" */ "./pages/create-profile-page/CreateProfilePage.js"
    )
);
const EditProfilePage = lazy(
  () =>
    import(/* webpackChunkName: "EditProfilePage" */ "./pages/edit-profile-page/EditProfilePage.js")
);
const WatchlistPage = lazy(
  () => import(/* webpackChunkName: "WatchlistPage" */ "./pages/watchlist-page/WatchlistPage.js")
);
const SettingsPage = lazy(() =>
  import(/* webpackChunkName: "SettingsPage" */ "./pages/settings-page/SettingsPage.js").then(
    (m) => ({ default: m.SettingsPage })
  )
);
const PlayerPage = lazy(() =>
  import(/* webpackChunkName: "PlayerPage" */ "./pages/player-page/PlayerPage.js").then((m) => ({
    default: m.PlayerPage,
  }))
);
const NotFoundPage = lazy(() =>
  import(/* webpackChunkName: "NotFoundPage" */ "./pages/not-found-page/NotFoundPage.js").then(
    (m) => ({ default: m.NotFoundPage })
  )
);
const GoodbyePage = lazy(
  () => import(/* webpackChunkName: "GoodbyePage" */ "./pages/goodbye-page/GoodbyePage.js")
);
const ErrorPage = lazy(
  () => import(/* webpackChunkName: "ErrorPage" */ "./pages/error-page/ErrorPage.js")
);
const SignInPage = lazy(
  () => import(/* webpackChunkName: "SignInPage" */ "./pages/signin-page/SignInPage.js")
);
const SignUpPage = lazy(
  () => import(/* webpackChunkName: "SignUpPage" */ "./pages/signup-page/SignUpPage.js")
);
const ResetPasswordPage = lazy(
  () =>
    import(
      /* webpackChunkName: "ResetPasswordPage" */ "./pages/reset-password-page/ResetPasswordPage.js"
    )
);

const ShellLayout: FC = () => (
  <AppShell>
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  </AppShell>
);

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <ShellLayout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/profiles", element: <ProfilesPage /> },
      { path: "/profiles/new", element: <CreateProfilePage /> },
      { path: "/profiles/:profileId/edit", element: <EditProfilePage /> },
      { path: "/watchlist", element: <WatchlistPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "/player/:videoId",
    element: (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <PlayerPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    path: "/goodbye",
    element: (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <GoodbyePage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    path: "/error",
    element: (
      <Suspense fallback={null}>
        <ErrorPage />
      </Suspense>
    ),
  },
  {
    element: (
      <ErrorBoundary>
        <Suspense fallback={null}>
          <AuthLayout />
        </Suspense>
      </ErrorBoundary>
    ),
    children: [
      {
        path: "/signin",
        element: (
          <Suspense fallback={null}>
            <SignInPage />
          </Suspense>
        ),
      },
      {
        path: "/signup",
        element: (
          <Suspense fallback={null}>
            <SignUpPage />
          </Suspense>
        ),
      },
      {
        path: "/reset-password",
        element: (
          <Suspense fallback={null}>
            <ResetPasswordPage />
          </Suspense>
        ),
      },
    ],
  },
]);
