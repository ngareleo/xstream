import type { EventWrapper, NovaEvent } from "@nova/types";

export const FILM_DETAIL_PANE_ORIGINATOR = "FilmDetailPane";

export const FilmDetailPaneEventTypes = {
  CLOSED: "Closed",
} as const;

export function createFilmDetailPaneClosedEvent(): NovaEvent<Record<string, never>> {
  return {
    originator: FILM_DETAIL_PANE_ORIGINATOR,
    type: FilmDetailPaneEventTypes.CLOSED,
    data: () => ({}),
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
