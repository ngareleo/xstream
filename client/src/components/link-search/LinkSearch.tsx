import { useNovaEventing } from "@nova/react";
import { type FC, useEffect, useRef, useState } from "react";
import { fetchQuery, graphql, useRelayEnvironment } from "react-relay";

import { SearchSuggestionCard } from "~/components/search-suggestion-card/SearchSuggestionCard.js";
import { IconClose, IconSearch, IconSpinner } from "~/lib/icons.js";
import type {
  LinkSearchQuery,
  LinkSearchQuery$data,
} from "~/relay/__generated__/LinkSearchQuery.graphql.js";

import { createLinkSearchCancelledEvent } from "./LinkSearch.events.js";
import { strings } from "./LinkSearch.strings.js";
import { useLinkSearchStyles } from "./LinkSearch.styles.js";

const SEARCH_QUERY = graphql`
  query LinkSearchQuery($query: String!) {
    searchOmdb(query: $query) {
      imdbId
      title
      year
      posterUrl
    }
  }
`;

type Suggestion = LinkSearchQuery$data["searchOmdb"][number];

interface Props {
  filename: string;
}

type SearchStatus = "idle" | "searching" | "results";

export const LinkSearch: FC<Props> = ({ filename }) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const styles = useLinkSearchStyles();
  const { bubble } = useNovaEventing();
  const environment = useRelayEnvironment();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setStatus("idle");
      setSuggestions([]);
      return;
    }

    setStatus("searching");
    let sub: { unsubscribe: () => void } | null = null;

    const id = setTimeout(() => {
      sub = fetchQuery<LinkSearchQuery>(environment, SEARCH_QUERY, {
        query: query.trim(),
      }).subscribe({
        next: (data) => {
          setSuggestions([...(data.searchOmdb ?? [])]);
          setStatus("results");
        },
        error: () => {
          setStatus("results");
        },
      });
    }, 500);

    return () => {
      clearTimeout(id);
      sub?.unsubscribe();
    };
  }, [query, environment]);

  return (
    <div className={styles.root}>
      {/* File being linked */}
      <div className={styles.fileRow}>
        <div className={styles.fileLabel}>{strings.linkingFile}</div>
        <div className={styles.fileName} title={filename}>
          {filename}
        </div>
      </div>

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
          {suggestions.length === 0 ? (
            <div className={styles.noResults}>{strings.noResults}</div>
          ) : (
            suggestions.map((s) => <SearchSuggestionCard key={s.imdbId} suggestion={s} />)
          )}
        </div>
      )}

      {/* Cancel */}
      <button
        className={styles.cancelBtn}
        onClick={(e) => {
          void bubble({ reactEvent: e, event: createLinkSearchCancelledEvent() });
        }}
      >
        {strings.cancel}
      </button>
    </div>
  );
};
