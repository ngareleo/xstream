import { Badge, Box, Text } from "@chakra-ui/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";

import type { MediaListItem_video$key } from "../relay/__generated__/MediaListItem_video.graphql.js";
import { formatDuration, formatFileSize, resolutionLabel } from "../utils/formatters.js";
import { createVideoPlayEvent, createVideoSelectedEvent } from "./MediaList.events.js";

const VIDEO_FRAGMENT = graphql`
  fragment MediaListItem_video on Video {
    id
    title
    durationSeconds
    fileSizeBytes
    videoStream {
      height
      width
    }
  }
`;

interface Props {
  video: MediaListItem_video$key;
  isSelected: boolean;
}

export const MediaListItem: FC<Props> = ({ video, isSelected }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const { bubble } = useNovaEventing();
  const label = resolutionLabel(data.videoStream?.height, data.videoStream?.width);

  const handleRowClick = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createVideoSelectedEvent(data.id) });
  };

  const handlePlayClick = (e: MouseEvent): void => {
    e.stopPropagation();
    void bubble({ reactEvent: e, event: createVideoPlayEvent(data.id) });
  };

  return (
    <Box
      display="flex"
      alignItems="center"
      gap={4}
      p={4}
      bg={isSelected ? "rgba(251,146,60,0.08)" : "gray.900"}
      border="1px solid"
      borderColor={isSelected ? "orange.400" : "gray.800"}
      borderRadius="12px"
      cursor="pointer"
      onClick={handleRowClick}
      _hover={{ borderColor: "orange.400", transform: "translateX(4px)" }}
      transition="all 0.2s"
      role="group"
    >
      {/* Thumbnail */}
      <Box
        w="120px"
        h="68px"
        bg="gray.800"
        borderRadius="md"
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
        position="relative"
        overflow="hidden"
      >
        <Text color="gray.600" fontSize="2xl">
          ▶
        </Text>
        <Box
          position="absolute"
          inset={0}
          bg="blackAlpha.600"
          display="flex"
          alignItems="center"
          justifyContent="center"
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.2s"
          borderRadius="md"
        >
          <Text color="orange.400" fontSize="xl">
            ▶
          </Text>
        </Box>
        <Text
          position="absolute"
          bottom={1}
          right={1}
          bg="blackAlpha.800"
          px={1}
          py={0}
          borderRadius="sm"
          fontSize="10px"
          color="white"
        >
          {formatDuration(data.durationSeconds)}
        </Text>
      </Box>

      {/* Info */}
      <Box flex={1} minW={0}>
        <Text
          fontWeight="semibold"
          fontSize="md"
          color="white"
          mb={1}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {data.title}
        </Text>
        <Box display="flex" alignItems="center" gap={3} flexWrap="wrap">
          <Text fontSize="xs" color="gray.500">
            {formatFileSize(data.fileSizeBytes)}
          </Text>
        </Box>
      </Box>

      {/* Resolution badge */}
      {label && (
        <Badge colorPalette={label === "4k" ? "purple" : "blue"} fontSize="xs" flexShrink={0}>
          {label.toUpperCase()}
        </Badge>
      )}

      {/* Actions */}
      <Box display="flex" gap={2} flexShrink={0}>
        <Box
          as="button"
          w={9}
          h={9}
          bg="gray.800"
          border="1px solid"
          borderColor="gray.700"
          borderRadius="md"
          display="flex"
          alignItems="center"
          justifyContent="center"
          color="gray.400"
          cursor="pointer"
          _hover={{ color: "orange.400", borderColor: "orange.400" }}
          transition="all 0.2s"
          onClick={handlePlayClick}
          aria-label="Play"
        >
          <Text fontSize="sm">▶</Text>
        </Box>
      </Box>
    </Box>
  );
};
