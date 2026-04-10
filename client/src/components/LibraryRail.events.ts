import type { EventWrapper, NovaEvent } from "@nova/types";

export const LIBRARY_RAIL_ORIGINATOR = "LibraryRail";

export const LibraryRailEventTypes = {
  LIBRARY_SELECTED: "LibrarySelected",
} as const;

export interface LibraryRailSelectedData {
  libraryId: string;
}

export function createLibraryRailSelectedEvent(
  libraryId: string
): NovaEvent<LibraryRailSelectedData> {
  return {
    originator: LIBRARY_RAIL_ORIGINATOR,
    type: LibraryRailEventTypes.LIBRARY_SELECTED,
    data: () => ({ libraryId }),
  };
}

export function isLibraryRailSelectedEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === LIBRARY_RAIL_ORIGINATOR;
}
