import { Box, Spinner } from "@chakra-ui/react";
import { Suspense } from "react";
import { LibraryContent } from "./LibraryContent.js";

export function LibraryPage() {
  return (
    <Box maxW="1400px" mx="auto" p={8}>
      <Suspense fallback={<Spinner size="xl" />}>
        <LibraryContent />
      </Suspense>
    </Box>
  );
}
