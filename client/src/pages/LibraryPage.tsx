import { Box, Spinner } from "@chakra-ui/react";
import React, { type FC, Suspense } from "react";

import { LibraryPageContent } from "./LibraryPageContent.js";

export const LibraryPage: FC = () => {
  return (
    <Suspense
      fallback={
        <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
          <Spinner size="xl" />
        </Box>
      }
    >
      <LibraryPageContent />
    </Suspense>
  );
};
