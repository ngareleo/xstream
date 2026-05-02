import { type FC, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  type Film,
  type Profile,
  films,
  getFilmById,
  getFilmsForProfile,
  profiles,
} from "../../data/mock.js";
import { DetailPane } from "../../components/DetailPane/DetailPane.js";
import { FilmRow } from "../../components/FilmRow/FilmRow.js";
import { ProfileRow } from "../../components/ProfileRow/ProfileRow.js";
import { IconClose, IconSearch } from "../../lib/icons.js";
import { useSplitResize } from "../../hooks/useSplitResize.js";
import { useProfilesStyles } from "./Profiles.styles.js";

/**
 * Library list view — every profile and every film, expandable.
 * Owns:
 *  - the expanded-set state (which profiles show their films)
 *  - the right detail pane (driven by `?film=<id>`)
 *  - the empty-state branch (gated on `?empty=1` for design-lab preview)
 *  - the resize-split between left list and right detail pane
 *
 * The actual row visuals live in ProfileRow + FilmRow.
 */
export const Profiles: FC = () => {
  const s = useProfilesStyles();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const filmId = params.get("film");
  const editingFilm = params.get("edit") === "1";
  const selectedFilm = filmId ? getFilmById(filmId) : undefined;
  const paneOpen = Boolean(selectedFilm);

  // The DetailPane opens to 50% of the viewport on first mount so the
  // pre-selected film (see effect below) reads as a primary surface, not
  // a peek. The user can still drag-resize within [MIN, MAX].
  const defaultPaneWidth = useMemo(() => {
    if (typeof window === "undefined") return 720;
    return Math.floor(window.innerWidth * 0.5);
  }, []);
  const { paneWidth, containerRef, onResizeMouseDown } =
    useSplitResize(defaultPaneWidth);

  // First-mount default: pre-select the first movie so the page lands
  // with the DetailPane already open. Skips when the URL already carries
  // a `?film=` (deep-link / back-nav) or the design-lab `?empty=1`
  // preview flag is set.
  useEffect(() => {
    if (params.get("film") || params.get("empty") === "1") return;
    const firstMovie = films.find((f) => f.kind === "movie" && f.matched);
    if (firstMovie) setParams({ film: firstMovie.id }, { replace: true });
    // Run once on mount; the effect must not re-fire when params change
    // because the user might have intentionally cleared the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialExpanded = useMemo(() => {
    const set = new Set<string>([profiles[0].id]);
    if (selectedFilm) set.add(selectedFilm.profile);
    return set;
  }, [selectedFilm]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialExpanded);

  const toggleProfile = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openFilm = (id: string): void => {
    if (filmId === id) setParams({});
    else setParams({ film: id });
  };

  const editFilm = (id: string): void => {
    setParams({ film: id, edit: "1" });
  };

  const handleEditChange = (editing: boolean): void => {
    if (!filmId) return;
    if (editing) setParams({ film: filmId, edit: "1" });
    else setParams({ film: filmId });
  };

  const closePane = (): void => setParams({});

  const totalFilms = profiles.reduce((acc, p) => acc + (p.filmCount ?? 0), 0);
  const totalShows = profiles.reduce((acc, p) => acc + (p.showCount ?? 0), 0);
  const totalEpisodes = profiles.reduce(
    (acc, p) => acc + (p.episodeCount ?? 0),
    0,
  );
  const totalUnmatched = profiles.reduce((acc, p) => acc + p.unmatched, 0);
  const scanningCount = profiles.filter((p) => p.scanning).length;

  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  // When the user is searching, narrow each profile to its matching films
  // and drop profiles that have no hits. Otherwise show every profile
  // with its full list.
  const visibleProfiles = useMemo<{ profile: Profile; films: Film[] }[]>(() => {
    const all = profiles.map((p) => ({
      profile: p,
      films: getFilmsForProfile(p.id),
    }));
    if (!isSearching) return all;
    return all
      .map(({ profile, films }) => ({
        profile,
        films: films.filter((f) => filmMatches(f, trimmedSearch)),
      }))
      .filter(({ films }) => films.length > 0);
  }, [trimmedSearch, isSearching]);

  const matchCount = useMemo(
    () => visibleProfiles.reduce((acc, p) => acc + p.films.length, 0),
    [visibleProfiles],
  );

  // Design-lab toggle: `/profiles?empty=1` previews the no-libraries state.
  if (params.get("empty") === "1") {
    return (
      <div className={s.emptyRoot}>
        <div className={s.emptyWatermark}>profiles</div>
        <div className={s.emptyContent}>
          <div className={s.emptyEyebrow}>· no libraries yet</div>
          <div className={s.emptyHeadline}>
            <span className={s.emptyHeadlineWhite}>your collection</span>
            <span className={s.emptyHeadlineAccent}>starts here.</span>
          </div>
          <div className={s.emptyRule} />
          <p className={s.emptyBody}>
            Point Xstream at a folder of films or shows. We&rsquo;ll scan
            recursively, match titles against OMDb, and pull posters.
          </p>
          <div className={s.emptyActions}>
            <Link to="/profiles/new" className={s.emptyCta}>
              + Create your first profile
            </Link>
            <span className={s.emptyHint}>
              ⌘ N · paths can be local or networked
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={mergeClasses(s.splitBody, paneOpen && s.splitBodyOpen)}
      style={
        paneOpen
          ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` }
          : undefined
      }
    >
      <div className={s.leftCol}>
        <div className={s.breadcrumb}>
          <span className={s.crumbDim}>~</span>
          <span>/</span>
          <span>media</span>
          <span>/</span>
          <span className={s.crumbBright}>films</span>
          <span className={s.breadcrumbScanning}>
            ● scanning {scanningCount} of {profiles.length}
          </span>
        </div>

        <div className={s.searchBar}>
          <span className={s.searchPrompt} aria-hidden="true">
            <IconSearch />
          </span>
          <input
            className={s.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search films, directors, genres in every profile…"
            aria-label="Search profiles"
            spellCheck={false}
            autoComplete="off"
          />
          {isSearching && (
            <>
              <span className={s.searchCount}>
                {matchCount} {matchCount === 1 ? "match" : "matches"} ·{" "}
                {visibleProfiles.length}{" "}
                {visibleProfiles.length === 1 ? "profile" : "profiles"}
              </span>
              <button
                type="button"
                className={s.searchClear}
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <IconClose width={12} height={12} />
              </button>
            </>
          )}
        </div>

        <div className={s.colHeader}>
          <div />
          <div>Profile / File</div>
          <div>Match</div>
          <div>Size</div>
          <div />
        </div>

        <div className={s.rowsScroll}>
          {visibleProfiles.length === 0 ? (
            <div className={s.noMatches}>
              No films match &ldquo;{search.trim()}&rdquo;
            </div>
          ) : (
            visibleProfiles.map(({ profile: p, films: filmsInProfile }) => (
              <ProfileRow
                key={p.id}
                profile={p}
                expanded={isSearching || expandedIds.has(p.id)}
                onToggle={() => {
                  if (!isSearching) toggleProfile(p.id);
                }}
              >
                {filmsInProfile.map((f) => (
                  <FilmRow
                    key={f.id}
                    film={f}
                    selected={filmId === f.id}
                    onOpen={() => openFilm(f.id)}
                    onEdit={() => editFilm(f.id)}
                  />
                ))}
              </ProfileRow>
            ))
          )}
        </div>

        <div className={s.footer}>
          <span>
            {profiles.length} PROFILES · {totalFilms} FILMS · {totalShows} SHOWS ({totalEpisodes} EPS) · {totalUnmatched} UNMATCHED
          </span>
          <button
            type="button"
            className={s.footerCta}
            onClick={() => navigate("/profiles/new")}
          >
            + NEW PROFILE
          </button>
        </div>
      </div>

      {paneOpen && (
        <>
          <div className={s.resizeHandle} onMouseDown={onResizeMouseDown} />
          {selectedFilm && (
            <DetailPane
              film={selectedFilm}
              initialEdit={editingFilm}
              onEditChange={handleEditChange}
              onClose={closePane}
            />
          )}
        </>
      )}
    </div>
  );
};

function filmMatches(f: Film, query: string): boolean {
  const title = (f.title ?? "").toLowerCase();
  const filename = f.filename.toLowerCase();
  const director = (f.director ?? "").toLowerCase();
  const genre = (f.genre ?? "").toLowerCase();
  return (
    title.includes(query) ||
    filename.includes(query) ||
    director.includes(query) ||
    genre.includes(query)
  );
}
