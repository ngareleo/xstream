import type { EventWrapper, NovaEvent } from "@nova/types";

export const FILM_ROW_ORIGINATOR = "FilmRow";

export const FilmRowEventTypes = {
  FILM_SELECTED: "FilmSelected",
} as const;

export interface FilmSelectedData {
  videoId: string;
}

export function createFilmSelectedEvent(videoId: string): NovaEvent<FilmSelectedData> {
  return {
    originator: FILM_ROW_ORIGINATOR,
    type: FilmRowEventTypes.FILM_SELECTED,
    data: () => ({ videoId }),
  };
}

export function isFilmRowEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === FILM_ROW_ORIGINATOR;
}

export function isFilmSelectedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === FILM_ROW_ORIGINATOR &&
    wrapper.event.type === FilmRowEventTypes.FILM_SELECTED
  );
}
