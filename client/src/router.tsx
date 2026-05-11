import { type FC, Suspense } from "react";
import { createBrowserRouter, Outlet, redirect } from "react-router-dom";

import { AppShell } from "~/components/app-shell/AppShell.js";
import { AuthLayout } from "~/components/auth-layout/AuthLayout.js";
import { ErrorBoundary } from "~/components/error-boundary/ErrorBoundary.js";
import { getSession } from "~/services/auth.js";

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

async function requireSession(): Promise<Response | null> {
  const session = await getSession();
  return session ? null : redirect("/signin");
}

async function requireSignedOut(): Promise<Response | null> {
  const session = await getSession();
  return session ? redirect("/") : null;
}

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <ShellLayout />,
    loader: requireSession,
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
    loader: requireSignedOut,
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
