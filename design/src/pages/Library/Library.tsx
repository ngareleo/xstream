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
 * Toggling:
 *   Clicking a poster that is already selected closes the pane (second click =
 *   deselect). This keeps the interaction model consistent with the Profiles page.
 *
 * View modes:
 *   "grid" (default) — poster cards in a responsive multi-column grid.
 *   "list"           — compact rows (not yet implemented; toggle UI is present).
 *
 * Navigation:
 *   The PLAY button in DetailPane uses <Link> so the Player can navigate(-1)
 *   back to /library?film=xxx with the pane restored.
 *
 * Data (mock → real):
 *   - `profiles` / `films` → useLazyLoadQuery on the LibraryPage query
 *   - Each profile section → LibraryContent fragment per library
 *   - Search filtering    → client-side on loaded data (fine for local libraries)
 */

import React, { type FC } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSplitResize } from "../../hooks/useSplitResize.js";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import {
  IconSearch,
  IconFilm,
  IconTv,
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

// ── PosterCard ────────────────────────────────────────────────────────────
// A single film tile in the grid. Clicking selects/deselects (opens pane).
// The gradient background is a placeholder for a real poster image.
// Visual indicators:
//   - 4K badge (top-right, red) when resolution === "4K"
//   - IMDb rating (bottom-right) when available
//   - Question-mark icon when the file is unmatched (no metadata linked yet)
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
        // Unmatched: the file exists but has no linked metadata.
        // In production, tapping this should open the link/search flow.
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

// ── DetailPane ────────────────────────────────────────────────────────────
// Slide-in detail panel. Matches the FilmDetailPane on the Dashboard page
// so both feel like the same component to users (consistent detail view).
// The 200px poster area uses the film's gradient — replace with real poster image.
const DetailPane: FC<{ film: Film; onClose: () => void }> = ({ film, onClose }) => (
  <div className="right-pane">
    <div style={{ height: 200, position: "relative", overflow: "hidden", flexShrink: 0, background: film.gradient }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom,rgba(0,0,0,0.58) 0%,transparent 40%,rgba(0,0,0,0.84) 100%)",
      }} />
      <div className="fd-actions">
        {/* <Link> pushes a history entry; Back in the Player returns to /library?film=xxx */}
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

// ── Library (page root) ───────────────────────────────────────────────────
export const Library: FC = () => {
  // Search and view-mode are local transient state — not URL-encoded because
  // they don't affect navigation (the user expects them to reset on navigation).
  const [search,   setSearch]   = React.useState("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("grid");

  // Selected film drives the right pane; encoded in the URL for Back support.
  const loading = useSimulatedLoad();
  usePageLoading(loading);

  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFilmId = searchParams.get("film");
  const selectedFilm   = selectedFilmId ? films.find((f) => f.id === selectedFilmId) : null;
  const paneOpen       = selectedFilm != null;

  // Toggle: clicking the already-selected poster closes the pane.
  const selectFilm = (id: string) => {
    if (selectedFilmId === id) {
      setSearchParams({});
    } else {
      setSearchParams({ film: id });
    }
  };

  const filterFilms = (profileFilms: Film[]) => {
    if (!search.trim()) return profileFilms;
    const q = search.toLowerCase();
    return profileFilms.filter(
      (f) =>
        (f.title    ?? "").toLowerCase().includes(q) ||
        f.filename.toLowerCase().includes(q) ||
        (f.genre ?? "").toLowerCase().includes(q),
    );
  };

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

            {/* Filter / view controls */}
            <div className="filter-bar">
              <div className="search-wrap" style={{ flex: 1, minWidth: 180 }}>
                <span className="search-icon">
                  <IconSearch size={13} />
                </span>
                <input
                  type="text"
                  placeholder="Search titles, genres, filenames…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="filter-select">
                <option>All Types</option>
                <option>Movies</option>
                <option>TV Shows</option>
              </select>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className={`icon-btn${viewMode === "grid" ? " active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
                    <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                </button>
                <button
                  className={`icon-btn${viewMode === "list" ? " active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="List view"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
                    <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* One section per profile, each containing its filtered poster grid */}
            {profiles.map((profile) => {
              const profileFilms = filterFilms(films.filter((f) => f.profile === profile.id));
              if (profileFilms.length === 0) return null;
              const Icon = profile.type === "tv" ? IconTv : IconFilm;
              return (
                <div key={profile.id} className="profile-section">
                  <div className="profile-section-head">
                    <Icon size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
                    <span className="section-name">{profile.name}</span>
                    <span className="section-count">{profileFilms.length} titles</span>
                    <a className="section-link" href="#">View all</a>
                  </div>
                  <div className="films-grid">
                    {profileFilms.map((film) => (
                      <PosterCard
                        key={film.id}
                        film={film}
                        onSelect={selectFilm}
                        selected={selectedFilmId === film.id}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {filterFilms(films).length === 0 && (
              <div className="empty-state">
                <div className="empty-icon" style={{ color: "var(--muted2)" }}>
                  <IconSearch size={36} />
                </div>
                <div className="empty-title">No results</div>
                <div className="empty-sub">Try a different search term</div>
              </div>
            )}
          </div>

          {/* Resize handle — only present when pane is open */}
          {paneOpen && (
            <div className="split-resize-handle" onMouseDown={onResizeMouseDown} />
          )}

          {/* Right pane: only rendered when a film is selected */}
          {paneOpen && selectedFilm && (
            <DetailPane film={selectedFilm} onClose={() => setSearchParams({})} />
          )}
        </div>
      </div>
      </>
    </DevThrowTarget>
  );
};
