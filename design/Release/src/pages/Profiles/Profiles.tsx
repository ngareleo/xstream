import { type FC, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { getFilmById, getFilmsForProfile, profiles } from "../../data/mock.js";
import { DetailPane } from "../../components/DetailPane/DetailPane.js";
import { FilmRow } from "../../components/FilmRow/FilmRow.js";
import { ProfileRow } from "../../components/ProfileRow/ProfileRow.js";
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
  const selectedFilm = filmId ? getFilmById(filmId) : undefined;
  const paneOpen = Boolean(selectedFilm);

  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize();

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

  const closePane = (): void => setParams({});

  const totalFilms = profiles.reduce((acc, p) => acc + (p.filmCount ?? 0), 0);
  const totalUnmatched = profiles.reduce((acc, p) => acc + p.unmatched, 0);
  const scanningCount = profiles.filter((p) => p.scanning).length;

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

        <div className={s.colHeader}>
          <div />
          <div>Profile / File</div>
          <div>Match</div>
          <div>Size</div>
          <div />
        </div>

        <div className={s.rowsScroll}>
          {profiles.map((p) => {
            const filmsInProfile = getFilmsForProfile(p.id);
            return (
              <ProfileRow
                key={p.id}
                profile={p}
                expanded={expandedIds.has(p.id)}
                onToggle={() => toggleProfile(p.id)}
              >
                {filmsInProfile.map((f) => (
                  <FilmRow
                    key={f.id}
                    film={f}
                    selected={filmId === f.id}
                    onClick={() => openFilm(f.id)}
                  />
                ))}
              </ProfileRow>
            );
          })}
        </div>

        <div className={s.footer}>
          <span>
            {profiles.length} PROFILES · {totalFilms} FILMS · {totalUnmatched} UNMATCHED
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
            <DetailPane film={selectedFilm} onClose={closePane} />
          )}
        </>
      )}
    </div>
  );
};
