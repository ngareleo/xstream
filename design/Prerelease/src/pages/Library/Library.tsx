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

import { mergeClasses } from "@griffel/react";
import React, { type FC, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSplitResize } from "../../hooks/useSplitResize.js";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { LinkSearch, type Suggestion } from "../../components/LinkSearch/LinkSearch.js";
import {
  IconSearch,
  IconClose,
  IconPlay,
  IconEdit,
} from "../../lib/icons.js";
import { profiles, films, type Film } from "../../data/mock.js";
import { useSimulatedLoad } from "../../hooks/useSimulatedLoad.js";
import { usePageLoading } from "../../components/LoadingBar/LoadingBarContext.js";
import { DevThrowTarget } from "../../components/DevTools/DevToolsContext.js";
import { useLibraryStyles } from "./Library.styles.js";
import { tokens } from "../../styles/tokens.js";

type ViewMode = "grid" | "list";

// ── PosterCard (grid view) ────────────────────────────────────────────────────

const useLStyles = useLibraryStyles;

const PosterCard: FC<{
  film:     Film;
  onSelect: (id: string) => void;
  selected: boolean;
}> = ({ film, onSelect, selected }) => {
  const s = useLStyles();
  return (
    <div
      className={mergeClasses(s.posterCard, selected && s.posterCardSelected)}
      onClick={() => onSelect(film.id)}
    >
      <div className={s.posterImg} style={{ background: film.gradient }}>
        {film.matched && film.resolution === "4K" && (
          <span style={{ position: "absolute", top: 5, left: 5 }}>
            <span className={mergeClasses(s.badge, s.badgeRed)} style={{ fontSize: 9 }}>4K</span>
          </span>
        )}
        {film.rating && (
          <span style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.75)", color: "var(--yellow)", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3 }}>{film.rating}</span>
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
      <div className={s.posterInfo}>
        <div className={s.posterTitle}>{film.title ?? film.filename}</div>
        <div className={s.posterMeta}>{film.year ? `${film.year} · ${film.genre}` : "Unmatched"}</div>
      </div>
    </div>
  );
};

// ── FilmListRow (list view) ───────────────────────────────────────────────────

const FilmListRow: FC<{
  film:     Film;
  onSelect: (id: string) => void;
  selected: boolean;
}> = ({ film, onSelect, selected }) => {
  const s = useLStyles();
  const profile = profiles.find((p) => p.id === film.profile);

  return (
    <div
      className={mergeClasses(s.listRow, selected && s.listRowSelected)}
      onClick={() => onSelect(film.id)}
    >
      {/* Thumbnail */}
      <div className={s.listThumb} style={{ background: film.gradient }}>
        {!film.matched && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 16, height: 16, opacity: 0.4, color: "rgba(245,197,24,0.6)" }}>
            <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        )}
      </div>

      {/* Title + meta */}
      <div className={s.listInfo}>
        <div className={s.listTitle}>{film.title ?? film.filename}</div>
        <div className={s.listMeta}>
          {film.year ? `${film.year} · ${film.genre}` : "Unmatched"}
          {profile && <span className={s.listProfile}>{profile.name}</span>}
        </div>
      </div>

      {/* Badges */}
      <div className={s.listBadges}>
        {film.matched && <span className={mergeClasses(s.badge, film.resolution === "4K" ? s.badgeRed : s.badgeGray)}>{film.resolution}</span>}
        {film.hdr && <span className={mergeClasses(s.badge, s.badgeGray)}>{film.hdr}</span>}
      </div>

      {/* Rating */}
      <div className={s.listRating}>{film.rating}</div>

      {/* Duration */}
      <div className={s.listDuration}>{film.duration}</div>

      {/* Size */}
      <div className={s.listSize}>{film.size}</div>
    </div>
  );
};

// ── DetailPane ────────────────────────────────────────────────────────────────

const DetailPane: FC<{ film: Film; onClose: () => void }> = ({ film, onClose }) => {
  const [linking, setLinking] = useState(false);
  const s = useLStyles();

  const handleLinked = (_suggestion: Suggestion) => {
    // In production: fire the re-link mutation with the chosen metadata ID.
    // For the design lab we just close the search panel.
    setLinking(false);
  };

  return (
    <div className={s.rightPane}>
      {/* Poster / header — always visible */}
      <div style={{ height: 200, position: "relative", overflow: "hidden", flexShrink: 0, background: film.gradient }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom,rgba(0,0,0,0.58) 0%,transparent 40%,rgba(0,0,0,0.84) 100%)",
        }} />
        <div className={s.fdActions}>
          <Link to={`/player/${film.id}`} className={mergeClasses(s.fdActionBtn, s.fdActionBtnPrimary)}>
            <IconPlay size={10} />
            PLAY
          </Link>
          <div className={s.fdActionSep} />
          <button
            className={mergeClasses(s.fdActionBtn, linking && s.fdActionBtnActive)}
            onClick={() => setLinking((l) => !l)}
            data-tip="Re-link metadata"
          >
            <IconEdit size={10} /> RE-LINK
          </button>
          <div style={{ flex: 1 }} />
          <button className={s.fdActionClose} onClick={onClose}><IconClose size={13} /></button>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px", zIndex: 2 }}>
          <div style={{
            fontFamily: tokens.fontHead, fontSize: 22,
            letterSpacing: ".06em", color: tokens.colorWhite, lineHeight: 1,
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

      {/* Content area — switches between detail view and link search */}
      {linking ? (
        <LinkSearch
          filename={film.filename}
          onLink={handleLinked}
          onCancel={() => setLinking(false)}
        />
      ) : (
        <div style={{ overflowY: "auto", flex: 1 }}>
          {film.rating && (
            <>
              <div style={{
                display: "flex", gap: 5, flexWrap: "wrap",
                padding: "12px 16px", borderBottom: `1px solid ${tokens.colorBorder}`,
              }}>
                <span className={mergeClasses(s.badge, s.badgeRed)}>{film.resolution}</span>
                {film.hdr  && <span className={mergeClasses(s.badge, s.badgeGray)}>{film.hdr}</span>}
                <span className={mergeClasses(s.badge, s.badgeGray)}>{film.codec}</span>
                <span className={mergeClasses(s.badge, s.badgeGray)}>{film.audio}</span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", borderBottom: `1px solid ${tokens.colorBorder}`,
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: tokens.colorYellow }}>{film.rating}</span>
                <span style={{ fontSize: 11, color: tokens.colorMuted }}>IMDb · {film.duration}</span>
              </div>
            </>
          )}
          {film.plot && (
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${tokens.colorBorder}` }}>
              <div className={s.sectionLabel}>Synopsis</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                {film.plot}
              </div>
            </div>
          )}
          {film.cast.length > 0 && (
            <div style={{ padding: "12px 16px" }}>
              <div className={s.sectionLabel}>Cast</div>
              <div className={s.detailCast}>
                {film.cast.map((c) => <span key={c} className={s.castChip}>{c}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Library (page root) ───────────────────────────────────────────────────────

export const Library: FC = () => {
  const [search,     setSearch]     = React.useState("");
  const [viewMode,   setViewMode]   = React.useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [scrolled,   setScrolled]   = React.useState(false);

  // Reset fade when switching view modes — the new list/grid starts at top.
  React.useEffect(() => { setScrolled(false); }, [viewMode]);

  const loading = useSimulatedLoad();
  usePageLoading(loading);

  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);

  // `profile` and `film` live in the URL so that:
  //   - navigating from the profile menu (/library?profile=xxx) activates the chip
  //   - deep links like /library?profile=xxx&film=yyy open both filter and pane
  const [searchParams, setSearchParams] = useSearchParams();
  const profileFilter  = searchParams.get("profile");
  const selectedFilmId = searchParams.get("film");
  const selectedFilm   = selectedFilmId ? films.find((f) => f.id === selectedFilmId) : null;
  const paneOpen       = selectedFilm != null;

  // Build params helper — always preserves the profile filter across film selections.
  const buildParams = (overrides: Record<string, string | null>) => {
    const base: Record<string, string> = {};
    if (profileFilter) base.profile = profileFilter;
    if (selectedFilmId) base.film = selectedFilmId;
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) delete base[k];
      else base[k] = v;
    }
    return base;
  };

  const selectFilm = (id: string) => {
    if (selectedFilmId === id) setSearchParams(buildParams({ film: null }));
    else setSearchParams(buildParams({ film: id }));
  };

  const setProfileFilter = (id: string | null) => {
    // Changing the profile filter closes the detail pane (film may not be in new profile).
    if (id) setSearchParams({ profile: id });
    else setSearchParams({});
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

  const s = useLStyles();

  return (
    <DevThrowTarget id="Library">
      <>
      <AppHeader collapsed={false}>
        <span className={s.topbarTitle}>Library</span>
      </AppHeader>

      <div className="main">
        <div
          ref={containerRef}
          className={s.splitBody}
          style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
        >
          <div className={s.splitLeft}>

            {/* ── Filter bar ── */}
            <div className={s.filterBar}>
              {/* Search */}
              <div className={s.searchWrap} style={{ flex: 1, minWidth: 180 }}>
                <span className={s.searchIcon}><IconSearch size={13} /></span>
                <input
                  className={s.searchInput}
                  type="text"
                  placeholder="Search titles, genres, filenames…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Type filter */}
              <select
                className={s.filterSelect}
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
                  className={mergeClasses(s.iconBtn, viewMode === "grid" && s.iconBtnActive)}
                  onClick={() => setViewMode("grid")}
                  title="Grid view"
                  data-tip="Grid"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 15, height: 15 }}>
                    <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                </button>
                <button
                  className={mergeClasses(s.iconBtn, viewMode === "list" && s.iconBtnActive)}
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
            <div className={s.profileChips}>
              <button
                className={mergeClasses(s.chip, profileFilter === null && s.chipActive)}
                onClick={() => setProfileFilter(null)}
              >
                All profiles
                <span className={s.chipCount}>{films.length}</span>
              </button>
              {profiles.map((p) => {
                const count = films.filter((f) => f.profile === p.id).length;
                return (
                  <button
                    key={p.id}
                    className={mergeClasses(s.chip, profileFilter === p.id && s.chipActive)}
                    onClick={() => setProfileFilter(profileFilter === p.id ? null : p.id)}
                  >
                    {p.name}
                    <span className={s.chipCount}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Results ── */}
            {filteredFilms.length === 0 ? (
              <div className={s.emptyState}>
                <div className={s.emptyIcon} style={{ color: tokens.colorMuted2 }}>
                  <IconSearch size={36} />
                </div>
                <div className={s.emptyTitle}>No results</div>
                <div className={s.emptySub}>Try a different search term or filter</div>
              </div>
            ) : viewMode === "grid" ? (
              <div className={mergeClasses(s.scrollWrap, scrolled && s.scrollWrapScrolled)}>
              <div className={s.gridArea} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
                <div className={s.grid}>
                  {filteredFilms.map((film) => (
                    <PosterCard
                      key={film.id}
                      film={film}
                      onSelect={selectFilm}
                      selected={selectedFilmId === film.id}
                    />
                  ))}
                </div>
              </div>
              </div>
            ) : (
              <div className={mergeClasses(s.scrollWrap, scrolled && s.scrollWrapScrolled)}>
              <div className={s.listArea} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
                <div className={s.listHeader}>
                  <div />
                  <div className={s.listHeaderCell}>Title</div>
                  <div className={s.listHeaderCell}>Format</div>
                  <div className={s.listHeaderCell} style={{ textAlign: "right" }}>Rating</div>
                  <div className={s.listHeaderCell} style={{ textAlign: "right" }}>Duration</div>
                  <div className={s.listHeaderCell} style={{ textAlign: "right" }}>Size</div>
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
              </div>
            )}
          </div>

          {/* Resize handle */}
          {paneOpen && (
            <div className={s.resizeHandle} onMouseDown={onResizeMouseDown} />
          )}

          {/* Detail pane */}
          {paneOpen && selectedFilm && (
            <DetailPane film={selectedFilm} onClose={() => setSearchParams(buildParams({ film: null }))} />
          )}
        </div>
      </div>
      </>
    </DevThrowTarget>
  );
};
