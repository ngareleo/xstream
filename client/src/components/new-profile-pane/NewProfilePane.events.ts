import type { EventWrapper, NovaEvent } from "@nova/types";

export const NEW_PROFILE_PANE_ORIGINATOR = "NewProfilePane";

export const NewProfilePaneEventTypes = {
  CLOSED: "Closed",
  LIBRARY_CREATED: "LibraryCreated",
} as const;

export interface NewProfilePaneLibraryCreatedData {
  libraryId: string;
}

export function createNewProfilePaneClosedEvent(): NovaEvent<Record<string, never>> {
  return {
    originator: NEW_PROFILE_PANE_ORIGINATOR,
    type: NewProfilePaneEventTypes.CLOSED,
    data: () => ({}),
  };
}

export function createNewProfilePaneLibraryCreatedEvent(
  libraryId: string
): NovaEvent<NewProfilePaneLibraryCreatedData> {
  return {
    originator: NEW_PROFILE_PANE_ORIGINATOR,
    type: NewProfilePaneEventTypes.LIBRARY_CREATED,
    data: () => ({ libraryId }),
  };
}

export function isNewProfilePaneEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === NEW_PROFILE_PANE_ORIGINATOR;
}

export function isNewProfilePaneClosedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === NEW_PROFILE_PANE_ORIGINATOR &&
    wrapper.event.type === NewProfilePaneEventTypes.CLOSED
  );
}

export function isNewProfilePaneLibraryCreatedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === NEW_PROFILE_PANE_ORIGINATOR &&
    wrapper.event.type === NewProfilePaneEventTypes.LIBRARY_CREATED
  );
}
