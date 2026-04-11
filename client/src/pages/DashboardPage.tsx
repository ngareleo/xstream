import React, { type FC, Suspense } from "react";

import { DashboardSkeleton } from "~/components/page-skeleton/PageSkeleton.js";

import { DashboardPageContent } from "./DashboardPageContent.js";

const DashboardPage: FC = () => (
  <Suspense fallback={<DashboardSkeleton />}>
    <DashboardPageContent />
  </Suspense>
);

export default DashboardPage;
