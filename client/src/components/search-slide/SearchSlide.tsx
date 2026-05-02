import type { FC } from "react";

import { strings } from "./SearchSlide.strings";
import { useSearchSlideStyles } from "./SearchSlide.styles";

interface SearchSlideProps {
  query: string;
  resultCount: number;
  totalMatched: number;
  profilesMatched: number;
  activeFilterCount: number;
  onOpenFilter: () => void;
  onClear: () => void;
}

export const SearchSlide: FC<SearchSlideProps> = ({
  query,
  resultCount,
  totalMatched,
  profilesMatched,
  activeFilterCount,
  onOpenFilter,
  onClear,
}) => {
  const styles = useSearchSlideStyles();
  const hasQuery = query.trim().length > 0;
  const hasFilters = activeFilterCount > 0;

  let eyebrow: string;
  if (hasQuery) {
    eyebrow = `${strings.eyebrowQuery} · ${resultCount} ${resultCount === 1 ? strings.result : strings.results}`;
  } else if (hasFilters) {
    eyebrow = `${strings.eyebrowFiltered} · ${resultCount} ${resultCount === 1 ? strings.film : strings.films}`;
  } else {
    eyebrow = strings.eyebrowSearch;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.eyebrow}>
        · {eyebrow}
        {hasFilters && hasQuery && (
          <>
            {" "}
            ·{" "}
            <span className={styles.eyebrowAccent}>
              {activeFilterCount} {activeFilterCount === 1 ? strings.filter : strings.filters}
            </span>
          </>
        )}
      </div>

      <div className={styles.promptRow}>
        <span className={styles.promptCaret}>&gt;</span>
        <span className={styles.promptText}>
          {hasQuery ? query : ""}
          <span className={styles.promptCursor} aria-hidden="true" />
        </span>
      </div>

      <div className={styles.status}>
        {hasQuery ? (
          <>
            <span>
              {resultCount} of {totalMatched} {totalMatched === 1 ? strings.match : strings.matches}
            </span>
            <span className={styles.statusSep}>·</span>
            <span>
              {profilesMatched} {profilesMatched === 1 ? strings.profile : strings.profiles}
            </span>
            {hasFilters && (
              <>
                <span className={styles.statusSep}>·</span>
                <span className={styles.statusAccent}>filtered ({activeFilterCount})</span>
              </>
            )}
          </>
        ) : hasFilters ? (
          <>
            <span>
              {resultCount} of {totalMatched} {strings.films}
            </span>
            <span className={styles.statusSep}>·</span>
            <span>
              {profilesMatched} {profilesMatched === 1 ? strings.profile : strings.profiles}
            </span>
            <span className={styles.statusSep}>·</span>
            <span className={styles.statusAccent}>
              {activeFilterCount} {activeFilterCount === 1 ? strings.filter : strings.filters} on
            </span>
          </>
        ) : (
          <span className={styles.statusHint}>{strings.statusHint}</span>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onOpenFilter}>
          {strings.actionFilter}
        </button>
        <button type="button" className={styles.secondary} onClick={onClear}>
          {strings.actionClear}
        </button>
      </div>
    </div>
  );
};
