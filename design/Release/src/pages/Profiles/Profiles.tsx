import { type FC, useMemo, useState } from "react";
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

  // Pre-expand the profile that contains the selected film.
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
    if (filmId === id) {
      // toggle close
      setParams({});
    } else {
      setParams({ film: id });
    }
  };

  const closePane = (): void => {
    setParams({});
  };

  const totalFilms = profiles.reduce((acc, p) => acc + (p.filmCount ?? 0), 0);
  const totalUnmatched = profiles.reduce((acc, p) => acc + p.unmatched, 0);
  const scanningCount = profiles.filter((p) => p.scanning).length;
  const heroFilm = films.find((f) => f.id === "oppenheimer") ?? films[0];

  return (
    <div
      ref={containerRef}
      className={mergeClasses(
        s.splitBody,
        paneOpen && s.splitBodyOpen,
      )}
      style={
        paneOpen
          ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` }
          : undefined
      }
    >
      <div className={s.leftCol}>
        {/* Hero */}
        <div className={s.hero}>
          <Poster
            url={heroFilm.posterUrl}
            alt="hero"
            className={s.heroImg}
          />
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
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={mergeClasses(
                    s.slideDot,
                    i === 0 ? s.slideDotActive : s.slideDotInactive,
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className={s.breadcrumb}>
          <span style={{ color: "var(--text-dim)" }}>~</span>
          <span>/</span>
          <span>media</span>
          <span>/</span>
          <span style={{ color: "var(--text)" }}>films</span>
          <span className={s.breadcrumbScanning}>
            ● scanning {scanningCount} of {profiles.length}
          </span>
        </div>

        {/* Column header */}
        <div className={s.colHeader}>
          <div />
          <div>Profile / File</div>
          <div>Match</div>
          <div>Size</div>
          <div />
        </div>

        {/* Rows */}
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

        {/* Footer */}
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

/* ---------------- ProfileRow ---------------- */

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
  const matchPct = (profile.matched / profile.total) * 100;
  return (
    <div
      style={{
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "30px 1.3fr 0.7fr 0.6fr 80px",
          padding: "11px 24px",
          gap: 16,
          alignItems: "center",
          cursor: "pointer",
          background: expanded ? "var(--surface)" : "transparent",
        }}
      >
        <span
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0)",
            transition: "transform 0.15s",
            display: "inline-flex",
          }}
        >
          <IconChevron />
        </span>
        <div>
          <div style={{ fontSize: 13, color: "var(--text)" }}>{profile.name}</div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 2,
              letterSpacing: "0.04em",
            }}
          >
            {profile.path}
          </div>
        </div>

        {/* Match bar */}
        <div>
          {profile.scanning ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--green)",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 50,
                  border: "1.5px solid var(--green)",
                  borderTopColor: "transparent",
                  animation: "spin 0.9s linear infinite",
                }}
              />
              {profile.scanProgress?.done}/{profile.scanProgress?.total}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  height: 3,
                  background: "var(--surface-2)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${matchPct}%`,
                    height: "100%",
                    background:
                      profile.unmatched > 0
                        ? "var(--yellow)"
                        : "var(--green)",
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color:
                    profile.unmatched > 0
                      ? "var(--yellow)"
                      : "var(--text-muted)",
                  minWidth: 38,
                  textAlign: "right",
                }}
              >
                {Math.round(matchPct)}%
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
          }}
        >
          {profile.size}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            textAlign: "right",
            letterSpacing: "0.12em",
          }}
        >
          {profile.scanning ? "SCANNING…" : "EDIT · ↻"}
        </div>
      </div>

      {expanded && children.length > 0 && (
        <div style={{ paddingLeft: 30, background: "var(--bg-1)" }}>
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

/* ---------------- FilmRow ---------------- */

interface FilmRowProps {
  film: Film;
  selected: boolean;
  onClick: () => void;
}

const FilmRow: FC<FilmRowProps> = ({ film, selected, onClick }) => {
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "30px 1.3fr 0.7fr 0.6fr 80px",
        padding: "8px 24px",
        gap: 16,
        alignItems: "center",
        background: selected ? "var(--green-soft)" : "transparent",
        borderLeft: selected
          ? "2px solid var(--green)"
          : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        style={{
          width: 26,
          height: 38,
          objectFit: "cover",
          border: "1px solid var(--border)",
        }}
      />
      <div>
        <div style={{ fontSize: 12, color: "var(--text)" }}>
          {film.title ?? film.filename}{" "}
          {film.year && (
            <span style={{ color: "var(--text-muted)" }}>· {film.year}</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            marginTop: 2,
          }}
        >
          {(film.genre ?? "UNMATCHED").toUpperCase()} · {film.duration}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <span className="chip green" style={{ fontSize: 9, padding: "2px 5px" }}>
          {film.resolution}
        </span>
        {film.hdr && film.hdr !== "—" && (
          <span className="chip" style={{ fontSize: 9, padding: "2px 5px" }}>
            {film.hdr}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-dim)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {film.rating !== null && (
          <>
            <ImdbBadge />
            <span style={{ color: "var(--yellow)" }}>{film.rating}</span>
          </>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        <Link
          to={`/player/${film.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-block",
            background: selected ? "var(--green)" : "transparent",
            color: selected ? "var(--green-ink)" : "var(--text-muted)",
            border: selected ? 0 : "1px solid var(--border)",
            padding: "4px 10px",
            borderRadius: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          ▶ Play
        </Link>
      </div>
    </div>
  );
};
