import type { EventWrapper, NovaEvent } from "@nova/types";

export const SEARCH_SUGGESTION_CARD_ORIGINATOR = "SearchSuggestionCard";

export const SearchSuggestionCardEventTypes = {
  SELECTED: "Selected",
} as const;

export interface SuggestionSelectedData {
  imdbId: string;
  title: string;
  year: number | null | undefined;
  posterUrl: string | null | undefined;
}

export function createSuggestionSelectedEvent(
  suggestion: SuggestionSelectedData
): NovaEvent<SuggestionSelectedData> {
  return {
    originator: SEARCH_SUGGESTION_CARD_ORIGINATOR,
    type: SearchSuggestionCardEventTypes.SELECTED,
    data: () => suggestion,
  };
}

export function isSuggestionSelectedEvent(wrapper: EventWrapper): boolean {
  return (
    wrapper.event.originator === SEARCH_SUGGESTION_CARD_ORIGINATOR &&
    wrapper.event.type === SearchSuggestionCardEventTypes.SELECTED
  );
}
