import type { EventWrapper, NovaEvent } from "@nova/types";

export const FILM_DETAIL_PANE_ORIGINATOR = "FilmDetailPane";

export const FilmDetailPaneEventTypes = {
  CLOSED: "Closed",
  LINKING_CHANGED: "LinkingChanged",
} as const;

export interface FilmDetailPaneLinkingChangedData {
  linking: boolean;
}

export function createFilmDetailPaneClosedEvent(): NovaEvent<Record<string, never>> {
  return {
    originator: FILM_DETAIL_PANE_ORIGINATOR,
    type: FilmDetailPaneEventTypes.CLOSED,
    data: () => ({}),
  };
}

export function createFilmDetailPaneLinkingChangedEvent(
  linking: boolean
): NovaEvent<FilmDetailPaneLinkingChangedData> {
  return {
    originator: FILM_DETAIL_PANE_ORIGINATOR,
    type: FilmDetailPaneEventTypes.LINKING_CHANGED,
    data: () => ({ linking }),
  };
}

export function isFilmDetailPaneEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === FILM_DETAIL_PANE_ORIGINATOR;
}

export function isFilmDetailPaneClosedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === FILM_DETAIL_PANE_ORIGINATOR &&
    wrapper.event.type === FilmDetailPaneEventTypes.CLOSED
  );
}

export function isFilmDetailPaneLinkingChangedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === FILM_DETAIL_PANE_ORIGINATOR &&
    wrapper.event.type === FilmDetailPaneEventTypes.LINKING_CHANGED
  );
}
