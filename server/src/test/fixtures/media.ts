/**
 * Media-fixture descriptors for the chunker encode tests.
 *
 * Source files are NOT committed. They live at $XSTREAM_TEST_MEDIA_DIR on
 * the developer's machine; the encode test resolves them via that env var
 * and skips fixtures that aren't present.
 *
 * Filenames must match what the developer has locally (case-sensitive). The
 * defaults below mirror the user's library that the session debugged against.
 * Symlink if your filenames differ.
 */
import type { Resolution } from "../../types.js";

export interface MediaFixture {
  /** Basename inside $XSTREAM_TEST_MEDIA_DIR. */
  filename: string;
  /** True for HDR10 / Dolby Vision sources — drives the tonemap_vaapi path. */
  isHdr: boolean;
  /** Resolutions to encode this fixture at. */
  testResolutions: Resolution[];
  /** Sliding chunk window. Encode chunks of `chunkDurationS` seconds starting
   *  at each of these source-time offsets. Keep small so wall-time stays bounded. */
  chunkStartTimes: number[];
  chunkDurationS: number;
}

export const FURY_ROAD: MediaFixture = {
  filename: "Mad Max- Fury Road (2015).mkv",
  isHdr: false,
  testResolutions: ["240p", "1080p", "4k"],
  // 4 consecutive 30s chunks — exercises chunk-boundary handover at non-zero start.
  chunkStartTimes: [0, 30, 60, 90],
  chunkDurationS: 30,
};

export const FURIOSA: MediaFixture = {
  filename: "Furiosa- A Mad Max Saga (2024) 4K.mkv",
  isHdr: true,
  // Skip 240p — HDR-tonemap on the VAAPI path is the interesting failure mode.
  testResolutions: ["1080p", "4k"],
  chunkStartTimes: [0, 30, 60, 90],
  chunkDurationS: 30,
};

export const ALL_FIXTURES: readonly MediaFixture[] = [FURY_ROAD, FURIOSA];
