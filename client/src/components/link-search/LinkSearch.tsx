/**
 * LinkSearch — inline metadata search for the re-link flow.
 *
 * Shown inside FilmDetailPane when the user clicks RE-LINK.
 * Debounces input by 500ms, fires searchOmdb query via fetchQuery,
 * then presents results as clickable suggestion rows.
 *
 * The parent provides `videoId` and an `onLinked` callback; on selection
 * the parent fires the matchVideo mutation.
 */

import { type FC, useEffect, useRef, useState } from "react";
import { fetchQuery, graphql } from "relay-runtime";

import { IconClose, IconSearch, IconSpinner } from "~/lib/icons.js";
import { environment } from "~/relay/environment.js";

import { strings } from "./LinkSearch.strings.js";
import { useLinkSearchStyles } from "./LinkSearch.styles.js";

const SEARCH_QUERY = graphql`
  query LinkSearchOmdbQuery($query: String!) {
    searchOmdb(query: $query) {
      imdbId
      title
      year
      posterUrl
    }
  }
`;

const OMDB_CONFIG_QUERY = graphql`
  query LinkSearchOmdbConfigQuery {
    omdbConfigured
  }
`;

export interface OmdbSuggestion {
  imdbId: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
}

interface Props {
  filename: string;
  onLinked: (suggestion: OmdbSuggestion, e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
}

type SearchStatus = "idle" | "searching" | "results";

export const LinkSearch: FC<Props> = ({ filename, onLinked, onCancel }) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<OmdbSuggestion[]>([]);
  const [omdbConfigured, setOmdbConfigured] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = useLinkSearchStyles();

  useEffect(() => {
    fetchQuery(environment, OMDB_CONFIG_QUERY, {}).subscribe({
      next: (data) => {
        const d = data as { omdbConfigured: boolean };
        setOmdbConfigured(d.omdbConfigured);
      },
      error: () => {
        setOmdbConfigured(false);
      },
    });
  }, []);

  useEffect(() => {
    if (omdbConfigured) {
      inputRef.current?.focus();
    }
  }, [omdbConfigured]);

  useEffect(() => {
    if (!query.trim()) {
      setStatus("idle");
      setSuggestions([]);
      return;
    }

    setStatus("searching");
    const id = setTimeout(() => {
      fetchQuery(environment, SEARCH_QUERY, { query: query.trim() }).subscribe({
        next: (data) => {
          const d = data as { searchOmdb: OmdbSuggestion[] };
          setSuggestions(d.searchOmdb ?? []);
          setStatus("results");
        },
        error: () => {
          setSuggestions([]);
          setStatus("results");
        },
      });
    }, 500);

    return () => clearTimeout(id);
  }, [query]);

  return (
    <div className={styles.root}>
      {/* File being linked */}
      <div className={styles.fileRow}>
        <div className={styles.fileLabel}>{strings.linkingFile}</div>
        <div className={styles.fileName} title={filename}>
          {filename}
        </div>
      </div>

      {omdbConfigured === false ? (
        <div className={styles.omdbHint}>
          <div className={styles.omdbHintTitle}>{strings.omdbNotConfiguredTitle}</div>
          <div className={styles.omdbHintBody}>{strings.omdbNotConfiguredBody}</div>
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className={styles.inputWrap}>
            <IconSearch size={13} className={styles.searchIcon} />
            <input
              ref={inputRef}
              type="text"
              className={styles.input}
              placeholder={strings.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {status === "searching" && <IconSpinner size={13} className={styles.spinner} />}
            {query && status !== "searching" && (
              <button
                className={styles.clearBtn}
                onClick={() => setQuery("")}
                aria-label={strings.clearSearch}
              >
                <IconClose size={11} />
              </button>
            )}
          </div>

          {/* Suggestions */}
          {status === "results" && (
            <div className={styles.suggestions}>
              {suggestions.map((s) => (
                <button key={s.imdbId} className={styles.item} onClick={(e) => onLinked(s, e)}>
                  <div
                    className={styles.thumb}
                    style={s.posterUrl ? { backgroundImage: `url(${s.posterUrl})` } : undefined}
                  />
                  <div className={styles.info}>
                    <div className={styles.title}>{s.title}</div>
                    {s.year != null && <div className={styles.year}>{s.year}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Cancel */}
      <button className={styles.cancelBtn} onClick={(e) => onCancel(e)}>
        {strings.cancel}
      </button>
    </div>
  );
};
