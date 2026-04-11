import type { EventWrapper, NovaEvent } from "@nova/types";

export const PROFILES_SIDEBAR_ORIGINATOR = "ProfilesSidebar";

export const ProfilesSidebarEventTypes = {
  LIBRARY_SELECTED: "LibrarySelected",
} as const;

export interface LibrarySelectedData {
  libraryId: string;
}

export function createLibrarySelectedEvent(libraryId: string): NovaEvent<LibrarySelectedData> {
  return {
    originator: PROFILES_SIDEBAR_ORIGINATOR,
    type: ProfilesSidebarEventTypes.LIBRARY_SELECTED,
    data: () => ({ libraryId }),
  };
}

export function isProfilesSidebarEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === PROFILES_SIDEBAR_ORIGINATOR;
}

export function isLibrarySelectedEvent(wrapper: EventWrapper): boolean {
  return (
    isProfilesSidebarEvent(wrapper) &&
    wrapper.event.type === ProfilesSidebarEventTypes.LIBRARY_SELECTED
  );
}
