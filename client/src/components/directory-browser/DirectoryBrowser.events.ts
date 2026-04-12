import type { EventWrapper, NovaEvent } from "@nova/types";

export const DIRECTORY_BROWSER_ORIGINATOR = "DirectoryBrowser";

export const DirectoryBrowserEventTypes = {
  FOLDER_SELECTED: "FolderSelected",
} as const;

export interface FolderSelectedData {
  path: string;
}

export function createFolderSelectedEvent(path: string): NovaEvent<FolderSelectedData> {
  return {
    originator: DIRECTORY_BROWSER_ORIGINATOR,
    type: DirectoryBrowserEventTypes.FOLDER_SELECTED,
    data: () => ({ path }),
  };
}

export function isDirectoryBrowserEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === DIRECTORY_BROWSER_ORIGINATOR;
}

export function isFolderSelectedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === DIRECTORY_BROWSER_ORIGINATOR &&
    wrapper.event.type === DirectoryBrowserEventTypes.FOLDER_SELECTED
  );
}
