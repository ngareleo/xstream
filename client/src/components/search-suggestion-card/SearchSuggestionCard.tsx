import { useNovaEventing } from "@nova/react";
import { type FC } from "react";

import {
  createSuggestionSelectedEvent,
  type SuggestionSelectedData,
} from "./SearchSuggestionCard.events.js";
import { useSearchSuggestionCardStyles } from "./SearchSuggestionCard.styles.js";

interface Props {
  suggestion: SuggestionSelectedData;
}

export const SearchSuggestionCard: FC<Props> = ({ suggestion }) => {
  const styles = useSearchSuggestionCardStyles();
  const { bubble } = useNovaEventing();

  return (
    <button
      className={styles.root}
      onClick={(e) => {
        void bubble({ reactEvent: e, event: createSuggestionSelectedEvent(suggestion) });
      }}
      type="button"
    >
      <div
        className={styles.thumb}
        style={
          suggestion.posterUrl ? { backgroundImage: `url(${suggestion.posterUrl})` } : undefined
        }
      />
      <div className={styles.info}>
        <div className={styles.title}>{suggestion.title}</div>
        {suggestion.year != null && <div className={styles.year}>{suggestion.year}</div>}
      </div>
    </button>
  );
};
