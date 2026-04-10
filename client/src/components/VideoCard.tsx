import { Badge, Box, Text } from "@chakra-ui/react";
import { type FC } from "react";
import { graphql, useFragment } from "react-relay";
import { useNavigate } from "react-router-dom";

import type { VideoCard_video$key } from "../relay/__generated__/VideoCard_video.graphql.js";
import { formatDuration, resolutionLabel } from "../utils/formatters.js";

const VIDEO_FRAGMENT = graphql`
  fragment VideoCard_video on Video {
    id
    title
    durationSeconds
    videoStream {
      height
    }
  }
`;

interface Props {
  video: VideoCard_video$key;
}

export const VideoCard: FC<Props> = ({ video }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const navigate = useNavigate();
  const label = resolutionLabel(data.videoStream?.height);

  return (
    <Box
      cursor="pointer"
      borderRadius="md"
      overflow="hidden"
      bg="gray.800"
      _hover={{ bg: "gray.700", transform: "scale(1.02)" }}
      transition="all 0.15s"
      onClick={() => navigate(`/play/${encodeURIComponent(data.id)}`)}
      p={3}
    >
      <Box
        bg="gray.700"
        borderRadius="sm"
        mb={2}
        h="100px"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="2xl">▶</Text>
      </Box>

      <Text fontSize="sm" fontWeight="medium" lineClamp={2} color="white">
        {data.title}
      </Text>

      <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
        <Text fontSize="xs" color="gray.400">
          {formatDuration(data.durationSeconds)}
        </Text>
        {label && (
          <Badge size="sm" colorPalette="blue">
            {label}
          </Badge>
        )}
      </Box>
    </Box>
  );
};
