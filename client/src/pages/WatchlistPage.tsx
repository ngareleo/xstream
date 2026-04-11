import React, { type FC, Suspense } from "react";

import { WatchlistSkeleton } from "~/components/page-skeleton/PageSkeleton.js";

import { WatchlistPageContent } from "./WatchlistPageContent.js";

const WatchlistPage: FC = () => (
  <Suspense fallback={<WatchlistSkeleton />}>
    <WatchlistPageContent />
  </Suspense>
);

export default WatchlistPage;
