import { mergeClasses } from "@griffel/react";
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { EmptyLibrariesHero } from "~/components/empty-libraries-hero/EmptyLibrariesHero";
import { FilmDetailsOverlay } from "~/components/film-details-overlay/FilmDetailsOverlay";
import { FilmTile } from "~/components/film-tile/FilmTile";
import { FilterSlide } from "~/components/filter-slide/FilterSlide";
import { PosterRow } from "~/components/poster-row/PosterRow";
import { SearchSlide } from "~/components/search-slide/SearchSlide";
import { IconClose, IconSearch } from "~/lib/icons";
import type { HomePageContentQuery } from "~/relay/__generated__/HomePageContentQuery.graphql";
import { EMPTY_FILTERS } from "~/utils/filters";
import { upgradePosterUrl } from "~/utils/formatters";

import { strings } from "./HomePage.strings";
import { useHomePageStyles } from "./HomePage.styles";
import {
  type FilterRow,
  pickSuggestions,
  timeOfDayGreeting,
  toFilterRow,
} from "./HomePageContent.utils";
import { useHeroMode } from "./useHeroMode";

const HOMEPAGE_QUERY = graphql`
  query HomePageContentQuery {
    libraries {
      id
    }
    videos(first: 200) {
      edges {
        node {
          id
          title
          filename
          mediaType
          nativeResolution
          metadata {
            year
            genre
            director
            posterUrl
          }
          videoStream {
            codec
          }
          ...FilmTile_video
          ...FilmDetailsOverlay_video
        }
      }
    }
    watchlist {
      id
      progressSeconds
      video {
        id
      }
    }
  }
`;

export const HomePageContent: FC = () => {
  const styles = useHomePageStyles();
  const data = useLazyLoadQuery<HomePageContentQuery>(HOMEPAGE_QUERY, {});
  const [params, setParams] = useSearchParams();
  const hasLibraries = (data.libraries ?? []).length > 0;

  const rows = useMemo<FilterRow[]>(
    () => (data.videos?.edges ?? []).map((edge) => toFilterRow(edge.node)),
    [data]
  );

  const watchlistEntries = useMemo(() => {
    const items = data.watchlist ?? [];
    const rowsById = new Map(rows.map((r) => [r.id, r]));
    return items
      .map((item) => {
        const row = rowsById.get(item.video.id);
        if (!row) return null;
        return { id: item.id, row, progressSeconds: item.progressSeconds };
      })
      .filter((x): x is { id: string; row: FilterRow; progressSeconds: number } => x !== null);
  }, [data, rows]);

  const filmId = params.get("film");
  const selectedRow = filmId ? rows.find((r) => r.id === filmId) : undefined;

  // Hero slideshow: cycle up to 4 movies that have posters. Lab spec uses
  // 7s interval + 0.7s crossfade + Ken Burns; matched here.
  const heroFilms = useMemo(() => {
    return rows
      .filter((r) => r.node.mediaType === "MOVIES" && Boolean(r.node.metadata?.posterUrl))
      .slice(0, 4);
  }, [rows]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroFading, setHeroFading] = useState(false);
  const heroFadeTimerRef = useRef<number | null>(null);
  const HERO_INTERVAL_MS = 7000;
  const HERO_FADE_MS = 700;

  useEffect(() => {
    // No cycling when overlay is open or there's nothing to cycle.
    if (selectedRow || heroFilms.length <= 1) return;
    const id = window.setInterval(() => {
      setHeroFading(true);
      heroFadeTimerRef.current = window.setTimeout(() => {
        setHeroIndex((i) => (i + 1) % heroFilms.length);
        setHeroFading(false);
      }, HERO_FADE_MS);
    }, HERO_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      if (heroFadeTimerRef.current !== null) window.clearTimeout(heroFadeTimerRef.current);
    };
  }, [heroFilms.length, selectedRow]);

  // Clamp the index when the film list shrinks (e.g. library filter changes).
  useEffect(() => {
    if (heroIndex >= heroFilms.length && heroFilms.length > 0) setHeroIndex(0);
  }, [heroFilms.length, heroIndex]);

  const goToHero = useCallback(
    (idx: number): void => {
      if (idx === heroIndex) return;
      setHeroFading(true);
      window.setTimeout(() => {
        setHeroIndex(idx);
        setHeroFading(false);
      }, HERO_FADE_MS / 2);
    },
    [heroIndex]
  );

  const continueWatching = useMemo(
    () => watchlistEntries.filter((w) => w.progressSeconds > 0),
    [watchlistEntries]
  );
  const watchlistRest = useMemo(
    () => watchlistEntries.filter((w) => w.progressSeconds === 0),
    [watchlistEntries]
  );
  const newReleases = useMemo(() => rows.slice(0, 12), [rows]);

  const {
    search,
    setSearch,
    searchFocused,
    setSearchFocused,
    setFilterOpen,
    filters,
    setFilters,
    heroMode,
    hasQuery,
    showFlatResults,
    activeFilterCount,
    queryMatched,
    searchResults,
    clearAll,
  } = useHeroMode(rows, Boolean(selectedRow));

  const [searchCaretX, setSearchCaretX] = useState(0);
  const searchMirrorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (searchMirrorRef.current !== null) {
      setSearchCaretX(searchMirrorRef.current.offsetWidth);
    }
  }, [search, searchFocused]);

  const openFilm = useCallback(
    (id: string): void => {
      const next = new URLSearchParams(params);
      next.set("film", id);
      setParams(next);
    },
    [params, setParams]
  );

  const closeFilm = useCallback((): void => {
    const next = new URLSearchParams(params);
    next.delete("film");
    setParams(next);
  }, [params, setParams]);

  if (!hasLibraries) {
    return <EmptyLibrariesHero watermark={strings.emptyWatermark} />;
  }

  if (selectedRow) {
    const suggestions = pickSuggestions(selectedRow, rows);
    return (
      <FilmDetailsOverlay
        video={selectedRow.node}
        suggestions={suggestions}
        onSelectSuggestion={openFilm}
        onClose={closeFilm}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={mergeClasses(styles.hero, heroMode !== "idle" && styles.heroActive)}>
        {heroMode === "idle" && heroFilms.length > 0 && (
          <>
            <div className={styles.heroSlides} aria-hidden="true">
              {heroFilms.map((film, i) => {
                const url = film.node.metadata?.posterUrl;
                if (!url) return null;
                const active = i === heroIndex;
                return (
                  <img
                    key={film.id}
                    src={upgradePosterUrl(url, 1600)}
                    alt=""
                    className={mergeClasses(
                      styles.heroImg,
                      active && styles.heroImgActive,
                      active && heroFading && styles.heroImgFading
                    )}
                  />
                );
              })}
            </div>
            <div className={styles.heroEdgeFade} aria-hidden="true" />
            <div className={styles.heroBottomFade} aria-hidden="true" />
          </>
        )}
        {heroMode !== "idle" && <div className={styles.heroPanelBg} />}

        <div
          className={mergeClasses(
            styles.searchBar,
            (searchFocused || heroMode !== "idle") && styles.searchBarFocused
          )}
        >
          <span className={styles.searchIcon} aria-hidden="true">
            <IconSearch />
          </span>
          <div className={styles.searchInputWrap}>
            <span ref={searchMirrorRef} className={styles.searchMirror} aria-hidden="true">
              {search}
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              placeholder={searchFocused ? "" : strings.searchPlaceholder}
              className={styles.searchInput}
              aria-label={strings.searchAriaLabel}
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
          {showFlatResults && (
            <button
              type="button"
              onClick={clearAll}
              aria-label={strings.clearAriaLabel}
              className={styles.searchClear}
            >
              <IconClose size={12} />
            </button>
          )}
        </div>

        <div className={styles.heroBody}>
          {heroMode === "idle" && (
            <>
              <div>
                <div className={styles.greetingEyebrow}>· {timeOfDayGreeting(new Date())}</div>
                <div className={styles.greeting}>{strings.libraryHeading}</div>
              </div>
              {heroFilms.length > 0 && (
                <div className={styles.slideDots}>
                  {heroFilms.map((film, i) => {
                    const active = i === heroIndex;
                    return (
                      <button
                        key={film.id}
                        type="button"
                        onClick={() => goToHero(i)}
                        aria-label={`Show ${film.node.title ?? film.node.filename}`}
                        className={mergeClasses(
                          styles.slideDot,
                          active ? styles.slideDotActive : styles.slideDotInactive
                        )}
                      >
                        {active && (
                          // Inner fill animates 0 → 100% width over the
                          // 7s slide interval. Keying it on heroIndex
                          // resets the animation on every slide change.
                          <span
                            key={heroIndex}
                            className={styles.slideDotFill}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {heroMode === "searching" && (
            <SearchSlide
              query={search}
              resultCount={searchResults.length}
              totalMatched={queryMatched.length}
              profilesMatched={1}
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
              profileCount={1}
              onClose={() => setFilterOpen(false)}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          )}
        </div>
      </div>

      <div className={styles.rowsScroll}>
        {showFlatResults ? (
          searchResults.length > 0 ? (
            <div className={styles.searchResults}>
              <div className={styles.rowHeader}>
                {hasQuery
                  ? (strings.formatString(strings.resultsFormat, {
                      n: searchResults.length,
                    }) as string)
                  : (strings.formatString(strings.filteredFormat, {
                      n: searchResults.length,
                      total: rows.length,
                    }) as string)}
              </div>
              <div className={styles.searchGrid}>
                {searchResults.map((r) => (
                  <FilmTile key={r.id} video={r.node} onClick={openFilm} />
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.noResults}>
              {hasQuery
                ? (strings.formatString(strings.noResultsForQuery, {
                    query: search.trim(),
                  }) as string)
                : strings.noResultsForFilters}
            </div>
          )
        ) : (
          <>
            {continueWatching.length > 0 && (
              <PosterRow title={strings.rowContinueWatching}>
                {continueWatching.map(({ id, row }) => (
                  <FilmTile key={id} video={row.node} onClick={openFilm} />
                ))}
              </PosterRow>
            )}

            {newReleases.length > 0 && (
              <PosterRow title={strings.rowNewReleases}>
                {newReleases.map((r) => (
                  <FilmTile key={r.id} video={r.node} onClick={openFilm} />
                ))}
              </PosterRow>
            )}

            {watchlistRest.length > 0 && (
              <PosterRow title={strings.rowWatchlist}>
                {watchlistRest.map(({ id, row }) => (
                  <FilmTile key={id} video={row.node} onClick={openFilm} />
                ))}
              </PosterRow>
            )}
          </>
        )}
      </div>
    </div>
  );
};
