import { Box, Spinner } from "@chakra-ui/react";
import React, { type FC, Suspense } from "react";

import { ProfilesPageContent } from "./ProfilesPageContent.js";

export const ProfilesPage: FC = () => {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
          <Spinner size="xl" />
        </Box>
      }
    >
      <ProfilesPageContent />
    </Suspense>
  );
};
