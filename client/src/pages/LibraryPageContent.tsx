import { Box, Spinner, Text } from "@chakra-ui/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, useCallback, useMemo, useRef, useState, useTransition } from "react";
import { graphql, useLazyLoadQuery, useSubscription } from "react-relay";

import { AppHeader } from "../components/AppHeader.js";
import { LibraryGrid } from "../components/LibraryGrid.js";
import {
  isLibraryRailSelectedEvent,
  type LibraryRailSelectedData,
} from "../components/LibraryRail.events.js";
import { LibraryRail } from "../components/LibraryRail.js";
import type { LibraryPageContentQuery } from "../relay/__generated__/LibraryPageContentQuery.graphql.js";
import type { LibraryPageContentScanSubscription } from "../relay/__generated__/LibraryPageContentScanSubscription.graphql.js";

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

const SCAN_SUBSCRIPTION = graphql`
  subscription LibraryPageContentScanSubscription {
    libraryScanUpdated {
      scanning
    }
  }
`;

export const LibraryPageContent: FC = () => {
  const [scanning, setScanning] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const [, startTransition] = useTransition();
  // Track previous scanning state so we only refetch on a true → false
  // transition, not on the initial subscription payload when the server is idle.
  const wasScanning = useRef(false);

  const scanConfig = useMemo(
    () => ({
      subscription: SCAN_SUBSCRIPTION,
      variables: {},
      onNext: (response: LibraryPageContentScanSubscription["response"] | null | undefined) => {
        const isScanning = response?.libraryScanUpdated?.scanning ?? false;
        setScanning(isScanning);
        if (wasScanning.current && !isScanning) {
          // Defer the refetch so the UI keeps showing current data while
          // Relay loads the updated library list in the background
          startTransition(() => {
            setFetchKey((k) => k + 1);
          });
        }
        wasScanning.current = isScanning;
      },
      onError: () => {},
    }),
    []
  );

  useSubscription<LibraryPageContentScanSubscription>(scanConfig);

  const data = useLazyLoadQuery<LibraryPageContentQuery>(
    LIBRARY_QUERY,
    {},
    { fetchKey, fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network" }
  );

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
              <Box display="flex" alignItems="center" gap={3} mb={6}>
                <Text fontSize="xl" fontWeight="bold" color="white">
                  {selectedLibrary.name}
                </Text>
                {scanning && <Spinner size="sm" color="orange.400" />}
              </Box>
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
