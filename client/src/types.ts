// Re-export the Resolution enum from the relay-generated mutation type.
// The GraphQL schema is the single source of truth — never redefine this type locally.
export type { Resolution as GQLResolution } from "./relay/__generated__/VideoPlayerStartTranscodeMutation.graphql.js";

// Human-readable display labels that map 1:1 to GQLResolution values.
// Keep these in sync with RESOLUTION_PROFILES in server/src/config.ts.
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
  "240p": 0, "360p": 1, "480p": 2, "720p": 3, "1080p": 4, "4k": 5,
};
