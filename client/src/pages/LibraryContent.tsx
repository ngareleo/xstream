import { Box, Heading, Text, Button } from "@chakra-ui/react";
import { useLazyLoadQuery, useMutation, graphql } from "react-relay";
import type { LibraryPageQuery } from "../relay/__generated__/LibraryPageQuery.graphql";
import type { LibraryPageScanMutation } from "../relay/__generated__/LibraryPageScanMutation.graphql";
import { LibraryGrid } from "../components/LibraryGrid.js";

const LIBRARIES_QUERY = graphql`
  query LibraryPageQuery {
    libraries {
      id
      name
      ...LibraryGrid_library
    }
  }
`;

const SCAN_MUTATION = graphql`
  mutation LibraryPageScanMutation {
    scanLibraries {
      id
      name
    }
  }
`;

export function LibraryContent() {
  const data = useLazyLoadQuery<LibraryPageQuery>(LIBRARIES_QUERY, {});
  const [scan, isScanning] = useMutation<LibraryPageScanMutation>(SCAN_MUTATION);

  const handleScan = () => {
    scan({ variables: {} });
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
            <Heading size="md" mb={4}>{lib.name}</Heading>
            <LibraryGrid library={lib} />
          </Box>
        ))
      )}
    </Box>
  );
}
