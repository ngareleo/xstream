import { Box, Text } from "@chakra-ui/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";

import type { ProfilesSidebar_library$key } from "~/relay/__generated__/ProfilesSidebar_library.graphql.js";

import { createLibrarySelectedEvent } from "./ProfilesSidebar.events.js";

const LIBRARY_FRAGMENT = graphql`
  fragment ProfilesSidebar_library on Library {
    id
    name
    mediaType
    videos(first: 50) {
      totalCount
    }
  }
`;

interface NavCardProps {
  library: ProfilesSidebar_library$key;
  selectedLibraryId: string | null;
}

const LibraryNavCard: FC<NavCardProps> = ({ library, selectedLibraryId }) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);
  const { bubble } = useNovaEventing();
  const isActive = data.id === selectedLibraryId;

  const handleClick = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createLibrarySelectedEvent(data.id) });
  };

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={3}
      p="14px"
      bg={isActive ? "rgba(251,146,60,0.08)" : "gray.800"}
      border="1px solid"
      borderColor={isActive ? "orange.400" : "gray.700"}
      borderRadius="10px"
      cursor="pointer"
      onClick={handleClick}
      _hover={{ borderColor: "orange.400", transform: "translateX(4px)" }}
      transition="all 0.2s"
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
        {data.mediaType === "MOVIES" ? "🎬" : "📺"}
      </Box>
      <Box flex={1} minW={0}>
        <Text
          fontWeight="semibold"
          fontSize="sm"
          color="white"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          mb="2px"
        >
          {data.name}
        </Text>
        <Text fontSize="xs" color="gray.500">
          {data.videos.totalCount} items
        </Text>
      </Box>
    </Box>
  );
};

interface Props {
  libraries: ReadonlyArray<ProfilesSidebar_library$key>;
  selectedLibraryId: string | null;
}

export const ProfilesSidebar: FC<Props> = ({ libraries, selectedLibraryId }) => {
  return (
    <Box
      as="aside"
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
        Your Profiles
      </Text>
      {libraries.map((lib, i) => (
        <LibraryNavCard key={i} library={lib} selectedLibraryId={selectedLibraryId} />
      ))}
    </Box>
  );
};
