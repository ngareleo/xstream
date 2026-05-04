// Re-export from GraphQL schema; single source of truth.
export type { Resolution as GQLResolution } from "./relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";

// Human-readable display labels matching GQLResolution.
export type Resolution = "240p" | "360p" | "480p" | "720p" | "1080p" | "4k";

export const DISPLAY_TO_GQL: Record<Resolution, string> = {
  "240p": "RESOLUTION_240P",
  "360p": "RESOLUTION_360P",
  "480p": "RESOLUTION_480P",
  "720p": "RESOLUTION_720P",
  "1080p": "RESOLUTION_1080P",
  "4k": "RESOLUTION_4K",
};

export const ALL_RESOLUTIONS: Resolution[] = ["240p", "360p", "480p", "720p", "1080p", "4k"];

export const RESOLUTION_ORDER: Record<Resolution, number> = {
  "240p": 0,
  "360p": 1,
  "480p": 2,
  "720p": 3,
  "1080p": 4,
  "4k": 5,
};

/** MSE codec strings matching H.264 levels per resolution; avoids isTypeSupported() false negatives. */
export const RESOLUTION_MIME_TYPE: Record<Resolution, string> = {
  "240p": 'video/mp4; codecs="avc1.64001e,mp4a.40.2"', // H.264 High L3.0
  "360p": 'video/mp4; codecs="avc1.64001e,mp4a.40.2"', // H.264 High L3.0
  "480p": 'video/mp4; codecs="avc1.64001e,mp4a.40.2"', // H.264 High L3.0
  "720p": 'video/mp4; codecs="avc1.64001f,mp4a.40.2"', // H.264 High L3.1
  "1080p": 'video/mp4; codecs="avc1.640028,mp4a.40.2"', // H.264 High L4.0
  "4k": 'video/mp4; codecs="avc1.640033,mp4a.40.2"', // H.264 High L5.1
};

/** Playback-controller status (idle/loading/playing); NOT the same as videoEl.paused. */
export type PlaybackStatus = "idle" | "loading" | "playing";
