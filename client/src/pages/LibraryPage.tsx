import React, { type FC, Suspense } from "react";

import { LibrarySkeleton } from "~/components/page-skeleton/PageSkeleton.js";

import { LibraryPageContent } from "./LibraryPageContent.js";

export const LibraryPage: FC = () => (
  <Suspense fallback={<LibrarySkeleton />}>
    <LibraryPageContent />
  </Suspense>
);
