// Re-export the Resolution enum from the relay-generated mutation type.
// The GraphQL schema is the single source of truth — never redefine this type locally.
export type { Resolution as GQLResolution } from "./relay/__generated__/useChunkedPlaybackStartChunkMutation.graphql.js";

// Human-readable display labels that map 1:1 to GQLResolution values.
// Keep these in sync with RESOLUTION_PROFILES in server-rust/src/config.rs.
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

/**
 * MSE codec strings matched to the H.264 levels the server encodes per resolution.
 * Using the correct level avoids isTypeSupported() returning false on devices that
 * support e.g. Level 4.0 but not Level 5.1 when playing 1080p or below.
 *
 * High Profile (0x64) + constraint flags (0x00) + level_idc:
 *   Level 3.0 → 0x1e, Level 3.1 → 0x1f, Level 4.0 → 0x28, Level 5.1 → 0x33
 */
export const RESOLUTION_MIME_TYPE: Record<Resolution, string> = {
  "240p": 'video/mp4; codecs="avc1.64001e,mp4a.40.2"', // H.264 High L3.0
  "360p": 'video/mp4; codecs="avc1.64001e,mp4a.40.2"', // H.264 High L3.0
  "480p": 'video/mp4; codecs="avc1.64001e,mp4a.40.2"', // H.264 High L3.0
  "720p": 'video/mp4; codecs="avc1.64001f,mp4a.40.2"', // H.264 High L3.1
  "1080p": 'video/mp4; codecs="avc1.640028,mp4a.40.2"', // H.264 High L4.0
  "4k": 'video/mp4; codecs="avc1.640033,mp4a.40.2"', // H.264 High L5.1
};

/** Internal playback-controller status used to drive the spinner / play
 *  button state. NOT the same as `videoEl.paused` — the controller is
 *  "in session" while playing OR paused; "idle" before play and after
 *  teardown; "loading" during cold-start and seek-fill phases. */
export type PlaybackStatus = "idle" | "loading" | "playing";
