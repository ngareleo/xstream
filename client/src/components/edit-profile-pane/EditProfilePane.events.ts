import type { EventWrapper, NovaEvent } from "@nova/types";

export const EDIT_PROFILE_PANE_ORIGINATOR = "EditProfilePane";

export const EditProfilePaneEventTypes = {
  CLOSED: "Closed",
  SAVED: "Saved",
  DELETED: "Deleted",
} as const;

export function createEditProfilePaneClosedEvent(): NovaEvent<Record<string, never>> {
  return {
    originator: EDIT_PROFILE_PANE_ORIGINATOR,
    type: EditProfilePaneEventTypes.CLOSED,
    data: () => ({}),
  };
}

export function createEditProfilePaneSavedEvent(): NovaEvent<Record<string, never>> {
  return {
    originator: EDIT_PROFILE_PANE_ORIGINATOR,
    type: EditProfilePaneEventTypes.SAVED,
    data: () => ({}),
  };
}

export function isEditProfilePaneClosedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === EDIT_PROFILE_PANE_ORIGINATOR &&
    wrapper.event.type === EditProfilePaneEventTypes.CLOSED
  );
}

export function isEditProfilePaneSavedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === EDIT_PROFILE_PANE_ORIGINATOR &&
    wrapper.event.type === EditProfilePaneEventTypes.SAVED
  );
}

export function createEditProfilePaneDeletedEvent(): NovaEvent<Record<string, never>> {
  return {
    originator: EDIT_PROFILE_PANE_ORIGINATOR,
    type: EditProfilePaneEventTypes.DELETED,
    data: () => ({}),
  };
}

export function isEditProfilePaneDeletedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === EDIT_PROFILE_PANE_ORIGINATOR &&
    wrapper.event.type === EditProfilePaneEventTypes.DELETED
  );
}
