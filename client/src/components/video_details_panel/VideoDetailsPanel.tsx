import { Box, Text } from "@chakra-ui/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";

import type { VideoDetailsPanel_video$key } from "~/relay/__generated__/VideoDetailsPanel_video.graphql.js";
import { formatDuration, formatFileSize, resolutionLabel } from "~/utils/formatters.js";

import { createVideoDetailsPanelPlayEvent } from "./VideoDetailsPanel.events.js";

const VIDEO_FRAGMENT = graphql`
  fragment VideoDetailsPanel_video on Video {
    id
    title
    durationSeconds
    fileSizeBytes
    videoStream {
      height
      width
      codec
    }
  }
`;

interface MetaCardProps {
  label: string;
  value: string;
}

const MetaCard: FC<MetaCardProps> = ({ label, value }) => (
  <Box bg="gray.800" p={3} borderRadius="10px">
    <Text fontSize="10px" color="gray.500" textTransform="uppercase" letterSpacing="wider" mb={1}>
      {label}
    </Text>
    <Text fontSize="sm" fontWeight="semibold" color="white">
      {value}
    </Text>
  </Box>
);

interface Props {
  video: VideoDetailsPanel_video$key;
  onClose: () => void;
}

export const VideoDetailsPanel: FC<Props> = ({ video, onClose }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const { bubble } = useNovaEventing();
  const label = resolutionLabel(data.videoStream?.height, data.videoStream?.width);

  const handlePlay = (e: MouseEvent): void => {
    void bubble({ reactEvent: e, event: createVideoDetailsPanelPlayEvent(data.id) });
  };

  return (
    <Box
      as="aside"
      w="380px"
      bg="gray.900"
      borderLeft="1px solid"
      borderColor="gray.800"
      p={6}
      overflowY="auto"
      flexShrink={0}
      position="relative"
    >
      {/* Close button */}
      <Box
        as="button"
        position="absolute"
        top={4}
        right={4}
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
        _hover={{ color: "white", borderColor: "gray.500" }}
        transition="all 0.2s"
        onClick={onClose}
        aria-label="Close details"
      >
        ✕
      </Box>

      {/* Thumbnail */}
      <Box
        w="100%"
        aspectRatio="16/9"
        bg="gray.800"
        borderRadius="12px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        mb={5}
        position="relative"
        overflow="hidden"
        cursor="pointer"
        onClick={handlePlay}
        role="group"
      >
        <Text color="gray.600" fontSize="4xl">
          ▶
        </Text>
        <Box
          position="absolute"
          w={16}
          h={16}
          bg="orange.400"
          borderRadius="full"
          display="flex"
          alignItems="center"
          justifyContent="center"
          _groupHover={{ transform: "scale(1.1)" }}
          transition="transform 0.2s"
        >
          <Text color="gray.900" fontSize="xl" ml="3px">
            ▶
          </Text>
        </Box>
      </Box>

      {/* Title */}
      <Text fontSize="xl" fontWeight="bold" color="white" mb={4} fontFamily="heading">
        {data.title}
      </Text>

      {/* Metadata grid */}
      <Box display="grid" gridTemplateColumns="repeat(2, 1fr)" gap={4} mb={6}>
        <MetaCard label="Duration" value={formatDuration(data.durationSeconds)} />
        <MetaCard label="Resolution" value={label ? label.toUpperCase() : "—"} />
        <MetaCard label="File Size" value={formatFileSize(data.fileSizeBytes)} />
        <MetaCard label="Codec" value={data.videoStream?.codec ?? "—"} />
      </Box>

      {/* Actions */}
      <Box display="flex" flexDir="column" gap={3}>
        <Box
          as="button"
          w="100%"
          py={3}
          px={6}
          borderRadius="10px"
          bg="orange.400"
          color="gray.900"
          fontWeight="semibold"
          fontSize="sm"
          cursor="pointer"
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap={2}
          _hover={{ bg: "orange.300" }}
          transition="all 0.2s"
          onClick={handlePlay}
        >
          <Text>▶</Text>
          <Text>Play Video</Text>
        </Box>
        <Box
          as="button"
          w="100%"
          py={3}
          px={6}
          borderRadius="10px"
          bg="gray.800"
          color="white"
          fontWeight="semibold"
          fontSize="sm"
          cursor="pointer"
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap={2}
          border="1px solid"
          borderColor="gray.700"
          _hover={{ borderColor: "gray.500" }}
          transition="all 0.2s"
        >
          <Text>☆</Text>
          <Text>Add to Favourites</Text>
        </Box>
      </Box>
    </Box>
  );
};
