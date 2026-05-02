import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useMemo, useState } from "react";
import { fetchQuery, graphql, useMutation, useRelayEnvironment } from "react-relay";

import { Poster } from "~/components/poster/Poster.js";
import { IconSearch } from "~/lib/icons.js";
import type {
  DetailPaneMatchMutation,
  DetailPaneMatchMutation$data,
} from "~/relay/__generated__/DetailPaneMatchMutation.graphql.js";
import type { DetailPaneSearchQuery } from "~/relay/__generated__/DetailPaneSearchQuery.graphql.js";

import { strings } from "./DetailPane.strings.js";
import { useDetailPaneStyles } from "./DetailPane.styles.js";
import { SEARCH_DEBOUNCE_MS, type SearchResult } from "./DetailPaneEdit.utils.js";

const MATCH_MUTATION = graphql`
  mutation DetailPaneMatchMutation($videoId: ID!, $imdbId: String!) {
    matchVideo(videoId: $videoId, imdbId: $imdbId) {
      id
      title
      ...DetailPane_video
    }
  }
`;

const SEARCH_QUERY = graphql`
  query DetailPaneSearchQuery($query: String!) {
    searchOmdb(query: $query) {
      imdbId
      title
      year
      posterUrl
    }
  }
`;

interface DetailPaneEditProps {
  videoId: string;
  initialQuery: string;
  onDone: () => void;
  onCancel: () => void;
}

export const DetailPaneEdit: FC<DetailPaneEditProps> = ({
  videoId,
  initialQuery,
  onDone,
  onCancel,
}) => {
  const styles = useDetailPaneStyles();
  const environment = useRelayEnvironment();
  const [commit, isInFlight] = useMutation<DetailPaneMatchMutation>(MATCH_MUTATION);

  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setSelected(null);
  }, [initialQuery, videoId]);

  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const sub = fetchQuery<DetailPaneSearchQuery>(environment, SEARCH_QUERY, {
        query: trimmed,
      }).subscribe({
        next: (data) => {
          if (cancelled) return;
          setResults(data.searchOmdb ?? []);
        },
        error: () => {
          if (!cancelled) setResults([]);
        },
      });
      return () => sub.unsubscribe();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, environment]);

  const handleEsc = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleLink = (): void => {
    if (!selected || isInFlight) return;
    setError(null);
    commit({
      variables: { videoId, imdbId: selected },
      onCompleted: (_data: DetailPaneMatchMutation$data, errors) => {
        if (errors && errors.length > 0) {
          setError(strings.saveError);
          return;
        }
        onDone();
      },
      onError: () => {
        setError(strings.saveError);
      },
    });
  };

  const canSave = selected !== null && !isInFlight;

  return (
    <>
      <div className={styles.editEyebrow}>{strings.editEyebrow}</div>

      <div className={styles.editSearchRow}>
        <span className={styles.editSearchIcon} aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className={styles.editSearchInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          onKeyDown={handleEsc}
          placeholder={strings.editSearchPlaceholder}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className={styles.editResults}>
        {trimmed.length === 0 ? (
          <div className={styles.editEmpty}>{strings.editEmpty}</div>
        ) : results.length === 0 ? (
          <div className={styles.editEmpty}>
            {strings.formatString(strings.editNoMatchesFormat, { q: trimmed })}
          </div>
        ) : (
          results.map((r) => (
            <button
              key={r.imdbId}
              type="button"
              onClick={() => setSelected(r.imdbId)}
              className={mergeClasses(
                styles.editResult,
                selected === r.imdbId && styles.editResultSelected
              )}
              aria-pressed={selected === r.imdbId}
            >
              <Poster
                url={r.posterUrl ?? null}
                alt={r.title}
                className={styles.editResultPoster}
                width={120}
              />
              <div className={styles.editResultText}>
                <div className={styles.editResultTitle}>
                  {r.title}
                  {r.year && <span className={styles.editResultYear}>· {r.year}</span>}
                </div>
                <div className={styles.editResultId}>{r.imdbId}</div>
              </div>
              <span className={styles.editResultMark} aria-hidden="true">
                {selected === r.imdbId ? "[x]" : "[ ]"}
              </span>
            </button>
          ))
        )}
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      <div className={styles.editFooter}>
        <button type="button" className={styles.editCancel} onClick={onCancel}>
          {strings.editCancel}
        </button>
        <button
          type="button"
          className={mergeClasses(styles.editSave, !canSave && styles.editSaveDisabled)}
          onClick={handleLink}
          disabled={!canSave}
          aria-disabled={!canSave}
        >
          {strings.editLink}
        </button>
      </div>
    </>
  );
};
