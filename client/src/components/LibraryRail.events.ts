import type { EventWrapper, NovaEvent } from "@nova/types";

/** Originator string that identifies all events emitted by LibraryRail. */
export const LIBRARY_RAIL_ORIGINATOR = "LibraryRail";

/** Event type constants for LibraryRail. */
export const LibraryRailEventTypes = {
  /** Fired when the user clicks a library icon in the rail. */
  LIBRARY_SELECTED: "LibrarySelected",
} as const;

/** Payload carried by a LibrarySelected event. */
export interface LibraryRailSelectedData {
  /** The Relay global ID of the library the user selected. */
  libraryId: string;
}

/**
 * Factory — creates a LibrarySelected Nova event for the given library ID.
 * Call this inside LibraryRail when the user clicks an icon; never construct
 * the event object inline at the call site.
 */
export function createLibraryRailSelectedEvent(
  libraryId: string
): NovaEvent<LibraryRailSelectedData> {
  return {
    originator: LIBRARY_RAIL_ORIGINATOR,
    type: LibraryRailEventTypes.LIBRARY_SELECTED,
    data: () => ({ libraryId }),
  };
}

/**
 * Type guard — returns true when the event wrapper originated from LibraryRail.
 * Use this in a `NovaEventingInterceptor` to filter for rail events before
 * inspecting the event type or reading the payload.
 */
export function isLibraryRailSelectedEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === LIBRARY_RAIL_ORIGINATOR;
}
