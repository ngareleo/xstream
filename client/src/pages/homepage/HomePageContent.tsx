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
import {
  applyFilters,
  type Codec,
  EMPTY_FILTERS,
  type FilterableFilm,
  type Filters,
  filtersActive,
  type Hdr,
  type Resolution,
} from "~/utils/filters";
import { upgradePosterUrl } from "~/utils/formatters";

import { strings } from "./HomePage.strings";
import { useHomePageStyles } from "./HomePage.styles";

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

type VideoEdge = NonNullable<HomePageContentQuery["response"]["videos"]>["edges"][number];
type VideoNode = VideoEdge["node"];

interface FilterRow extends FilterableFilm {
  id: string;
  title: string;
  filename: string;
  director: string;
  genre: string;
  node: VideoNode;
}

const RESOLUTION_LABEL: Record<string, Resolution> = {
  RESOLUTION_4K: "4K",
  RESOLUTION_1080P: "1080p",
  RESOLUTION_720P: "720p",
};

function toFilterRow(node: VideoNode): FilterRow {
  const codec = (node.videoStream?.codec ?? "HEVC") as Codec;
  const resolution: Resolution = node.nativeResolution
    ? (RESOLUTION_LABEL[node.nativeResolution] ?? "1080p")
    : "1080p";
  return {
    id: node.id,
    title: (node.title || "").toLowerCase(),
    filename: node.filename.toLowerCase(),
    director: (node.metadata?.director ?? "").toLowerCase(),
    genre: (node.metadata?.genre ?? "").toLowerCase(),
    resolution,
    hdr: null as Hdr | null,
    codec,
    year: node.metadata?.year ?? null,
    node,
  };
}

function timeOfDayGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return strings.greetingMorning;
  if (h < 18) return strings.greetingAfternoon;
  return strings.greetingEvening;
}

function pickSuggestions(film: FilterRow, all: FilterRow[]): VideoNode[] {
  const tokens = film.genre.split(/[·\s/]+/).filter(Boolean);
  const scored: { row: FilterRow; score: number }[] = [];
  for (const f of all) {
    if (f.id === film.id) continue;
    let score = 0;
    if (f.director && film.director && f.director === film.director) score += 50;
    for (const t of tokens) {
      if (t.length > 2 && f.genre.includes(t)) score += 12;
    }
    if (f.resolution === film.resolution) score += 2;
    scored.push({ row: f, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((s) => s.row.node);
}

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

  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchCaretX, setSearchCaretX] = useState(0);
  const searchMirrorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (searchMirrorRef.current !== null) {
      setSearchCaretX(searchMirrorRef.current.offsetWidth);
    }
  }, [search, searchFocused]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const trimmedQuery = search.trim().toLowerCase();
  const hasQuery = trimmedQuery.length > 0;
  const activeFilterCount = filtersActive(filters);
  const showFlatResults = hasQuery || activeFilterCount > 0;
  const heroMode: "idle" | "searching" | "filtering" = filterOpen
    ? "filtering"
    : searchFocused || showFlatResults
      ? "searching"
      : "idle";

  const queryMatched = useMemo<FilterRow[]>(() => {
    if (!trimmedQuery) return rows;
    return rows.filter(
      (r) =>
        r.title.includes(trimmedQuery) ||
        r.filename.includes(trimmedQuery) ||
        r.director.includes(trimmedQuery) ||
        r.genre.includes(trimmedQuery)
    );
  }, [rows, trimmedQuery]);

  const searchResults = useMemo<FilterRow[]>(
    () => applyFilters(queryMatched, filters),
    [queryMatched, filters]
  );

  const clearAll = useCallback((): void => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
    setFilterOpen(false);
    setSearchFocused(false);
  }, []);

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
              {heroFilms.length > 1 && (
                <div className={styles.slideDots}>
                  {heroFilms.map((film, i) => (
                    <button
                      key={film.id}
                      type="button"
                      onClick={() => goToHero(i)}
                      aria-label={`Show ${film.node.title ?? film.node.filename}`}
                      className={mergeClasses(
                        styles.slideDot,
                        i === heroIndex ? styles.slideDotActive : styles.slideDotInactive
                      )}
                    />
                  ))}
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
