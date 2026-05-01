import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { ImdbBadge, IconBack, IconChevron, IconClose, IconPlay, IconSearch } from "../../lib/icons.js";
import { useLibraryStyles } from "./Library.styles.js";

const HERO_FILM_IDS = ["oppenheimer", "barbie", "nosferatu", "civilwar"] as const;
const HERO_INTERVAL_MS = 7000;
const HERO_FADE_MS = 700;
const TILE_WIDTH = 200;
const TILE_GAP = 16;
const TILE_STRIDE = TILE_WIDTH + TILE_GAP;
const ROW_SCROLL_DURATION_MS = 720;

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function smoothScrollBy(el: HTMLElement, dx: number, duration: number): void {
  const start = el.scrollLeft;
  const startTime = performance.now();
  const step = (now: number): void => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    el.scrollLeft = start + dx * easeInOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

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

export const Library: FC = () => {
  const styles = useLibraryStyles();
  const [params, setParams] = useSearchParams();
  const filmId = params.get("film");
  const selectedFilm = filmId ? getFilmById(filmId) : undefined;

  const heroFilms = useMemo<Film[]>(() => {
    const list = HERO_FILM_IDS.map((id) => getFilmById(id)).filter(
      (f): f is Film => f !== undefined,
    );
    return list;
  }, []);

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
      if (heroFadeTimerRef.current !== null) clearTimeout(heroFadeTimerRef.current);
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchMirrorRef = useRef<HTMLSpanElement>(null);
  const trimmedQuery = search.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;

  useEffect(() => {
    if (searchMirrorRef.current !== null) {
      setSearchCaretX(searchMirrorRef.current.offsetWidth);
    }
  }, [search, searchFocused]);

  const searchResults = useMemo<Film[]>(() => {
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
      <div className={styles.hero}>
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

        <div
          className={mergeClasses(
            styles.searchBar,
            searchFocused && styles.searchBarFocused,
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
              placeholder={searchFocused ? "" : "Search films, directors, genres…"}
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
          {searching && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className={styles.searchClear}
            >
              <IconClose width={12} height={12} />
            </button>
          )}
        </div>

        <div className={styles.heroBody}>
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
                  i === heroIndex ? styles.slideDotActive : styles.slideDotInactive,
                )}
              />
            ))}
          </div>
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
              <Row title="Continue watching">
                {continueWatching.map(({ item, film }) => (
                  <FilmTile
                    key={item.id}
                    film={film}
                    progress={item.progress}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </Row>
            )}

            {newReleases.length > 0 && (
              <Row title="New releases">
                {newReleases.map((film) => (
                  <FilmTile
                    key={film.id}
                    film={film}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </Row>
            )}

            {watchlistRest.length > 0 && (
              <Row title="Watchlist">
                {watchlistRest.map(({ item, film }) => (
                  <FilmTile
                    key={item.id}
                    film={film}
                    onClick={() => openFilm(film.id)}
                  />
                ))}
              </Row>
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface RowProps {
  title: string;
  children: React.ReactNode;
}

const Row: FC<RowProps> = ({ title, children }) => {
  const styles = useLibraryStyles();
  const trackRef = useRef<HTMLDivElement>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (el === null) return;
    const updateBounds = (): void => {
      setHasPrev(el.scrollLeft > 4);
      setHasNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    updateBounds();
    el.addEventListener("scroll", updateBounds, { passive: true });
    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateBounds);
      ro.disconnect();
    };
  }, [children]);

  const pageSize = (): number => {
    const el = trackRef.current;
    if (el === null) return 0;
    // Page = whole tiles that fit in the visible track width. Aligning the
    // step to a tile-stride means the snap-to-tile boundary has nothing to
    // adjust at rest, so the easing stays clean.
    const tilesPerPage = Math.max(1, Math.floor(el.clientWidth / TILE_STRIDE));
    return tilesPerPage * TILE_STRIDE;
  };

  const goPrev = (): void => {
    const el = trackRef.current;
    if (el === null) return;
    smoothScrollBy(el, -pageSize(), ROW_SCROLL_DURATION_MS);
  };

  const goNext = (): void => {
    const el = trackRef.current;
    if (el === null) return;
    smoothScrollBy(el, pageSize(), ROW_SCROLL_DURATION_MS);
  };

  return (
    <div className={styles.row}>
      <div className={styles.rowHeader}>{title}</div>
      <div className={styles.rowFrame}>
        <div ref={trackRef} className={styles.rowTrack}>
          {children}
        </div>
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous"
            className={mergeClasses(styles.rowArrow, styles.rowArrowLeft)}
          >
            <IconBack />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next"
            className={mergeClasses(styles.rowArrow, styles.rowArrowRight)}
          >
            <IconChevron />
          </button>
        )}
      </div>
    </div>
  );
};

interface FilmTileProps {
  film: Film;
  progress?: number;
  onClick: () => void;
}

const FilmTile: FC<FilmTileProps> = ({ film, progress, onClick }) => {
  const styles = useLibraryStyles();
  return (
    <button type="button" onClick={onClick} className={styles.tile}>
      <div className={styles.tileFrame}>
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          className={styles.tileImage}
        />
        {progress !== undefined && (
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className={styles.tileMeta}>
        <div className={styles.tileTitle}>{film.title ?? film.filename}</div>
        <div className={styles.tileSubtitle}>
          {[film.year, film.duration].filter(Boolean).join(" · ")}
        </div>
      </div>
    </button>
  );
};

interface FilmDetailsOverlayProps {
  film: Film;
  onClose: () => void;
}

const FilmDetailsOverlay: FC<FilmDetailsOverlayProps> = ({ film, onClose }) => {
  const styles = useLibraryStyles();
  const navigate = useNavigate();

  const playWithTransition = (): void => {
    const target = `/player/${film.id}`;
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => navigate(target));
    } else {
      navigate(target);
    }
  };

  return (
    <div className={styles.overlay}>
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        className={styles.overlayPoster}
      />
      <div className={styles.overlayGradient} />
      <div className="grain-layer" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to home"
        className={styles.overlayBack}
      >
        <IconBack />
        <span>Back</span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close details"
        className={styles.overlayClose}
      >
        <IconClose />
      </button>
      <div className={styles.overlayContent}>
        <div className={styles.overlayChips}>
          <span className={mergeClasses("chip", "green")}>{film.resolution}</span>
          {film.hdr && film.hdr !== "—" && (
            <span className="chip">{film.hdr}</span>
          )}
          {film.codec && <span className="chip">{film.codec}</span>}
          {film.rating !== null && (
            <span className={styles.overlayRating}>
              <ImdbBadge />
              {film.rating}
            </span>
          )}
        </div>
        <div className={styles.overlayTitle}>{film.title ?? film.filename}</div>
        <div className={styles.overlayMetaRow}>
          {[film.year, film.genre, film.duration]
            .filter((v): v is string | number => v !== null && v !== undefined)
            .join(" · ")}
        </div>
        {film.director && (
          <div className={styles.overlayDirector}>
            Directed by <span className={styles.overlayDirectorName}>{film.director}</span>
          </div>
        )}
        {film.plot && <div className={styles.overlayPlot}>{film.plot}</div>}
        <div className={styles.overlayActions}>
          <button
            type="button"
            onClick={playWithTransition}
            className={styles.playCta}
          >
            <IconPlay />
            <span>Play</span>
          </button>
          <span className={styles.overlayFilename}>{film.filename}</span>
        </div>
      </div>
    </div>
  );
};
