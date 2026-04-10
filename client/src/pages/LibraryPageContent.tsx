import { Box, Text } from "@chakra-ui/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, useCallback, useState } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";

import { AppHeader } from "../components/AppHeader.js";
import { LibraryGrid } from "../components/LibraryGrid.js";
import {
  isLibraryRailSelectedEvent,
  type LibraryRailSelectedData,
} from "../components/LibraryRail.events.js";
import { LibraryRail } from "../components/LibraryRail.js";
import type { LibraryPageContentQuery } from "../relay/__generated__/LibraryPageContentQuery.graphql.js";

const LIBRARY_QUERY = graphql`
  query LibraryPageContentQuery {
    libraries {
      id
      name
      ...LibraryRail_library
      ...LibraryGrid_library
    }
  }
`;

export const LibraryPageContent: FC = () => {
  const data = useLazyLoadQuery<LibraryPageContentQuery>(LIBRARY_QUERY, {});
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    data.libraries[0]?.id ?? null
  );

  const selectedLibrary = data.libraries.find((l) => l.id === selectedLibraryId) ?? null;

  const interceptor = useCallback(
    async (wrapper: EventWrapper, _forward: (e: EventWrapper) => Promise<void>) => {
      if (isLibraryRailSelectedEvent(wrapper) && wrapper.event.data) {
        const { libraryId } = wrapper.event.data() as LibraryRailSelectedData;
        setSelectedLibraryId(libraryId);
      }
      return wrapper;
    },
    []
  );

  return (
    <Box display="flex" flexDir="column" h="100vh" bg="gray.950">
      <AppHeader />

      <NovaEventingInterceptor interceptor={interceptor}>
        <Box display="flex" flex={1} overflow="hidden">
          {/* Narrow icon rail */}
          <LibraryRail libraries={data.libraries} selectedLibraryId={selectedLibraryId} />

          {/* Main content */}
          {selectedLibrary ? (
            <Box flex={1} overflowY="auto" p={8}>
              <Text fontSize="xl" fontWeight="bold" color="white" mb={6}>
                {selectedLibrary.name}
              </Text>
              <LibraryGrid library={selectedLibrary} />
            </Box>
          ) : (
            <Box
              flex={1}
              display="flex"
              flexDir="column"
              alignItems="center"
              justifyContent="center"
              gap={4}
            >
              <Text fontSize="xl" fontWeight="bold" color="white">
                No libraries found
              </Text>
              <Text fontSize="sm" color="gray.500" textAlign="center" maxW="280px">
                Add entries to your{" "}
                <Text as="span" color="orange.400" fontFamily="mono" fontSize="xs">
                  mediaFiles.json
                </Text>{" "}
                to get started
              </Text>
            </Box>
          )}
        </Box>
      </NovaEventingInterceptor>
    </Box>
  );
};
