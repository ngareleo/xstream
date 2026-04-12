import type { EventWrapper, NovaEvent } from "@nova/types";

export const PROFILE_ROW_ORIGINATOR = "ProfileRow";

export const ProfileRowEventTypes = {
  TOGGLED: "Toggled",
  SCAN_REQUESTED: "ScanRequested",
  EDIT_REQUESTED: "EditRequested",
} as const;

export interface ProfileRowToggledData {
  libraryId: string;
}

export interface ProfileRowScanRequestedData {
  libraryId: string;
}

export interface ProfileRowEditRequestedData {
  libraryId: string;
}

export function createProfileRowToggledEvent(libraryId: string): NovaEvent<ProfileRowToggledData> {
  return {
    originator: PROFILE_ROW_ORIGINATOR,
    type: ProfileRowEventTypes.TOGGLED,
    data: () => ({ libraryId }),
  };
}

export function createProfileRowScanRequestedEvent(
  libraryId: string
): NovaEvent<ProfileRowScanRequestedData> {
  return {
    originator: PROFILE_ROW_ORIGINATOR,
    type: ProfileRowEventTypes.SCAN_REQUESTED,
    data: () => ({ libraryId }),
  };
}

export function createProfileRowEditRequestedEvent(
  libraryId: string
): NovaEvent<ProfileRowEditRequestedData> {
  return {
    originator: PROFILE_ROW_ORIGINATOR,
    type: ProfileRowEventTypes.EDIT_REQUESTED,
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

export function isProfileRowScanRequestedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === PROFILE_ROW_ORIGINATOR &&
    wrapper.event.type === ProfileRowEventTypes.SCAN_REQUESTED
  );
}

export function isProfileRowEditRequestedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === PROFILE_ROW_ORIGINATOR &&
    wrapper.event.type === ProfileRowEventTypes.EDIT_REQUESTED
  );
}
