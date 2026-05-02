import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  type Film,
  type WatchlistItem,
  films,
  getFilmById,
  newReleaseIds,
  user,
  watchlist,
} from "../../data/mock.js";
import { Poster } from "../../components/Poster/Poster.js";
import { IconClose, IconSearch } from "../../lib/icons.js";
import { FilmDetailsOverlay } from "../../components/FilmDetailsOverlay/FilmDetailsOverlay.js";
import { FilmTile } from "../../components/FilmTile/FilmTile.js";
import {
  applyFilters,
  EMPTY_FILTERS,
  type Filters,
  filtersActive,
} from "../../components/FilterSlide/filters.js";
import { FilterSlide } from "../../components/FilterSlide/FilterSlide.js";
import { PosterRow } from "../../components/PosterRow/PosterRow.js";
import { SearchSlide } from "../../components/SearchSlide/SearchSlide.js";
import { useLibraryStyles } from "./Library.styles.js";

const HERO_FILM_IDS = ["oppenheimer", "barbie", "nosferatu", "civilwar"] as const;
const HERO_INTERVAL_MS = 7000;
const HERO_FADE_MS = 700;

interface RowEntry {
  item: WatchlistItem;
  film: Film;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function rowEntries(items: WatchlistItem[]): RowEntry[] {
  const out: RowEntry[] = [];
  for (const item of items) {
    const film = getFilmById(item.filmId);
    if (film !== undefined) out.push({ item, film });
  }
  return out;
}

/**
 * Library home. Owns:
 *  - the rotating hero / SearchSlide / FilterSlide tri-state machine
 *  - the search query + filter state
 *  - layout for the home rows (carousels) vs. search-results grid
 *  - the FilmDetailsOverlay (driven by `?film=<id>`)
 *
 * Sub-components (FilmTile, PosterRow, SearchSlide, FilterSlide,
 * FilmDetailsOverlay) live next to it under `components/` and stay
 * presentation-only.
 */
export const Library: FC = () => {
  const styles = useLibraryStyles();
  const [params, setParams] = useSearchParams();
  const filmId = params.get("film");
  const selectedFilm = filmId ? getFilmById(filmId) : undefined;

  const heroFilms = useMemo<Film[]>(
    () =>
      HERO_FILM_IDS.map((id) => getFilmById(id)).filter(
        (f): f is Film => f !== undefined,
      ),
    [],
  );

  const [heroIndex, setHeroIndex] = useState(0);
  const [heroFading, setHeroFading] = useState(false);
  const heroFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (selectedFilm) return;
    const interval = setInterval(() => {
      setHeroFading(true);
      heroFadeTimerRef.current = setTimeout(() => {
        setHeroIndex((i) => (i + 1) % heroFilms.length);
        setHeroFading(false);
      }, HERO_FADE_MS);
    }, HERO_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (heroFadeTimerRef.current !== null)
        clearTimeout(heroFadeTimerRef.current);
    };
  }, [heroFilms.length, selectedFilm]);

  const goToHero = (idx: number): void => {
    if (idx === heroIndex) return;
    setHeroFading(true);
    setTimeout(() => {
      setHeroIndex(idx);
      setHeroFading(false);
    }, HERO_FADE_MS / 2);
  };

  const continueWatching = useMemo<RowEntry[]>(
    () => rowEntries(watchlist.filter((w) => w.progress !== undefined)),
    [],
  );
  const watchlistRest = useMemo<RowEntry[]>(
    () => rowEntries(watchlist.filter((w) => w.progress === undefined)),
    [],
  );
  const newReleases = useMemo<Film[]>(() => {
    const out: Film[] = [];
    for (const id of newReleaseIds) {
      const film = getFilmById(id);
      if (film !== undefined) out.push(film);
    }
    return out;
  }, []);

  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchCaretX, setSearchCaretX] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchMirrorRef = useRef<HTMLSpanElement>(null);
  const trimmedQuery = search.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;
  const heroMode: "idle" | "searching" | "filtering" = filterOpen
    ? "filtering"
    : searchFocused || searching
      ? "searching"
      : "idle";
  const activeFilterCount = filtersActive(filters);

  useEffect(() => {
    if (searchMirrorRef.current !== null) {
      setSearchCaretX(searchMirrorRef.current.offsetWidth);
    }
  }, [search, searchFocused]);

  const queryMatched = useMemo<Film[]>(() => {
    if (!trimmedQuery) return [];
    return films.filter((f) => {
      const title = (f.title ?? "").toLowerCase();
      const filename = f.filename.toLowerCase();
      const director = (f.director ?? "").toLowerCase();
      const genre = (f.genre ?? "").toLowerCase();
      return (
        title.includes(trimmedQuery) ||
        filename.includes(trimmedQuery) ||
        director.includes(trimmedQuery) ||
        genre.includes(trimmedQuery)
      );
    });
  }, [trimmedQuery]);

  const searchResults = useMemo<Film[]>(
    () => applyFilters(queryMatched, filters),
    [queryMatched, filters],
  );

  const profilesMatched = useMemo<number>(() => {
    const ids = new Set(searchResults.map((f) => f.profile));
    return ids.size;
  }, [searchResults]);

  const clearAll = useCallback((): void => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setFilterOpen(false);
    setSearchFocused(false);
  }, []);

  // ESC: in filter mode → exit filter mode; otherwise → clear search.
  useEffect(() => {
    if (heroMode === "idle") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else clearAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [heroMode, filterOpen, clearAll]);

  const openFilm = (id: string): void => {
    const next = new URLSearchParams(params);
    next.set("film", id);
    setParams(next);
  };

  const closeFilm = (): void => {
    const next = new URLSearchParams(params);
    next.delete("film");
    setParams(next);
  };

  const [greetingTilt, setGreetingTilt] = useState({ rx: 0, ry: 0 });
  const onGreetingMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setGreetingTilt({ rx: ny * 18, ry: -nx * 18 });
  };
  const onGreetingMouseLeave = (): void => setGreetingTilt({ rx: 0, ry: 0 });

  if (selectedFilm) {
    return <FilmDetailsOverlay film={selectedFilm} onClose={closeFilm} />;
  }

  return (
    <div className={styles.page}>
      <div
        className={mergeClasses(
          styles.hero,
          heroMode !== "idle" && styles.heroActive,
        )}
      >
        {heroMode === "idle" && (
          <>
            <div className={styles.heroSlides}>
              {heroFilms.map((film, i) => (
                <Poster
                  key={film.id}
                  url={film.posterUrl}
                  alt={film.title ?? film.filename}
                  className={mergeClasses(
                    styles.heroImg,
                    i === heroIndex && styles.heroImgActive,
                    i === heroIndex && heroFading && styles.heroImgFading,
                  )}
                />
              ))}
            </div>
            <div className={styles.heroEdgeFade} />
            <div className={styles.heroBottomFade} />
            <div className="grain-layer" />
          </>
        )}
        {heroMode !== "idle" && <div className={styles.heroPanelBg} />}

        <div
          className={mergeClasses(
            styles.searchBar,
            (searchFocused || heroMode !== "idle") && styles.searchBarFocused,
          )}
        >
          <span className={styles.searchIcon} aria-hidden="true">
            <IconSearch />
          </span>
          <div className={styles.searchInputWrap}>
            <span
              ref={searchMirrorRef}
              className={styles.searchMirror}
              aria-hidden="true"
            >
              {search}
            </span>
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder={
                searchFocused ? "" : "Search films, directors, genres…"
              }
              className={styles.searchInput}
              aria-label="Search the library"
              spellCheck={false}
              autoComplete="off"
            />
            {searchFocused && (
              <span
                className={styles.searchCaret}
                style={{ left: `${searchCaretX}px` }}
                aria-hidden="true"
              />
            )}
          </div>
          {(searching || activeFilterCount > 0) && (
            <button
              type="button"
              onClick={clearAll}
              aria-label="Clear search"
              className={styles.searchClear}
            >
              <IconClose width={12} height={12} />
            </button>
          )}
        </div>

        <div className={styles.heroBody}>
          {heroMode === "idle" && (
            <>
              <div>
                <div className={styles.greetingEyebrow}>
                  · {greeting()}, {user.name.toUpperCase()}
                </div>
                <div
                  className={styles.greeting}
                  onMouseMove={onGreetingMouseMove}
                  onMouseLeave={onGreetingMouseLeave}
                  style={{
                    transform: `perspective(800px) rotateX(${greetingTilt.rx}deg) rotateY(${greetingTilt.ry}deg)`,
                  }}
                >
                  Tonight&apos;s
                  <br />
                  library.
                </div>
              </div>
              <div className={styles.slideDots}>
                {heroFilms.map((film, i) => (
                  <button
                    key={film.id}
                    type="button"
                    onClick={() => goToHero(i)}
                    aria-label={`Show ${film.title ?? film.filename}`}
                    className={mergeClasses(
                      styles.slideDot,
                      i === heroIndex
                        ? styles.slideDotActive
                        : styles.slideDotInactive,
                    )}
                  />
                ))}
              </div>
            </>
          )}
          {heroMode === "searching" && (
            <SearchSlide
              query={search}
              resultCount={searchResults.length}
              totalMatched={queryMatched.length}
              profilesMatched={profilesMatched}
              activeFilterCount={activeFilterCount}
              onOpenFilter={() => setFilterOpen(true)}
              onClear={clearAll}
            />
          )}
          {heroMode === "filtering" && (
            <FilterSlide
              query={search}
              filters={filters}
              setFilters={setFilters}
              resultCount={searchResults.length}
              totalMatched={queryMatched.length}
              onClose={() => setFilterOpen(false)}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          )}
        </div>
      </div>

      <div className={styles.rowsScroll}>
        {searching ? (
          searchResults.length > 0 ? (
            <div className={styles.searchResults}>
              <div className={styles.rowHeader}>
                Results · {searchResults.length}
              </div>
              <div className={styles.searchGrid}>
                {searchResults.map((film) => (
                  <FilmTile
                    key={film.id}
                    film={film}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.noResults}>
              No films match &ldquo;{search.trim()}&rdquo;
            </div>
          )
        ) : (
          <>
            {continueWatching.length > 0 && (
              <PosterRow title="Continue watching">
                {continueWatching.map(({ item, film }) => (
                  <FilmTile
                    key={item.id}
                    film={film}
                    progress={item.progress}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </PosterRow>
            )}

            {newReleases.length > 0 && (
              <PosterRow title="New releases">
                {newReleases.map((film) => (
                  <FilmTile
                    key={film.id}
                    film={film}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </PosterRow>
            )}

            {watchlistRest.length > 0 && (
              <PosterRow title="Watchlist">
                {watchlistRest.map(({ item, film }) => (
                  <FilmTile
                    key={item.id}
                    film={film}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </PosterRow>
            )}
          </>
        )}
      </div>
    </div>
  );
};
