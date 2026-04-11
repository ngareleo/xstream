import type { EventWrapper, NovaEvent } from "@nova/types";

import type { Resolution } from "~/types.js";

export const CONTROL_BAR_ORIGINATOR = "ControlBar";

export const ControlBarEventTypes = {
  PLAY_REQUESTED: "PlayRequested",
  RESOLUTION_CHANGED: "ResolutionChanged",
  SKIP_REQUESTED: "SkipRequested",
  VOLUME_CHANGED: "VolumeChanged",
  FULLSCREEN_REQUESTED: "FullscreenRequested",
} as const;

export type ControlBarEventType = (typeof ControlBarEventTypes)[keyof typeof ControlBarEventTypes];

export interface ResolutionChangedData {
  resolution: Resolution;
}

export interface SkipRequestedData {
  /** Seconds to skip; positive = forward, negative = backward. */
  seconds: number;
}

export interface VolumeChangedData {
  /** Normalised volume level, 0–1. */
  volume: number;
}

// ── Event factories ────────────────────────────────────────────────────────────
// Use these to construct events before calling bubble(). They keep the originator
// and type strings out of call sites and make the payload shape explicit.

/** Returns a play-requested Nova event for use with bubble(). */
export function createPlayRequestedEvent(): NovaEvent<void> {
  return { originator: CONTROL_BAR_ORIGINATOR, type: ControlBarEventTypes.PLAY_REQUESTED };
}

/** Returns a resolution-changed Nova event for use with bubble(). */
export function createResolutionChangedEvent(
  resolution: Resolution
): NovaEvent<ResolutionChangedData> {
  return {
    originator: CONTROL_BAR_ORIGINATOR,
    type: ControlBarEventTypes.RESOLUTION_CHANGED,
    data: () => ({ resolution }),
  };
}

/** Returns a skip-requested Nova event for use with bubble(). */
export function createSkipRequestedEvent(seconds: number): NovaEvent<SkipRequestedData> {
  return {
    originator: CONTROL_BAR_ORIGINATOR,
    type: ControlBarEventTypes.SKIP_REQUESTED,
    data: () => ({ seconds }),
  };
}

/** Returns a volume-changed Nova event for use with bubble(). */
export function createVolumeChangedEvent(volume: number): NovaEvent<VolumeChangedData> {
  return {
    originator: CONTROL_BAR_ORIGINATOR,
    type: ControlBarEventTypes.VOLUME_CHANGED,
    data: () => ({ volume }),
  };
}

/** Returns a fullscreen-requested Nova event for use with bubble(). */
export function createFullscreenRequestedEvent(): NovaEvent<void> {
  return { originator: CONTROL_BAR_ORIGINATOR, type: ControlBarEventTypes.FULLSCREEN_REQUESTED };
}

// ── Event guards ───────────────────────────────────────────────────────────────
// Use these in NovaEventingInterceptor handlers instead of comparing raw strings.

/** Returns true if the wrapper originated from ControlBar. */
export function isControlBarEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === CONTROL_BAR_ORIGINATOR;
}

/** Returns true if the wrapper is a ControlBar play-requested event. */
export function isPlayRequestedEvent(wrapper: EventWrapper): boolean {
  return isControlBarEvent(wrapper) && wrapper.event.type === ControlBarEventTypes.PLAY_REQUESTED;
}

/** Returns true if the wrapper is a ControlBar resolution-changed event. */
export function isResolutionChangedEvent(wrapper: EventWrapper): boolean {
  return (
    isControlBarEvent(wrapper) && wrapper.event.type === ControlBarEventTypes.RESOLUTION_CHANGED
  );
}

/** Returns true if the wrapper is a ControlBar skip-requested event. */
export function isSkipRequestedEvent(wrapper: EventWrapper): boolean {
  return isControlBarEvent(wrapper) && wrapper.event.type === ControlBarEventTypes.SKIP_REQUESTED;
}

/** Returns true if the wrapper is a ControlBar volume-changed event. */
export function isVolumeChangedEvent(wrapper: EventWrapper): boolean {
  return isControlBarEvent(wrapper) && wrapper.event.type === ControlBarEventTypes.VOLUME_CHANGED;
}

/** Returns true if the wrapper is a ControlBar fullscreen-requested event. */
export function isFullscreenRequestedEvent(wrapper: EventWrapper): boolean {
  return (
    isControlBarEvent(wrapper) && wrapper.event.type === ControlBarEventTypes.FULLSCREEN_REQUESTED
  );
}
