/**
 * LinkSearch — inline metadata search for unmatched / re-link flow.
 *
 * Replaces the detail-pane content area when the user clicks RE-LINK.
 * Debounces input by 550ms, shows a spinner while "searching", then
 * drops in a suggestion panel with poster image, title, and year.
 *
 * In the design lab results come from a local mock pool.
 * In production replace `searchSuggestions` with an OMDb/TMDB API call.
 */

import { type FC, useEffect, useRef, useState } from "react";
import { IconSearch, IconSpinner, IconClose } from "../../lib/icons.js";
import { useLinkSearchStyles } from "./LinkSearch.styles.js";

// ── Mock suggestion pool ──────────────────────────────────────────────────────
// Gradient colours are approximations of each film's dominant poster hue.

export interface Suggestion {
  id:       string;
  title:    string;
  year:     number;
  gradient: string;
}

const POOL: Suggestion[] = [
  { id: "sg-01", title: "Dune: Part One",              year: 2021, gradient: "linear-gradient(145deg,#c4a35a 0%,#5a3e0a 100%)" },
  { id: "sg-02", title: "The Dark Knight",             year: 2008, gradient: "linear-gradient(145deg,#1a1a2e 0%,#0d0d1a 100%)" },
  { id: "sg-03", title: "Inception",                   year: 2010, gradient: "linear-gradient(145deg,#1a3a5e 0%,#0a1a2e 100%)" },
  { id: "sg-04", title: "Fight Club",                  year: 1999, gradient: "linear-gradient(145deg,#2a1a0a 0%,#1a0a0a 100%)" },
  { id: "sg-05", title: "Pulp Fiction",                year: 1994, gradient: "linear-gradient(145deg,#3a2a0a 0%,#1a0a2a 100%)" },
  { id: "sg-06", title: "The Godfather",               year: 1972, gradient: "linear-gradient(145deg,#1a0a0a 0%,#0a0a0a 100%)" },
  { id: "sg-07", title: "Goodfellas",                  year: 1990, gradient: "linear-gradient(145deg,#1a0a2a 0%,#0a0a1a 100%)" },
  { id: "sg-08", title: "2001: A Space Odyssey",       year: 1968, gradient: "linear-gradient(145deg,#0a0a2a 0%,#1a0a3a 100%)" },
  { id: "sg-09", title: "Blade Runner",                year: 1982, gradient: "linear-gradient(145deg,#0a1a3a 0%,#1a0a3a 100%)" },
  { id: "sg-10", title: "Alien",                       year: 1979, gradient: "linear-gradient(145deg,#0a1a0a 0%,#0a0a1a 100%)" },
  { id: "sg-11", title: "The Matrix",                  year: 1999, gradient: "linear-gradient(145deg,#0a1a0a 0%,#000a00 100%)" },
  { id: "sg-12", title: "Avengers: Endgame",           year: 2019, gradient: "linear-gradient(145deg,#1a0a2a 0%,#0a0a2a 100%)" },
  { id: "sg-13", title: "No Country for Old Men",      year: 2007, gradient: "linear-gradient(145deg,#2a1a0a 0%,#1a0a00 100%)" },
  { id: "sg-14", title: "There Will Be Blood",         year: 2007, gradient: "linear-gradient(145deg,#2a0a00 0%,#1a0a0a 100%)" },
  { id: "sg-15", title: "Whiplash",                    year: 2014, gradient: "linear-gradient(145deg,#1a0a0a 0%,#2a1a0a 100%)" },
  { id: "sg-16", title: "La La Land",                  year: 2016, gradient: "linear-gradient(145deg,#2a1a3a 0%,#1a0a3a 100%)" },
  { id: "sg-17", title: "The Revenant",                year: 2015, gradient: "linear-gradient(145deg,#1a2a3a 0%,#0a1a2a 100%)" },
  { id: "sg-18", title: "Mad Max: Fury Road",          year: 2015, gradient: "linear-gradient(145deg,#3a1a00 0%,#2a0a00 100%)" },
  { id: "sg-19", title: "Dunkirk",                     year: 2017, gradient: "linear-gradient(145deg,#1a2a3a 0%,#0a1a2a 100%)" },
  { id: "sg-20", title: "Tenet",                       year: 2020, gradient: "linear-gradient(145deg,#0a1a2a 0%,#1a1a2a 100%)" },
];

/** Returns up to 5 results. Matching titles first, padded with pool items. */
function searchSuggestions(query: string): Suggestion[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const matches    = POOL.filter((s) => s.title.toLowerCase().includes(q));
  const nonMatches = POOL.filter((s) => !s.title.toLowerCase().includes(q));

  // Always return at least 3 suggestions so the UI always shows a panel
  const combined = [...matches, ...nonMatches].slice(0, 5);
  return combined;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LinkSearchProps {
  filename:  string;
  onLink:    (suggestion: Suggestion) => void;
  onCancel:  () => void;
}

type SearchStatus = "idle" | "searching" | "results";

export const LinkSearch: FC<LinkSearchProps> = ({ filename, onLink, onCancel }) => {
  const [query,       setQuery]       = useState("");
  const [status,      setStatus]      = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when the component mounts
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounce: show spinner immediately, resolve after 550ms
  useEffect(() => {
    if (!query.trim()) {
      setStatus("idle");
      setSuggestions([]);
      return;
    }

    setStatus("searching");
    const id = setTimeout(() => {
      setSuggestions(searchSuggestions(query));
      setStatus("results");
    }, 550);

    return () => clearTimeout(id);
  }, [query]);

  const styles = useLinkSearchStyles();

  return (
    <div className={styles.root}>
      {/* File being linked */}
      <div className={styles.fileRow}>
        <div className={styles.fileLabel}>Linking file</div>
        <div className={styles.fileName} title={filename}>{filename}</div>
      </div>

      {/* Search input */}
      <div className={styles.inputWrap}>
        <IconSearch size={13} className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Search for a movie title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {status === "searching" && (
          <IconSpinner size={13} className={styles.spinner} />
        )}
        {query && status !== "searching" && (
          <button className={styles.clearBtn} onClick={() => setQuery("")} aria-label="Clear search">
            <IconClose size={11} />
          </button>
        )}
      </div>

      {/* Suggestions panel */}
      {status === "results" && suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((s) => (
            <button
              key={s.id}
              className={styles.item}
              onClick={() => onLink(s)}
            >
              {/* Poster thumbnail */}
              <div className={styles.thumb} style={{ background: s.gradient }} />
              {/* Info */}
              <div className={styles.info}>
                <div className={styles.title}>{s.title}</div>
                <div className={styles.year}>{s.year}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Cancel */}
      <button className={styles.cancelBtn} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
};
