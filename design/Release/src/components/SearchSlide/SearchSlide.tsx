import { type FC } from "react";
import { useSearchSlideStyles } from "./SearchSlide.styles.js";

interface SearchSlideProps {
  query: string;
  resultCount: number;
  totalMatched: number;
  profilesMatched: number;
  activeFilterCount: number;
  onOpenFilter: () => void;
  onClear: () => void;
}

/**
 * Hero panel shown when the Library search bar has focus or content.
 * Echoes the query in giant monospace, exposes a [F] Filter affordance,
 * and reads as a TUI-style prompt.
 */
export const SearchSlide: FC<SearchSlideProps> = ({
  query,
  resultCount,
  totalMatched,
  profilesMatched,
  activeFilterCount,
  onOpenFilter,
  onClear,
}) => {
  const s = useSearchSlideStyles();
  const hasQuery = query.trim().length > 0;
  return (
    <div className={s.panel}>
      <div className={s.eyebrow}>
        ·{" "}
        {hasQuery
          ? `query · ${resultCount} ${resultCount === 1 ? "result" : "results"}`
          : "search"}
        {activeFilterCount > 0 && (
          <>
            {" "}
            ·{" "}
            <span className={s.eyebrowAccent}>
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
            </span>
          </>
        )}
      </div>

      <div className={s.promptRow}>
        <span className={s.promptCaret}>&gt;</span>
        <span className={s.promptText}>
          {hasQuery ? query : ""}
          <span className={s.promptCursor} aria-hidden="true" />
        </span>
      </div>

      <div className={s.status}>
        {hasQuery ? (
          <>
            <span>
              {resultCount} of {totalMatched}{" "}
              {totalMatched === 1 ? "match" : "matches"}
            </span>
            <span className={s.statusSep}>·</span>
            <span>
              {profilesMatched}{" "}
              {profilesMatched === 1 ? "profile" : "profiles"}
            </span>
            {activeFilterCount > 0 && (
              <>
                <span className={s.statusSep}>·</span>
                <span className={s.statusAccent}>
                  filtered ({activeFilterCount})
                </span>
              </>
            )}
          </>
        ) : (
          <span className={s.statusHint}>
            type to search films, directors, genres
          </span>
        )}
      </div>

      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={onOpenFilter}>
          [F] Filter
        </button>
        <button type="button" className={s.secondary} onClick={onClear}>
          [ESC] Clear
        </button>
      </div>
    </div>
  );
};
