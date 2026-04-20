import { type FC, Suspense } from "react";

import { SettingsSkeleton } from "~/components/page-skeleton/PageSkeleton.js";

import { SettingsPageContent } from "./SettingsPageContent.js";

export const SettingsPage: FC = () => (
  <Suspense fallback={<SettingsSkeleton />}>
    <SettingsPageContent />
  </Suspense>
);
