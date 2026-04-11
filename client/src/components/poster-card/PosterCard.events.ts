import type { EventWrapper, NovaEvent } from "@nova/types";

export const POSTER_CARD_ORIGINATOR = "PosterCard";

export const PosterCardEventTypes = {
  FILM_SELECTED: "FilmSelected",
} as const;

export interface PosterCardFilmSelectedData {
  videoId: string;
}

export function createPosterCardFilmSelectedEvent(
  videoId: string
): NovaEvent<PosterCardFilmSelectedData> {
  return {
    originator: POSTER_CARD_ORIGINATOR,
    type: PosterCardEventTypes.FILM_SELECTED,
    data: () => ({ videoId }),
  };
}

export function isPosterCardEvent(wrapper: EventWrapper): boolean {
  return wrapper.event.originator === POSTER_CARD_ORIGINATOR;
}

export function isPosterCardFilmSelectedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === POSTER_CARD_ORIGINATOR &&
    wrapper.event.type === PosterCardEventTypes.FILM_SELECTED
  );
}
