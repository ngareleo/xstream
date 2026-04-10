import type { EventWrapper, NovaEvent } from "@nova/types";

export const MEDIA_LIST_ORIGINATOR = "MediaList";

export const MediaListEventTypes = {
  VIDEO_SELECTED: "VideoSelected",
  VIDEO_PLAY: "VideoPlay",
} as const;

export interface VideoSelectedData {
  videoId: string;
}

export interface VideoPlayData {
  videoId: string;
}

export function createVideoSelectedEvent(videoId: string): NovaEvent<VideoSelectedData> {
  return {
    originator: MEDIA_LIST_ORIGINATOR,
    type: MediaListEventTypes.VIDEO_SELECTED,
    data: () => ({ videoId }),
  };
}

export function createVideoPlayEvent(videoId: string): NovaEvent<VideoPlayData> {
  return {
    originator: MEDIA_LIST_ORIGINATOR,
    type: MediaListEventTypes.VIDEO_PLAY,
    data: () => ({ videoId }),
  };
}

export function isMediaListEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === MEDIA_LIST_ORIGINATOR;
}

export function isVideoSelectedEvent(wrapper: EventWrapper): boolean {
  return isMediaListEvent(wrapper) && wrapper.event.type === MediaListEventTypes.VIDEO_SELECTED;
}

export function isVideoPlayEvent(wrapper: EventWrapper): boolean {
  return isMediaListEvent(wrapper) && wrapper.event.type === MediaListEventTypes.VIDEO_PLAY;
}
