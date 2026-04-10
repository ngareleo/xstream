import { Box, Spinner } from "@chakra-ui/react";
import React, { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";

const ProfilesPage = lazy(() =>
  import("./pages/ProfilesPage.js").then((m) => ({ default: m.ProfilesPage }))
);
const PlayerPage = lazy(() =>
  import("./pages/PlayerPage.js").then((m) => ({ default: m.PlayerPage }))
);
const SetupPage = lazy(() =>
  import("./pages/SetupPage.js").then((m) => ({ default: m.SetupPage }))
);
const LibraryPage = lazy(() =>
  import("./pages/LibraryPage.js").then((m) => ({ default: m.LibraryPage }))
);

function PageLoader(): JSX.Element {
  return (
    <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
      <Spinner size="xl" />
    </Box>
  );
}

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense fallback={<PageLoader />}>
        <ProfilesPage />
      </Suspense>
    ),
  },
  {
    path: "/setup",
    element: (
      <Suspense fallback={<PageLoader />}>
        <SetupPage />
      </Suspense>
    ),
  },
  {
    path: "/library",
    element: (
      <Suspense fallback={<PageLoader />}>
        <LibraryPage />
      </Suspense>
    ),
  },
  {
    path: "/play/:videoId",
    element: (
      <Suspense fallback={<PageLoader />}>
        <PlayerPage />
      </Suspense>
    ),
  },
]);
