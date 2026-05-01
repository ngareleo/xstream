import { type FC, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  type Film,
  films,
  getFilmById,
  profiles,
} from "../../data/mock.js";
import { ImdbBadge, IconSearch, IconWarn } from "../../lib/icons.js";
import { Poster } from "../../components/Poster/Poster.js";
import { DetailPane } from "../../components/DetailPane/DetailPane.js";
import { useSplitResize } from "../../hooks/useSplitResize.js";

type ViewMode = "grid" | "list";

export const Library: FC = () => {
  const [params, setParams] = useSearchParams();
  const filmId = params.get("film");
  const profileFilter = params.get("profile");
  const selectedFilm = filmId ? getFilmById(filmId) : undefined;
  const paneOpen = Boolean(selectedFilm);

  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize();

  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("grid");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return films.filter((f) => {
      if (profileFilter && f.profile !== profileFilter) return false;
      if (!q) return true;
      const hay = [f.title, f.filename, f.genre]
        .filter(Boolean)
        .map((s) => (s as string).toLowerCase());
      return hay.some((s) => s.includes(q));
    });
  }, [search, profileFilter]);

  const buildParams = (next: Record<string, string | null>): URLSearchParams => {
    const out = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) out.delete(k);
      else out.set(k, v);
    }
    return out;
  };

  const setProfileFilter = (id: string | null): void => {
    setParams(buildParams({ profile: id }));
  };

  const openFilm = (id: string): void => {
    if (filmId === id) setParams(buildParams({ film: null }));
    else setParams(buildParams({ film: id }));
  };

  const closePane = (): void => setParams(buildParams({ film: null }));

  return (
    <div
      ref={containerRef}
      style={
        paneOpen
          ? {
              display: "grid",
              gridTemplateColumns: `1fr 4px ${paneWidth}px`,
              height: "100%",
              transition: "grid-template-columns 0.25s ease",
            }
          : {
              display: "grid",
              gridTemplateColumns: "1fr 0px 0px",
              height: "100%",
              transition: "grid-template-columns 0.25s ease",
            }
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Filter bar */}
        <div
          style={{
            padding: "16px 28px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              padding: "8px 12px",
              borderRadius: 3,
            }}
          >
            <IconSearch style={{ color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, filename, genre…"
              style={{
                flex: 1,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text)",
                fontSize: 12,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-faint)",
                letterSpacing: "0.1em",
              }}
            >
              ⌘K
            </span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {(["grid", "list"] as const).map((m) => {
              const active = view === m;
              return (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  style={{
                    padding: "8px 14px",
                    border: "1px solid var(--border)",
                    background: active ? "var(--green-soft)" : "transparent",
                    color: active ? "var(--green)" : "var(--text-dim)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    borderRadius: 2,
                    textTransform: "uppercase",
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* Profile chips */}
        <div
          style={{
            padding: "12px 28px",
            display: "flex",
            gap: 8,
            borderBottom: "1px solid var(--border-soft)",
            alignItems: "center",
          }}
        >
          <ProfileChip
            label="All profiles"
            count={films.length}
            active={!profileFilter}
            onClick={() => setProfileFilter(null)}
          />
          {profiles.map((p) => (
            <ProfileChip
              key={p.id}
              label={p.name}
              count={p.filmCount ?? p.episodeCount ?? 0}
              active={profileFilter === p.id}
              warn={p.unmatched > 0}
              onClick={() =>
                setProfileFilter(profileFilter === p.id ? null : p.id)
              }
            />
          ))}
          <div style={{ flex: 1 }} />
          <span className="eyebrow">SORT · RECENTLY ADDED</span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
          {view === "grid" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 18,
              }}
            >
              {visible.map((f) => (
                <PosterCard
                  key={f.id}
                  film={f}
                  selected={filmId === f.id}
                  onClick={() => openFilm(f.id)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {visible.map((f) => (
                <ListRow
                  key={f.id}
                  film={f}
                  selected={filmId === f.id}
                  onClick={() => openFilm(f.id)}
                />
              ))}
            </div>
          )}
          {visible.length === 0 && (
            <div
              style={{
                padding: "60px 0",
                textAlign: "center",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              No films match the current filter.
            </div>
          )}
        </div>
      </div>

      {paneOpen && (
        <>
          <div
            onMouseDown={onResizeMouseDown}
            style={{
              backgroundColor: "var(--border)",
              cursor: "col-resize",
            }}
          />
          {selectedFilm && (
            <DetailPane film={selectedFilm} onClose={closePane} />
          )}
        </>
      )}
    </div>
  );
};

const ProfileChip: FC<{
  label: string;
  count: number;
  active: boolean;
  warn?: boolean;
  onClick: () => void;
}> = ({ label, count, active, warn, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "6px 12px",
      background: active ? "var(--green-soft)" : "var(--surface-2)",
      border: `1px solid ${active ? "var(--green-deep)" : "var(--border)"}`,
      color: active ? "var(--green)" : "var(--text-dim)",
      borderRadius: 999,
      fontSize: 11,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    {warn && <IconWarn />}
    <span>{label}</span>
    <span
      style={{
        color: "var(--text-faint)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
      }}
    >
      {count}
    </span>
  </button>
);

const PosterCard: FC<{
  film: Film;
  selected: boolean;
  onClick: () => void;
}> = ({ film, selected, onClick }) => {
  const showHdrChip = film.resolution === "4K" && film.hdr && film.hdr !== "—";
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          aspectRatio: "2/3",
          overflow: "hidden",
          border: selected
            ? "1px solid var(--green)"
            : "1px solid var(--border)",
          background: "var(--surface)",
          position: "relative",
          boxShadow: selected ? "0 0 0 3px var(--green-soft)" : "none",
          transition: "box-shadow 0.15s, border-color 0.15s",
        }}
      >
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        {showHdrChip && (
          <span
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "var(--green)",
              color: "var(--green-ink)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 2,
              letterSpacing: "0.1em",
            }}
          >
            4K · {film.hdr}
          </span>
        )}
        {film.rating !== null && (
          <div
            style={{
              position: "absolute",
              bottom: 6,
              right: 6,
              background: "rgba(0,0,0,0.7)",
              color: "var(--yellow)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "2px 6px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 2,
            }}
          >
            <ImdbBadge />
            {film.rating}
          </div>
        )}
        {!film.matched && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.4)",
              color: "var(--yellow)",
              fontFamily: "var(--font-mono)",
              fontSize: 38,
            }}
          >
            ?
          </div>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: "var(--text)" }}>
          {film.title ?? film.filename}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
            marginTop: 2,
          }}
        >
          {[film.year, film.duration].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
};

const ListRow: FC<{
  film: Film;
  selected: boolean;
  onClick: () => void;
}> = ({ film, selected, onClick }) => {
  const profileName = profiles.find((p) => p.id === film.profile)?.name ?? "";
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "48px 2fr 1fr 0.6fr 0.6fr 0.4fr",
        alignItems: "center",
        gap: 14,
        padding: "8px 14px",
        background: selected ? "var(--green-soft)" : "transparent",
        borderLeft: selected
          ? "2px solid var(--green)"
          : "2px solid transparent",
        cursor: "pointer",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        style={{ width: 48, height: 68, objectFit: "cover" }}
      />
      <div>
        <div style={{ fontSize: 12, color: "var(--text)" }}>
          {film.title ?? film.filename}
          {film.year && (
            <span style={{ color: "var(--text-muted)" }}> · {film.year}</span>
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
          {(film.genre ?? "UNMATCHED").toUpperCase()} · {profileName}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <span className={`chip ${film.resolution === "4K" ? "green" : ""}`}>
          {film.resolution}
        </span>
        {film.hdr && film.hdr !== "—" && (
          <span className="chip">{film.hdr}</span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--yellow)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {film.rating !== null && (
          <>
            <ImdbBadge />
            {film.rating}
          </>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-dim)",
        }}
      >
        {film.duration}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-dim)",
          textAlign: "right",
        }}
      >
        {film.size}
      </div>
    </div>
  );
};
