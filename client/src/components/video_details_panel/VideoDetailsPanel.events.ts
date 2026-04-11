import type { EventWrapper, NovaEvent } from "@nova/types";

export const VIDEO_DETAILS_PANEL_ORIGINATOR = "VideoDetailsPanel";

export const VideoDetailsPanelEventTypes = {
  VIDEO_PLAY: "VideoPlay",
} as const;

export interface VideoDetailsPanelPlayData {
  videoId: string;
}

export function createVideoDetailsPanelPlayEvent(
  videoId: string
): NovaEvent<VideoDetailsPanelPlayData> {
  return {
    originator: VIDEO_DETAILS_PANEL_ORIGINATOR,
    type: VideoDetailsPanelEventTypes.VIDEO_PLAY,
    data: () => ({ videoId }),
  };
}

export function isVideoDetailsPanelEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === VIDEO_DETAILS_PANEL_ORIGINATOR;
}

export function isVideoDetailsPanelPlayEvent(wrapper: EventWrapper): boolean {
  return (
    isVideoDetailsPanelEvent(wrapper) &&
    wrapper.event.type === VideoDetailsPanelEventTypes.VIDEO_PLAY
  );
}
