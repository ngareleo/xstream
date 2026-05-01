import {
  type FC,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { IconRefresh, IconSearch } from "../../lib/icons.js";
import { films, profiles } from "../../data/mock.js";
import { useAppHeaderStyles } from "./AppHeader.styles.js";

interface Suggestion {
  id: string;
  kind: "film" | "profile";
  label: string;
  meta: string;
  href: string;
}

const PLACEHOLDER = "Search films, profiles, paths…";

export const AppHeader: FC = () => {
  const s = useAppHeaderStyles();
  const navigate = useNavigate();

  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [caretX, setCaretX] = useState(0);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const filmHits: Suggestion[] = films
      .filter((f) => {
        const t = f.title?.toLowerCase() ?? "";
        const d = f.director?.toLowerCase() ?? "";
        const fn = f.filename.toLowerCase();
        return t.includes(q) || d.includes(q) || fn.includes(q);
      })
      .slice(0, 5)
      .map((f) => ({
        id: `film:${f.id}`,
        kind: "film",
        label: f.title ?? f.filename,
        meta: `${f.year ?? "—"} · ${f.resolution} · ${f.profile}`,
        href: `/library?film=${f.id}`,
      }));
    const profileHits: Suggestion[] = profiles
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
      )
      .slice(0, 3)
      .map((p) => ({
        id: `profile:${p.id}`,
        kind: "profile",
        label: p.name,
        meta: p.path,
        href: `/library?profile=${p.id}`,
      }));
    return [...filmHits, ...profileHits];
  }, [query]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useLayoutEffect(() => {
    if (mirrorRef.current) {
      setCaretX(mirrorRef.current.offsetWidth);
    }
  }, [query, focused]);

  const showSuggestions = focused && (suggestions.length > 0 || query.trim().length > 0);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const target = suggestions[highlight];
    if (target) {
      navigate(target.href);
    } else if (query.trim()) {
      navigate(`/library?q=${encodeURIComponent(query.trim())}`);
    }
    setQuery("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  };

  const handleScan = (): void => {
    if (scanning) return;
    setScanning(true);
    // Mock: pretend the scan runs for ~2s before settling.
    window.setTimeout(() => setScanning(false), 2000);
  };

  return (
    <header className={s.header}>
      <div className={s.brandCell}>
        <Link to="/" className={s.brand} aria-label="Xstream — home">
          <span className={s.brandX}>X</span>
          <span className={s.brandWord}>stream</span>
        </Link>
      </div>

      <form
        className={mergeClasses(
          s.searchCell,
          !focused && s.searchCellHover,
          focused && s.searchCellFocused,
        )}
        onSubmit={submit}
        role="search"
      >
        <span className={s.searchIcon} aria-hidden="true">
          <IconSearch />
        </span>
        <div className={s.inputWrap}>
          <span ref={mirrorRef} className={s.mirror} aria-hidden="true">
            {query}
          </span>
          <input
            ref={inputRef}
            className={s.searchInput}
            value={query}
            placeholder={focused ? "" : PLACEHOLDER}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKeyDown}
            aria-label="Search"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls="header-search-suggestions"
            spellCheck={false}
            autoComplete="off"
          />
          {focused && (
            <span
              className={s.caret}
              style={{ left: `${caretX}px` }}
              aria-hidden="true"
            />
          )}
        </div>

        {showSuggestions && (
          <ul
            id="header-search-suggestions"
            className={s.suggestions}
            role="listbox"
          >
            {suggestions.length === 0 ? (
              <li className={s.suggEmpty}>No matches — press Enter to search</li>
            ) : (
              suggestions.map((sugg, idx) => (
                <li
                  key={sugg.id}
                  className={s.suggestionItem}
                  role="option"
                  aria-selected={idx === highlight}
                  style={
                    idx === highlight
                      ? { backgroundColor: "var(--green-soft)" }
                      : undefined
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    navigate(sugg.href);
                    setQuery("");
                    inputRef.current?.blur();
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  <span className={s.suggLabel}>{sugg.label}</span>
                  <span className={s.suggMeta}>
                    {sugg.kind === "film" ? "FILM · " : "LIBRARY · "}
                    {sugg.meta}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </form>

      <div className={s.actionsCell}>
        <button
          type="button"
          className={s.scanBtn}
          onClick={handleScan}
          aria-busy={scanning}
        >
          <span
            className={mergeClasses(s.scanIcon, scanning && s.scanIconSpinning)}
          >
            <IconRefresh />
          </span>
          <span>{scanning ? "Scanning…" : "Scan"}</span>
        </button>
      </div>
    </header>
  );
};
