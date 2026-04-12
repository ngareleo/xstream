import React, { type FC, lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";

import { AppShell } from "~/components/app-shell/AppShell.js";
import { ErrorBoundary } from "~/components/error-boundary/ErrorBoundary.js";
import {
  DashboardSkeleton,
  LibrarySkeleton,
  SettingsSkeleton,
  WatchlistSkeleton,
} from "~/components/page-skeleton/PageSkeleton.js";

const DashboardPage = lazy(
  () => import(/* webpackChunkName: "DashboardPage" */ "./pages/dashboard-page/DashboardPage.js")
);
const LibraryPage = lazy(
  () => import(/* webpackChunkName: "LibraryPage" */ "./pages/library-page/LibraryPage.js")
);
const WatchlistPage = lazy(
  () => import(/* webpackChunkName: "WatchlistPage" */ "./pages/watchlist-page/WatchlistPage.js")
);
const SettingsPage = lazy(() =>
  import(/* webpackChunkName: "SettingsPage" */ "./pages/settings-page/SettingsPage.js").then(
    (m) => ({ default: m.SettingsPage })
  )
);
const FeedbackPage = lazy(() =>
  import(/* webpackChunkName: "FeedbackPage" */ "./pages/feedback-page/FeedbackPage.js").then(
    (m) => ({ default: m.FeedbackPage })
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

function PageLoader(): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        color: "#444",
        fontSize: 13,
      }}
    />
  );
}

const ShellLayout: FC = () => (
  <AppShell>
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  </AppShell>
);

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <ShellLayout />,
    children: [
      {
        path: "/",
        element: (
          <Suspense fallback={<DashboardSkeleton />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: "/library",
        element: (
          <Suspense fallback={<LibrarySkeleton />}>
            <LibraryPage />
          </Suspense>
        ),
      },
      {
        path: "/watchlist",
        element: (
          <Suspense fallback={<WatchlistSkeleton />}>
            <WatchlistPage />
          </Suspense>
        ),
      },
      {
        path: "/settings",
        element: (
          <Suspense fallback={<SettingsSkeleton />}>
            <SettingsPage />
          </Suspense>
        ),
      },
      {
        path: "/feedback",
        element: (
          <Suspense fallback={<PageLoader />}>
            <FeedbackPage />
          </Suspense>
        ),
      },
      {
        path: "*",
        element: (
          <Suspense fallback={<PageLoader />}>
            <NotFoundPage />
          </Suspense>
        ),
      },
    ],
  },
  // Player is full-screen — no AppShell
  {
    path: "/play/:videoId",
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PlayerPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  {
    path: "/player/:videoId",
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <PlayerPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
  // Goodbye is full-screen — no AppShell
  {
    path: "/goodbye",
    element: (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <GoodbyePage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
]);
