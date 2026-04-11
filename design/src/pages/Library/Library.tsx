/**
 * Library page — poster grid / list view of all films across every profile.
 *
 * Layout:
 *   AppShell grid → header + sidebar + main.
 *   Inside `.main`: `split-body` (1fr / 0 → 360px right pane).
 *
 * Right pane (URL-encoded):
 *   ?film=xxx  →  DetailPane open for that film
 *   (no param) →  pane closed
 *
 * Filter bar:
 *   - Search (title / genre / filename)
 *   - Profile chips  — "All profiles" + one chip per profile
 *   - Type select    — All / Movies / TV Shows
 *   - View toggle    — grid | list
 *
 * Films are displayed in a single flat list (no per-profile sections).
 * Toggling: clicking the already-selected poster/row closes the pane.
 *
 * Data (mock → real):
 *   - `profiles` / `films` → useLazyLoadQuery on the LibraryPage query
 *   - Search + profile + type filtering → client-side on loaded data
 */

import React, { type FC } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSplitResize } from "../../hooks/useSplitResize.js";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import {
  IconSearch,
  IconClose,
  IconPlay,
  IconPencil,
} from "../../lib/icons.js";
import { profiles, films, type Film } from "../../data/mock.js";
import { useSimulatedLoad } from "../../hooks/useSimulatedLoad.js";
import { usePageLoading } from "../../components/LoadingBar/LoadingBarContext.js";
import { DevThrowTarget } from "../../components/DevTools/DevToolsContext.js";
import "./Library.css";

type ViewMode = "grid" | "list";

// ── PosterCard (grid view) ────────────────────────────────────────────────────

const PosterCard: FC<{
  film:     Film;
  onSelect: (id: string) => void;
  selected: boolean;
}> = ({ film, onSelect, selected }) => (
  <div
    className={`poster-card${selected ? " selected" : ""}`}
    onClick={() => onSelect(film.id)}
  >
    <div className="poster-img" style={{ background: film.gradient }}>
      {film.matched && film.resolution === "4K" && (
        <span className="poster-res">
          <span className="badge badge-red" style={{ fontSize: 9 }}>4K</span>
        </span>
      )}
      {film.rating && (
        <span className="poster-rating">{film.rating}</span>
      )}
      {!film.matched && (
        <div style={{
          color: "rgba(245,197,24,0.4)", display: "flex",
          alignItems: "center", justifyContent: "center", height: "100%",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 32, height: 32, opacity: 0.4 }}>
            <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        </div>
      )}
    </div>
    <div className="poster-info">
      <div className="poster-title">{film.title ?? film.filename}</div>
      <div className="poster-meta">{film.year ? `${film.year} · ${film.genre}` : "Unmatched"}</div>
    </div>
  </div>
);

// ── FilmListRow (list view) ───────────────────────────────────────────────────

const FilmListRow: FC<{
  film:     Film;
  onSelect: (id: string) => void;
  selected: boolean;
}> = ({ film, onSelect, selected }) => {
  const profile = profiles.find((p) => p.id === film.profile);

  return (
    <div
      className={`film-list-row${selected ? " selected" : ""}`}
      onClick={() => onSelect(film.id)}
    >
      {/* Thumbnail */}
      <div className="flr-thumb" style={{ background: film.gradient }}>
        {!film.matched && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16, opacity: 0.4, color: "rgba(245,197,24,0.6)" }}>
            <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        )}
      </div>

      {/* Title + meta */}
      <div className="flr-info">
        <div className="flr-title">{film.title ?? film.filename}</div>
        <div className="flr-meta">
          {film.year ? `${film.year} · ${film.genre}` : "Unmatched"}
          {profile && <span className="flr-profile">{profile.name}</span>}
        </div>
      </div>

      {/* Badges */}
      <div className="flr-badges">
        {film.matched && <span className={`badge ${film.resolution === "4K" ? "badge-red" : "badge-gray"}`}>{film.resolution}</span>}
        {film.hdr && <span className="badge badge-gray">{film.hdr}</span>}
      </div>

      {/* Rating */}
      {film.rating ? (
        <div className="flr-rating">{film.rating}</div>
      ) : (
        <div className="flr-rating" />
      )}

      {/* Duration */}
      <div className="flr-duration">{film.duration}</div>

      {/* Size */}
      <div className="flr-size">{film.size}</div>
    </div>
  );
};

// ── DetailPane ────────────────────────────────────────────────────────────────

const DetailPane: FC<{ film: Film; onClose: () => void }> = ({ film, onClose }) => (
  <div className="right-pane">
    <div style={{ height: 200, position: "relative", overflow: "hidden", flexShrink: 0, background: film.gradient }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom,rgba(0,0,0,0.58) 0%,transparent 40%,rgba(0,0,0,0.84) 100%)",
      }} />
      <div className="fd-actions">
        <Link to={`/player/${film.id}`} className="fd-action-btn primary">
          <IconPlay size={10} />
          PLAY
        </Link>
        <div className="fd-action-sep" />
        <button className="fd-action-btn" data-tip="Re-link metadata"><IconPencil size={10} /> RE-LINK</button>
        <div style={{ flex: 1 }} />
        <button className="fd-action-close" onClick={onClose}><IconClose size={13} /></button>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px", zIndex: 2 }}>
        <div style={{
          fontFamily: "var(--font-head)", fontSize: 22,
          letterSpacing: ".06em", color: "var(--white)", lineHeight: 1,
        }}>
          {film.title ?? film.filename}
        </div>
        {film.year && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
            {film.year} · {film.genre}
          </div>
        )}
      </div>
    </div>
    <div style={{ overflowY: "auto", flex: 1 }}>
      {film.rating && (
        <>
          <div style={{
            display: "flex", gap: 5, flexWrap: "wrap",
            padding: "12px 16px", borderBottom: "1px solid var(--border)",
          }}>
            <span className="badge badge-red">{film.resolution}</span>
            {film.hdr  && <span className="badge badge-gray">{film.hdr}</span>}
            <span className="badge badge-gray">{film.codec}</span>
            <span className="badge badge-gray">{film.audio}</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--yellow)" }}>{film.rating}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>IMDb · {film.duration}</span>
          </div>
        </>
      )}
      {film.plot && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="section-label">Synopsis</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
            {film.plot}
          </div>
        </div>
      )}
      {film.cast.length > 0 && (
        <div style={{ padding: "12px 16px" }}>
          <div className="section-label">Cast</div>
          <div className="detail-cast">
            {film.cast.map((c) => <span key={c} className="cast-chip">{c}</span>)}
          </div>
        </div>
      )}
    </div>
  </div>
);

// ── Library (page root) ───────────────────────────────────────────────────────

export const Library: FC = () => {
  const [search,        setSearch]        = React.useState("");
  const [viewMode,      setViewMode]      = React.useState<ViewMode>("grid");
  const [profileFilter, setProfileFilter] = React.useState<string | null>(null);
  const [typeFilter,    setTypeFilter]    = React.useState("all");

  const loading = useSimulatedLoad();
  usePageLoading(loading);

  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFilmId = searchParams.get("film");
  const selectedFilm   = selectedFilmId ? films.find((f) => f.id === selectedFilmId) : null;
  const paneOpen       = selectedFilm != null;

  const selectFilm = (id: string) => {
    if (selectedFilmId === id) setSearchParams({});
    else setSearchParams({ film: id });
  };

  const filteredFilms = React.useMemo(() => {
    let result = films;

    if (profileFilter) {
      result = result.filter((f) => f.profile === profileFilter);
    }

    if (typeFilter === "movies") {
      result = result.filter((f) => f.mediaType === "movies" || f.mediaType === undefined);
    } else if (typeFilter === "tv") {
      result = result.filter((f) => f.mediaType === "tv");
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          (f.title    ?? "").toLowerCase().includes(q) ||
          f.filename.toLowerCase().includes(q)         ||
          (f.genre    ?? "").toLowerCase().includes(q),
      );
    }

    return result;
  }, [profileFilter, typeFilter, search]);

  return (
    <DevThrowTarget id="Library">
      <>
      <AppHeader collapsed={false}>
        <span className="topbar-title">Library</span>
      </AppHeader>

      <div className="main">
        <div
          ref={containerRef}
          className={`split-body${paneOpen ? " pane-open" : ""}`}
          style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
        >
          <div className="split-left">

            {/* ── Filter bar ── */}
            <div className="filter-bar">
              {/* Search */}
              <div className="search-wrap" style={{ flex: 1, minWidth: 180 }}>
                <span className="search-icon"><IconSearch size={13} /></span>
                <input
                  type="text"
                  placeholder="Search titles, genres, filenames…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Type filter */}
              <select
                className="filter-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All Types</option>
                <option value="movies">Movies</option>
                <option value="tv">TV Shows</option>
              </select>

              {/* View toggle */}
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className={`icon-btn${viewMode === "grid" ? " active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                  data-tip="Grid"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
                    <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                </button>
                <button
                  className={`icon-btn${viewMode === "list" ? " active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="List view"
                  data-tip="List"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
                    <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Profile chips ── */}
            <div className="profile-chips">
              <button
                className={`profile-chip${profileFilter === null ? " active" : ""}`}
                onClick={() => setProfileFilter(null)}
              >
                All profiles
                <span className="chip-count">{films.length}</span>
              </button>
              {profiles.map((p) => {
                const count = films.filter((f) => f.profile === p.id).length;
                return (
                  <button
                    key={p.id}
                    className={`profile-chip${profileFilter === p.id ? " active" : ""}`}
                    onClick={() => setProfileFilter(profileFilter === p.id ? null : p.id)}
                  >
                    {p.name}
                    <span className="chip-count">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Results ── */}
            {filteredFilms.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon" style={{ color: "var(--muted2)" }}>
                  <IconSearch size={36} />
                </div>
                <div className="empty-title">No results</div>
                <div className="empty-sub">Try a different search term or filter</div>
              </div>
            ) : viewMode === "grid" ? (
              <div className="films-grid">
                {filteredFilms.map((film) => (
                  <PosterCard
                    key={film.id}
                    film={film}
                    onSelect={selectFilm}
                    selected={selectedFilmId === film.id}
                  />
                ))}
              </div>
            ) : (
              <div className="films-list">
                <div className="flr-header">
                  <div className="flr-header-title">Title</div>
                  <div className="flr-header-badges">Format</div>
                  <div className="flr-header-rating">Rating</div>
                  <div className="flr-header-duration">Duration</div>
                  <div className="flr-header-size">Size</div>
                </div>
                {filteredFilms.map((film) => (
                  <FilmListRow
                    key={film.id}
                    film={film}
                    onSelect={selectFilm}
                    selected={selectedFilmId === film.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Resize handle */}
          {paneOpen && (
            <div className="split-resize-handle" onMouseDown={onResizeMouseDown} />
          )}

          {/* Detail pane */}
          {paneOpen && selectedFilm && (
            <DetailPane film={selectedFilm} onClose={() => setSearchParams({})} />
          )}
        </div>
      </div>
      </>
    </DevThrowTarget>
  );
};
