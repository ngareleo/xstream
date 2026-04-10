import { Box, Spinner, Text } from "@chakra-ui/react";
import React, { type FC, Suspense } from "react";
import { graphql, useLazyLoadQuery, useMutation } from "react-relay";

import { AppHeader } from "../components/AppHeader.js";
import type { SetupPageContentQuery } from "../relay/__generated__/SetupPageContentQuery.graphql.js";
import type { SetupPageContentScanMutation } from "../relay/__generated__/SetupPageContentScanMutation.graphql.js";

const SETUP_QUERY = graphql`
  query SetupPageContentQuery {
    libraries {
      id
      name
      path
      mediaType
      videos(first: 1) {
        totalCount
      }
    }
  }
`;

const SCAN_MUTATION = graphql`
  mutation SetupPageContentScanMutation {
    scanLibraries {
      id
      name
    }
  }
`;

const SetupPageInner: FC = () => {
  const data = useLazyLoadQuery<SetupPageContentQuery>(SETUP_QUERY, {});
  const [scan, isScanning] = useMutation<SetupPageContentScanMutation>(SCAN_MUTATION);

  const handleScan = (): void => {
    scan({ variables: {} });
  };

  return (
    <Box display="flex" h="100%" overflow="hidden">
      {/* Left sidebar — icon rail */}
      <Box
        w="260px"
        bg="gray.900"
        borderRight="1px solid"
        borderColor="gray.800"
        p={4}
        overflowY="auto"
        flexShrink={0}
      >
        <Text
          fontSize="xs"
          fontWeight="semibold"
          color="gray.500"
          textTransform="uppercase"
          letterSpacing="wider"
          mb={4}
          px={2}
        >
          Profiles
        </Text>
        {data.libraries.map((lib) => (
          <Box
            key={lib.id}
            display="flex"
            alignItems="center"
            gap={3}
            p={3}
            bg="gray.800"
            border="1px solid"
            borderColor="gray.700"
            borderRadius="10px"
            mb={2}
          >
            <Box
              w={10}
              h={10}
              bg="orange.400"
              borderRadius="md"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              fontSize="lg"
              color="gray.900"
            >
              {lib.mediaType === "MOVIES" ? "🎬" : "📺"}
            </Box>
            <Box flex={1} minW={0}>
              <Text
                fontWeight="semibold"
                fontSize="sm"
                color="white"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {lib.name}
              </Text>
              <Text fontSize="xs" color="gray.500">
                {lib.videos.totalCount} items
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Main content */}
      <Box flex={1} p={12} overflowY="auto">
        <Box maxW="600px">
          <Text fontSize="3xl" fontWeight="bold" color="white" mb={2}>
            Welcome to Media Stream Hub
          </Text>
          <Text fontSize="sm" color="gray.500" mb={10} lineHeight="1.6">
            Profiles are configured in{" "}
            <Text as="span" color="orange.400" fontFamily="mono" fontSize="xs">
              mediaFiles.json
            </Text>{" "}
            at the project root. Each entry becomes a streaming profile for your library.
          </Text>

          {/* Your Profiles */}
          <Box mb={8}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
              <Box display="flex" alignItems="center" gap={2}>
                <Text fontSize="lg" fontWeight="semibold" color="white">
                  Your Profiles
                </Text>
                <Box
                  bg="orange.400"
                  color="gray.900"
                  fontSize="xs"
                  fontWeight="bold"
                  px={2}
                  py={0.5}
                  borderRadius="full"
                >
                  {data.libraries.length}
                </Box>
              </Box>
              <Box
                as="button"
                px={4}
                py={2}
                bg="gray.800"
                border="1px solid"
                borderColor="gray.700"
                borderRadius="md"
                color={isScanning ? "gray.500" : "gray.300"}
                fontSize="sm"
                fontWeight="medium"
                cursor={isScanning ? "not-allowed" : "pointer"}
                _hover={{ borderColor: "gray.500", color: "white" }}
                transition="all 0.2s"
                onClick={handleScan}
                aria-disabled={isScanning}
              >
                {isScanning ? "Scanning…" : "↻ Rescan Libraries"}
              </Box>
            </Box>

            {data.libraries.length === 0 ? (
              <Box
                p={8}
                bg="gray.900"
                border="1px dashed"
                borderColor="gray.700"
                borderRadius="12px"
                textAlign="center"
              >
                <Text color="gray.500" fontSize="sm">
                  No profiles found. Check your{" "}
                  <Text as="span" color="orange.400" fontFamily="mono" fontSize="xs">
                    mediaFiles.json
                  </Text>{" "}
                  configuration.
                </Text>
              </Box>
            ) : (
              <Box display="flex" flexDir="column" gap={3}>
                {data.libraries.map((lib) => (
                  <Box
                    key={lib.id}
                    display="flex"
                    alignItems="center"
                    gap={4}
                    p={4}
                    bg="gray.900"
                    border="1px solid"
                    borderColor="gray.800"
                    borderRadius="12px"
                  >
                    <Box
                      w={10}
                      h={10}
                      bg="orange.400"
                      borderRadius="md"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                      fontSize="lg"
                      color="gray.900"
                    >
                      {lib.mediaType === "MOVIES" ? "🎬" : "📺"}
                    </Box>
                    <Box flex={1} minW={0}>
                      <Text fontWeight="semibold" fontSize="sm" color="white" mb={0.5}>
                        {lib.name}
                      </Text>
                      <Text
                        fontSize="xs"
                        color="gray.500"
                        fontFamily="mono"
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                      >
                        {lib.path}
                      </Text>
                    </Box>
                    <Text fontSize="xs" color="gray.600">
                      {lib.videos.totalCount} items
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export const SetupPageContent: FC = () => {
  return (
    <Box display="flex" flexDir="column" h="100vh" bg="gray.950">
      <AppHeader />
      <Suspense
        fallback={
          <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
            <Spinner size="xl" />
          </Box>
        }
      >
        <SetupPageInner />
      </Suspense>
    </Box>
  );
};
