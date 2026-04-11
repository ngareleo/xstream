import type { EventWrapper, NovaEvent } from "@nova/types";

export const PROFILE_ROW_ORIGINATOR = "ProfileRow";

export const ProfileRowEventTypes = {
  TOGGLED: "Toggled",
} as const;

export interface ProfileRowToggledData {
  libraryId: string;
}

export function createProfileRowToggledEvent(libraryId: string): NovaEvent<ProfileRowToggledData> {
  return {
    originator: PROFILE_ROW_ORIGINATOR,
    type: ProfileRowEventTypes.TOGGLED,
    data: () => ({ libraryId }),
  };
}

export function isProfileRowEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === PROFILE_ROW_ORIGINATOR;
}

export function isProfileRowToggledEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === PROFILE_ROW_ORIGINATOR &&
    wrapper.event.type === ProfileRowEventTypes.TOGGLED
  );
}
