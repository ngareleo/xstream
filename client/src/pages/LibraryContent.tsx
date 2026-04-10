import { Box, Button, Heading, Text } from "@chakra-ui/react";
import React, { type FC, useState } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";

import { LibraryGrid } from "../components/LibraryGrid.js";
import type { LibraryContentQuery } from "../relay/__generated__/LibraryContentQuery.graphql.js";
import type { LibraryContentScanMutation } from "../relay/__generated__/LibraryContentScanMutation.graphql.js";

const LIBRARIES_QUERY = graphql`
  query LibraryContentQuery {
    libraries {
      id
      name
      ...LibraryGrid_library
    }
  }
`;

const SCAN_MUTATION = graphql`
  mutation LibraryContentScanMutation {
    scanLibraries {
      id
      name
    }
  }
`;

export const LibraryContent: FC = () => {
  // Incrementing fetchKey forces useLazyLoadQuery to refetch from the network,
  // picking up new videos that the scanLibraries mutation discovered.
  const [fetchKey, setFetchKey] = useState(0);
  const data = useLazyLoadQuery<LibraryContentQuery>(
    LIBRARIES_QUERY,
    {},
    {
      fetchKey,
      fetchPolicy: fetchKey > 0 ? "network-only" : "store-or-network",
    }
  );
  const [scan, isScanning] = useMutation<LibraryContentScanMutation>(SCAN_MUTATION);

  const handleScan = () => {
    scan({
      variables: {},
      onCompleted() {
        setFetchKey((k) => k + 1);
      },
    });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={6}>
        <Heading size="lg">Media Libraries</Heading>
        <Button onClick={handleScan} loading={isScanning} size="sm" variant="outline">
          Rescan Libraries
        </Button>
      </Box>

      {data.libraries.length === 0 ? (
        <Text color="gray.500">No libraries found. Check your mediaFiles.json configuration.</Text>
      ) : (
        data.libraries.map((lib) => (
          <Box key={lib.id} mb={10}>
            <Heading size="md" mb={4}>
              {lib.name}
            </Heading>
            <LibraryGrid library={lib} />
          </Box>
        ))
      )}
    </Box>
  );
};
