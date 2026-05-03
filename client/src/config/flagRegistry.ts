/**
 * Flag declarations only — no runtime behaviour.
 *
 * This file is the authoritative list of feature flags the app ships with.
 * The cache, hydration, and pub/sub live in `featureFlags.ts`; the React
 * integration lives in `FeatureFlagsContext.tsx`. Keeping the declarations
 * isolated makes it obvious at a glance what flags exist, and keeps the
 * runtime surface from churning when a flag is added or retired.
 *
 * To add a new flag: append an entry to `FLAG_REGISTRY` below. The FlagsTab
 * in Settings renders from the registry automatically, and the server
 * persists values through the existing `setSetting` mutation. Flags are
 * grouped by `category` and displayed together in the UI.
 */

import { clientConfig } from "~/config/appConfig.js";

export type FlagValueType = "boolean" | "number";
export type FlagValue = boolean | number;
export type FlagCategory = "playback" | "telemetry" | "ui" | "experimental";

export interface FlagDescriptor {
  /** Storage key used in `user_settings`. Must start with `flag.` for booleans
   *  and `config.` for tunable numbers — purely a naming convention, no
   *  enforcement — so the UI can visually group them. */
  key: string;
  name: string;
  description: string;
  valueType: FlagValueType;
  defaultValue: FlagValue;
  category: FlagCategory;
  /** Optional constraints for numeric flags rendered in the FlagsTab. */
  min?: number;
  max?: number;
  step?: number;
}

export const FLAG_KEYS = {
  experimentalBuffer: "flag.experimentalBuffer",
  bufferForwardTargetS: "config.bufferForwardTargetS",
  bufferForwardResumeS: "config.bufferForwardResumeS",
} as const;

export const FLAG_REGISTRY: readonly FlagDescriptor[] = [
  {
    key: FLAG_KEYS.experimentalBuffer,
    name: "Experimental buffer tuning",
    description:
      "When on, the next playback session uses the buffer values below instead of the defaults. Off falls back to clientConfig.buffer.",
    valueType: "boolean",
    defaultValue: false,
    category: "playback",
  },
  {
    key: FLAG_KEYS.bufferForwardTargetS,
    name: "Buffer forward target (s)",
    description: "Pause the stream when bufferedAhead exceeds this many seconds.",
    valueType: "number",
    defaultValue: clientConfig.buffer.forwardTargetS,
    category: "playback",
    min: 2,
    max: 120,
    step: 1,
  },
  {
    key: FLAG_KEYS.bufferForwardResumeS,
    name: "Buffer forward resume (s)",
    description:
      "Resume the stream when bufferedAhead drops below this. Gap to target is the hysteresis width — narrower gaps cause rapid pause/resume churn.",
    valueType: "number",
    defaultValue: clientConfig.buffer.forwardResumeS,
    category: "playback",
    min: 0,
    max: 60,
    step: 1,
  },
];
