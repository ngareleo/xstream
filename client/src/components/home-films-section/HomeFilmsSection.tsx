import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import { type FC, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { graphql, useFragment } from "react-relay";
import { useSearchParams } from "react-router-dom";

import { FilmDetailsOverlay } from "~/components/film-details-overlay/FilmDetailsOverlay";
import { FilmTile } from "~/components/film-tile/FilmTile";
import { FilterSlide } from "~/components/filter-slide/FilterSlide";
import { PosterRow } from "~/components/poster-row/PosterRow";
import { SearchSlide } from "~/components/search-slide/SearchSlide";
import { resolvePosterUrl } from "~/config/rustOrigin";
import {
  isFilterClosedEvent,
  isFilterOpenRequestedEvent,
  isFiltersClearedEvent,
  isSearchClearedEvent,
} from "~/events/search.events";
import { IconClose, IconSearch } from "~/lib/icons";
import type { HomeFilmsSection_films$key } from "~/relay/__generated__/HomeFilmsSection_films.graphql";
import { EMPTY_FILTERS } from "~/utils/filters";

import { strings } from "./HomeFilmsSection.strings";
import { useHomeFilmsSectionStyles } from "./HomeFilmsSection.styles";
import {
  type FilterRow,
  pickSuggestions,
  timeOfDayGreeting,
  toFilterRowFromFilm,
} from "./HomeFilmsSection.utils";
import { useHeroMode } from "./useHeroMode";

const _VIDEO_FRAGMENT = graphql`
  fragment HomeFilmsSection_video on Video {
    id
    title
    filename
    mediaType
    nativeResolution
    metadata {
      year
      genre
      director
      heroPoster: posterUrl(size: W3200)
    }
    videoStream {
      codec
    }
    ...FilmTile_video
    ...FilmDetailsOverlay_video
  }
`;

const _FILM_FRAGMENT = graphql`
  fragment HomeFilmsSection_film on Film {
    id
    title
    year
    metadata {
      year
      genre
      director
      heroPoster: posterUrl(size: W3200)
    }
    bestCopy {
      ...HomeFilmsSection_video @relay(mask: false)
      fileSizeBytes
      bitrate
    }
    copies {
      ...HomeFilmsSection_video @relay(mask: false)
      fileSizeBytes
      bitrate
    }
  }
`;

const FILMS_FRAGMENT = graphql`
  fragment HomeFilmsSection_films on FilmConnection {
    edges {
      node {
        ...HomeFilmsSection_film @relay(mask: false)
      }
    }
  }
`;

const HERO_INTERVAL_MS = 7000;
const HERO_FADE_MS = 700;

interface HomeFilmsSectionProps {
  films: HomeFilmsSection_films$key | null | undefined;
  /** Optional rows rendered after the films row, only when not in flat
   *  search-results mode. The page passes the TV shows `<PosterRow>` here. */
  tvShowsRow?: ReactNode;
}

export const HomeFilmsSection: FC<HomeFilmsSectionProps> = ({ films, tvShowsRow }) => {
  const styles = useHomeFilmsSectionStyles();
  const data = useFragment(FILMS_FRAGMENT, films ?? null);
  const [params, setParams] = useSearchParams();

  const rows = useMemo<FilterRow[]>(
    () => (data?.edges ?? []).map((edge) => toFilterRowFromFilm(edge.node)),
    [data]
  );

  const filmId = params.get("film");
  const selectedRow = filmId ? rows.find((r) => r.id === filmId) : undefined;

  const heroFilms = useMemo(() => {
    return rows
      .filter((r) => r.node.mediaType === "MOVIES" && Boolean(r.node.metadata?.heroPoster))
      .slice(0, 4);
  }, [rows]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroFading, setHeroFading] = useState(false);
  const heroFadeTimerRef = useRef<number | null>(null);

  useEffect(() => {
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

  const searchInterceptor = async (wrapper: EventWrapper): Promise<EventWrapper> => {
    if (isFilterOpenRequestedEvent(wrapper)) {
      setFilterOpen(true);
    } else if (isSearchClearedEvent(wrapper)) {
      clearAll();
    } else if (isFilterClosedEvent(wrapper)) {
      setFilterOpen(false);
    } else if (isFiltersClearedEvent(wrapper)) {
      setFilters(EMPTY_FILTERS);
    }
    return wrapper;
  };

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

  if (selectedRow) {
    const suggestions = pickSuggestions(selectedRow, rows);
    return (
      <FilmDetailsOverlay
        video={selectedRow.node}
        copies={selectedRow.copies}
        suggestions={suggestions}
        onSelectSuggestion={openFilm}
        onClose={closeFilm}
      />
    );
  }

  return (
    <>
      <div className={mergeClasses(styles.hero, heroMode !== "idle" && styles.heroActive)}>
        {heroMode === "idle" && heroFilms.length > 0 && (
          <>
            <div className={styles.heroSlides} aria-hidden="true">
              {heroFilms.map((film, i) => {
                const url = film.node.metadata?.heroPoster;
                if (!url) return null;
                const active = i === heroIndex;
                return (
                  <img
                    key={film.id}
                    src={resolvePosterUrl(url) ?? url}
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

        <div className={mergeClasses(styles.heroBody, heroMode !== "idle" && styles.heroBodyFlow)}>
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
            <NovaEventingInterceptor interceptor={searchInterceptor}>
              <SearchSlide
                query={search}
                resultCount={searchResults.length}
                totalMatched={queryMatched.length}
                profilesMatched={1}
                activeFilterCount={activeFilterCount}
              />
            </NovaEventingInterceptor>
          )}
          {heroMode === "filtering" && (
            <NovaEventingInterceptor interceptor={searchInterceptor}>
              <FilterSlide
                query={search}
                filters={filters}
                setFilters={setFilters}
                resultCount={searchResults.length}
                totalMatched={queryMatched.length}
                profileCount={1}
              />
            </NovaEventingInterceptor>
          )}
        </div>
      </div>

      <div
        className={mergeClasses(styles.rowsScroll, heroMode !== "idle" && styles.rowsScrollFlat)}
      >
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
                  <FilmTile key={r.id} video={r.node} onClick={() => openFilm(r.id)} />
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
            {rows.length > 0 && (
              <PosterRow title={strings.rowMovies}>
                {rows.map((r) => (
                  <FilmTile key={r.id} video={r.node} onClick={() => openFilm(r.id)} />
                ))}
              </PosterRow>
            )}
            {tvShowsRow}
          </>
        )}
      </div>
    </>
  );
};
