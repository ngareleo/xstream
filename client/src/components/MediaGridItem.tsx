import { Badge, Box, Text } from "@chakra-ui/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";

import type { MediaGridItem_video$key } from "../relay/__generated__/MediaGridItem_video.graphql.js";
import { formatDuration, formatFileSize, resolutionLabel } from "../utils/formatters.js";
import { createVideoPlayEvent, createVideoSelectedEvent } from "./MediaList.events.js";

const VIDEO_FRAGMENT = graphql`
  fragment MediaGridItem_video on Video {
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
  video: MediaGridItem_video$key;
}

export const MediaGridItem: FC<Props> = ({ video }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const { bubble } = useNovaEventing();
  const label = resolutionLabel(data.videoStream?.height, data.videoStream?.width);

  const handleClick = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createVideoSelectedEvent(data.id) });
  };

  const handlePlayClick = (e: MouseEvent): void => {
    e.stopPropagation();
    void bubble({ reactEvent: e, event: createVideoPlayEvent(data.id) });
  };

  return (
    <Box
      bg="gray.900"
      borderRadius="12px"
      overflow="hidden"
      cursor="pointer"
      onClick={handleClick}
      _hover={{ transform: "translateY(-4px)", boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}
      transition="all 0.2s"
      role="group"
    >
      {/* Thumbnail */}
      <Box
        aspectRatio="16/9"
        bg="gray.800"
        display="flex"
        alignItems="center"
        justifyContent="center"
        position="relative"
        overflow="hidden"
      >
        <Text color="gray.600" fontSize="3xl">
          ▶
        </Text>
        <Box
          position="absolute"
          inset={0}
          bg="blackAlpha.700"
          display="flex"
          alignItems="center"
          justifyContent="center"
          opacity={0}
          _groupHover={{ opacity: 1 }}
          transition="opacity 0.2s"
        >
          <Box
            w={12}
            h={12}
            bg="orange.400"
            borderRadius="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
            onClick={handlePlayClick}
          >
            <Text color="gray.900" fontSize="md" ml="2px">
              ▶
            </Text>
          </Box>
        </Box>
        <Text
          position="absolute"
          bottom={1}
          right={1}
          bg="blackAlpha.800"
          px={1}
          borderRadius="sm"
          fontSize="10px"
          color="white"
        >
          {formatDuration(data.durationSeconds)}
        </Text>
      </Box>

      {/* Info */}
      <Box p={3}>
        <Text
          fontWeight="semibold"
          fontSize="sm"
          color="white"
          mb={1}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {data.title}
        </Text>
        <Box display="flex" alignItems="center" gap={2}>
          {label && (
            <Badge colorPalette={label === "4k" ? "purple" : "blue"} size="sm">
              {label.toUpperCase()}
            </Badge>
          )}
          <Text fontSize="xs" color="gray.500">
            {formatFileSize(data.fileSizeBytes)}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
