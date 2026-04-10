import { Box, Text } from "@chakra-ui/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";

import type { LibraryRail_library$key } from "../relay/__generated__/LibraryRail_library.graphql.js";
import { createLibraryRailSelectedEvent } from "./LibraryRail.events.js";

const LIBRARY_FRAGMENT = graphql`
  fragment LibraryRail_library on Library {
    id
    name
    mediaType
  }
`;

interface RailIconProps {
  library: LibraryRail_library$key;
  selectedLibraryId: string | null;
}

const RailIcon: FC<RailIconProps> = ({ library, selectedLibraryId }) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);
  const { bubble } = useNovaEventing();
  const isActive = data.id === selectedLibraryId;

  const handleClick = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createLibraryRailSelectedEvent(data.id) });
  };

  return (
    <Box
      as="button"
      w={10}
      h={10}
      borderRadius="10px"
      bg={isActive ? "orange.400" : "gray.800"}
      border="2px solid"
      borderColor={isActive ? "orange.400" : "gray.700"}
      display="flex"
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      fontSize="lg"
      color={isActive ? "gray.900" : "gray.400"}
      _hover={{ borderColor: isActive ? "orange.400" : "gray.500" }}
      transition="all 0.2s"
      onClick={handleClick}
      title={data.name}
      aria-label={data.name}
      aria-pressed={isActive}
    >
      <Text>{data.mediaType === "MOVIES" ? "🎬" : "📺"}</Text>
    </Box>
  );
};

interface Props {
  libraries: ReadonlyArray<LibraryRail_library$key>;
  selectedLibraryId: string | null;
}

export const LibraryRail: FC<Props> = ({ libraries, selectedLibraryId }) => {
  return (
    <Box
      w="64px"
      bg="gray.900"
      borderRight="1px solid"
      borderColor="gray.800"
      py={4}
      display="flex"
      flexDir="column"
      alignItems="center"
      gap={2}
      flexShrink={0}
      overflowY="auto"
    >
      {libraries.map((lib, i) => (
        <RailIcon key={i} library={lib} selectedLibraryId={selectedLibraryId} />
      ))}
    </Box>
  );
};
