import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  type Film,
  type Profile,
  films,
  getFilmById,
  getFilmsForProfile,
  profiles,
  user,
} from "../../data/mock.js";

const HERO_FILM_IDS = ["oppenheimer", "barbie", "nosferatu", "civilwar"] as const;
const HERO_INTERVAL_MS = 6000;
const HERO_FADE_MS = 600;
import { ImdbBadge, IconChevron } from "../../lib/icons.js";
import { Poster } from "../../components/Poster/Poster.js";
import { DetailPane } from "../../components/DetailPane/DetailPane.js";
import { useSplitResize } from "../../hooks/useSplitResize.js";
import { useProfilesStyles } from "./Profiles.styles.js";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const Profiles: FC = () => {
  const s = useProfilesStyles();
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

  const heroFilms = useMemo<Film[]>(() => {
    const list = HERO_FILM_IDS.map((id) => getFilmById(id)).filter(
      (f): f is Film => f !== undefined,
    );
    return list.length > 0 ? list : films.slice(0, 4);
  }, []);

  const [heroIndex, setHeroIndex] = useState(0);
  const [heroFading, setHeroFading] = useState(false);
  const heroFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
  }, [heroFilms.length]);

  const goToHero = (idx: number): void => {
    if (idx === heroIndex) return;
    setHeroFading(true);
    setTimeout(() => {
      setHeroIndex(idx);
      setHeroFading(false);
    }, HERO_FADE_MS / 2);
  };

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
        <div className={s.hero}>
          <div className={s.heroSlides}>
            {heroFilms.map((film, i) => (
              <Poster
                key={film.id}
                url={film.posterUrl}
                alt={film.title ?? film.filename}
                className={mergeClasses(
                  s.heroImg,
                  i === heroIndex && s.heroImgActive,
                  i === heroIndex && heroFading && s.heroImgFading,
                )}
              />
            ))}
          </div>
          <div className={s.heroEdgeFade} />
          <div className={s.heroGradient} />
          <div className="grain-layer" />
          <div className={s.heroBody}>
            <div>
              <div className={s.greetingEyebrow}>
                · {greeting()}, {user.name.toUpperCase()}
              </div>
              <div className={s.greeting}>
                {totalFilms} films,
                <br />
                quietly indexed.
              </div>
            </div>
            <div className={s.slideDots}>
              {heroFilms.map((film, i) => (
                <button
                  key={film.id}
                  type="button"
                  onClick={() => goToHero(i)}
                  aria-label={`Show ${film.title ?? film.filename}`}
                  className={mergeClasses(
                    s.slideDot,
                    i === heroIndex ? s.slideDotActive : s.slideDotInactive,
                  )}
                />
              ))}
            </div>
          </div>
        </div>

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
          {profiles.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              expanded={expandedIds.has(p.id)}
              onToggle={() => toggleProfile(p.id)}
              children={getFilmsForProfile(p.id)}
              selectedFilmId={filmId}
              onSelectFilm={openFilm}
            />
          ))}
        </div>

        <div className={s.footer}>
          <span>
            {profiles.length} PROFILES · {totalFilms} FILMS · {totalUnmatched} UNMATCHED
          </span>
          <button className={s.footerCta}>+ NEW PROFILE</button>
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

interface ProfileRowProps {
  profile: Profile;
  expanded: boolean;
  onToggle: () => void;
  children: Film[];
  selectedFilmId: string | null;
  onSelectFilm: (id: string) => void;
}

const ProfileRow: FC<ProfileRowProps> = ({
  profile,
  expanded,
  onToggle,
  children,
  selectedFilmId,
  onSelectFilm,
}) => {
  const s = useProfilesStyles();
  const matchPct = (profile.matched / profile.total) * 100;
  const warn = profile.unmatched > 0;
  return (
    <div className={s.profileBlock}>
      <div
        onClick={onToggle}
        className={mergeClasses(
          s.profileHeader,
          expanded && s.profileHeaderExpanded,
        )}
      >
        <span className={mergeClasses(s.chevron, expanded && s.chevronOpen)}>
          <IconChevron />
        </span>
        <div>
          <div className={s.profileName}>{profile.name}</div>
          <div className={s.profilePath}>{profile.path}</div>
        </div>

        <div>
          {profile.scanning ? (
            <div className={s.scanRow}>
              <div className={s.scanSpinner} />
              {profile.scanProgress?.done}/{profile.scanProgress?.total}
            </div>
          ) : (
            <div className={s.matchRow}>
              <div className={s.matchTrack}>
                <div
                  className={mergeClasses(s.matchFill, warn && s.matchFillWarn)}
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <span
                className={mergeClasses(s.matchPct, warn && s.matchPctWarn)}
              >
                {Math.round(matchPct)}%
              </span>
            </div>
          )}
        </div>

        <div className={s.size}>{profile.size}</div>
        <div className={s.rowEnd}>
          {profile.scanning ? "SCANNING…" : "EDIT · ↻"}
        </div>
      </div>

      {expanded && children.length > 0 && (
        <div className={s.filmsList}>
          {children.map((f) => (
            <FilmRow
              key={f.id}
              film={f}
              selected={selectedFilmId === f.id}
              onClick={() => onSelectFilm(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FilmRowProps {
  film: Film;
  selected: boolean;
  onClick: () => void;
}

const FilmRow: FC<FilmRowProps> = ({ film, selected, onClick }) => {
  const s = useProfilesStyles();
  return (
    <div
      onClick={onClick}
      className={mergeClasses(s.filmRow, selected && s.filmRowSelected)}
    >
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        className={s.filmThumb}
      />
      <div>
        <div className={s.filmTitle}>
          {film.title ?? film.filename}{" "}
          {film.year && <span className={s.filmYear}>· {film.year}</span>}
        </div>
        <div className={s.filmMeta}>
          {(film.genre ?? "UNMATCHED").toUpperCase()} · {film.duration}
        </div>
      </div>
      <div className={s.chipRow}>
        <span className={mergeClasses("chip", "green", s.chipSmall)}>
          {film.resolution}
        </span>
        {film.hdr && film.hdr !== "—" && (
          <span className={mergeClasses("chip", s.chipSmall)}>{film.hdr}</span>
        )}
      </div>
      <div className={s.ratingCell}>
        {film.rating !== null && (
          <>
            <ImdbBadge />
            <span className={s.ratingValue}>{film.rating}</span>
          </>
        )}
      </div>
      <div className={s.playCell}>
        <Link
          to={`/player/${film.id}`}
          onClick={(e) => e.stopPropagation()}
          className={mergeClasses(s.playLink, selected && s.playLinkActive)}
        >
          ▶ Play
        </Link>
      </div>
    </div>
  );
};
