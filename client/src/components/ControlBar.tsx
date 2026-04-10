import { Badge, Box, IconButton, Slider, Stack, Text } from "@chakra-ui/react";
import { useNovaEventing } from "@nova/react";
import { type FC, type MouseEvent, type RefObject } from "react";
import { graphql, useFragment } from "react-relay";

import { CONTROL_BAR_ORIGINATOR, ControlBarEventTypes } from "../events.js";
import { useVideoSync } from "../hooks/useVideoSync.js";
import type { ControlBar_video$key } from "../relay/__generated__/ControlBar_video.graphql.js";
import type { Resolution } from "../types.js";
import { ALL_RESOLUTIONS, RESOLUTION_ORDER } from "../types.js";
import { formatDuration, maxResolutionForHeight } from "../utils/formatters.js";

const VIDEO_FRAGMENT = graphql`
  fragment ControlBar_video on Video {
    title
    durationSeconds
    videoStream {
      height
    }
  }
`;

interface Props {
  video: ControlBar_video$key;
  videoRef: RefObject<HTMLVideoElement | null>;
  resolution: Resolution;
  status: "idle" | "loading" | "playing";
}

export const ControlBar: FC<Props> = ({ video, videoRef, resolution, status }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const { currentTime, isPlaying } = useVideoSync(videoRef);
  const { bubble } = useNovaEventing();

  const maxResolution = maxResolutionForHeight(data.videoStream?.height);

  const togglePlayPause = (reactEvent: MouseEvent) => {
    const el = videoRef.current;
    if (!el) return;
    if (status === "idle") {
      void bubble({
        reactEvent,
        event: { originator: CONTROL_BAR_ORIGINATOR, type: ControlBarEventTypes.PLAY_REQUESTED },
      });
      return;
    }
    if (el.paused) void el.play();
    else el.pause();
  };

  const handleSeek = (value: number[]) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = value[0];
  };

  const handleResolutionClick = (reactEvent: MouseEvent, r: Resolution) => {
    void bubble({
      reactEvent,
      event: {
        originator: CONTROL_BAR_ORIGINATOR,
        type: ControlBarEventTypes.RESOLUTION_CHANGED,
        data: () => ({ resolution: r }),
      },
    });
  };

  const availableResolutions = ALL_RESOLUTIONS.filter(
    (r) => RESOLUTION_ORDER[r] <= RESOLUTION_ORDER[maxResolution]
  );

  return (
    <Box bg="gray.900" px={4} py={3}>
      <Slider.Root
        value={[currentTime]}
        min={0}
        max={data.durationSeconds || 1}
        step={1}
        onValueChange={({ value }) => handleSeek(value)}
        mb={3}
      >
        <Slider.Track bg="gray.600">
          <Slider.Range bg="blue.400" />
        </Slider.Track>
        <Slider.Thumb index={0} />
      </Slider.Root>

      <Stack direction="row" align="center" justify="space-between">
        <Stack direction="row" align="center" gap={3}>
          <IconButton
            aria-label={isPlaying ? "Pause" : "Play"}
            variant="ghost"
            color="white"
            size="sm"
            loading={status === "loading"}
            onClick={togglePlayPause}
          >
            {isPlaying ? "⏸" : "▶"}
          </IconButton>
          <Text color="gray.300" fontSize="sm">
            {formatDuration(currentTime)} / {formatDuration(data.durationSeconds)}
          </Text>
        </Stack>

        <Text
          color="white"
          fontSize="sm"
          fontWeight="medium"
          flex={1}
          textAlign="center"
          px={4}
          lineClamp={1}
        >
          {data.title}
        </Text>

        <Stack direction="row" gap={1}>
          {availableResolutions.map((r) => (
            <Badge
              key={r}
              cursor="pointer"
              colorPalette={resolution === r ? "blue" : "gray"}
              variant={resolution === r ? "solid" : "outline"}
              onClick={(e) => handleResolutionClick(e, r)}
              px={2}
              py={1}
              fontSize="xs"
            >
              {r}
            </Badge>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
};
