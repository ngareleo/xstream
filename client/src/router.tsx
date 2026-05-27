import { type FC, Suspense } from "react";
import { createBrowserRouter, Outlet, redirect } from "react-router-dom";

import { AppShell } from "~/components/app-shell/AppShell.js";
import { AuthLayout } from "~/components/auth-layout/AuthLayout.js";
import { ErrorBoundary } from "~/components/error-boundary/ErrorBoundary.js";
import { TelemetryTracker } from "~/components/telemetry-tracker/TelemetryTracker.js";
import { ROUTE_PATHS } from "~/config/routePaths.js";
import { hasActiveSession } from "~/services/userContext.js";

import {
  CreateProfilePage,
  EditProfilePage,
  ErrorPage,
  GoodbyePage,
  HomePage,
  NotFoundPage,
  PlayerPage,
  ProfilesPage,
  ResetPasswordPage,
  SettingsPage,
  SignInPage,
  SignUpPage,
  WatchlistPage,
} from "./lazy-pages.js";

const ShellLayout: FC = () => (
  <AppShell>
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  </AppShell>
);

// Pathless root layout — mounts once and persists across all navigation, so the
// telemetry tracker observes every page (incl. auth pages, which sit outside the
// AppShell). Renders nothing of its own beyond the matched child route.
const RootLayout: FC = () => (
  <>
    <TelemetryTracker />
    <Outlet />
  </>
);

function requireSession(): Response | null {
  return hasActiveSession() ? null : redirect("/signin");
}

function requireSignedOut(): Response | null {
  return hasActiveSession() ? redirect("/") : null;
}

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <ShellLayout />,
        loader: requireSession,
        children: [
          { path: ROUTE_PATHS.home, element: <HomePage /> },
          { path: ROUTE_PATHS.profiles, element: <ProfilesPage /> },
          { path: ROUTE_PATHS.profilesNew, element: <CreateProfilePage /> },
          { path: ROUTE_PATHS.profileEdit, element: <EditProfilePage /> },
          { path: ROUTE_PATHS.watchlist, element: <WatchlistPage /> },
          { path: ROUTE_PATHS.settings, element: <SettingsPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      {
        path: ROUTE_PATHS.player,
        loader: requireSession,
        element: (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <PlayerPage />
            </Suspense>
          </ErrorBoundary>
        ),
      },
      {
        path: ROUTE_PATHS.goodbye,
        element: (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <GoodbyePage />
            </Suspense>
          </ErrorBoundary>
        ),
      },
      {
        path: ROUTE_PATHS.errorPage,
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
        loader: requireSignedOut,
        children: [
          {
            path: ROUTE_PATHS.signin,
            element: (
              <Suspense fallback={null}>
                <SignInPage />
              </Suspense>
            ),
          },
          {
            path: ROUTE_PATHS.signup,
            element: (
              <Suspense fallback={null}>
                <SignUpPage />
              </Suspense>
            ),
          },
          {
            path: ROUTE_PATHS.resetPassword,
            element: (
              <Suspense fallback={null}>
                <ResetPasswordPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
]);
