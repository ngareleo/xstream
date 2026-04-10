import { Box, Spinner } from "@chakra-ui/react";
import { type FC, Suspense } from "react";

import { LibraryContent } from "./LibraryContent.js";

export const LibraryPage: FC = () => {
  return (
    <Box maxW="1400px" mx="auto" p={8}>
      <Suspense fallback={<Spinner size="xl" />}>
        <LibraryContent />
      </Suspense>
    </Box>
  );
};
