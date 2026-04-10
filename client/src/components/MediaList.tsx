import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import React, { type FC, useState } from "react";
import { graphql, useFragment } from "react-relay";

import type { MediaList_library$key } from "../relay/__generated__/MediaList_library.graphql.js";
import { MediaGridItem } from "./MediaGridItem.js";
import { MediaListItem } from "./MediaListItem.js";

const LIBRARY_FRAGMENT = graphql`
  fragment MediaList_library on Library {
    id
    name
    videos(first: 50) {
      totalCount
      edges {
        node {
          id
          ...MediaListItem_video
          ...MediaGridItem_video
        }
      }
    }
  }
`;

interface Props {
  library: MediaList_library$key;
  selectedVideoId: string | null;
}

export const MediaList: FC<Props> = ({ library, selectedVideoId }) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  return (
    <Box flex={1} p={8} overflowY="auto" bg="gray.950">
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={6}>
        <Box display="flex" alignItems="baseline" gap={3}>
          <Text fontSize="2xl" fontWeight="bold" color="white" fontFamily="heading">
            {data.name}
          </Text>
          <Text fontSize="sm" color="gray.500">
            {data.videos.totalCount} items
          </Text>
        </Box>
        <Box display="flex" gap={2}>
          <Box
            as="button"
            w={10}
            h={10}
            bg={viewMode === "list" ? "orange.400" : "gray.800"}
            border="1px solid"
            borderColor={viewMode === "list" ? "orange.400" : "gray.700"}
            borderRadius="md"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color={viewMode === "list" ? "gray.900" : "gray.400"}
            cursor="pointer"
            onClick={() => setViewMode("list")}
            title="List view"
            transition="all 0.2s"
          >
            ☰
          </Box>
          <Box
            as="button"
            w={10}
            h={10}
            bg={viewMode === "grid" ? "orange.400" : "gray.800"}
            border="1px solid"
            borderColor={viewMode === "grid" ? "orange.400" : "gray.700"}
            borderRadius="md"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color={viewMode === "grid" ? "gray.900" : "gray.400"}
            cursor="pointer"
            onClick={() => setViewMode("grid")}
            title="Grid view"
            transition="all 0.2s"
          >
            ⊞
          </Box>
        </Box>
      </Box>

      {/* Content */}
      {viewMode === "list" ? (
        <Box display="flex" flexDir="column" gap={2}>
          {data.videos.edges.map(({ node }) => (
            <MediaListItem key={node.id} video={node} isSelected={node.id === selectedVideoId} />
          ))}
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 2, lg: 3, xl: 4 }} gap={5}>
          {data.videos.edges.map(({ node }) => (
            <MediaGridItem key={node.id} video={node} />
          ))}
        </SimpleGrid>
      )}
    </Box>
  );
};
