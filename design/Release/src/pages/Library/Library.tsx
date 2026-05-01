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
import { useLibraryStyles } from "./Library.styles.js";

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

  const styles = useLibraryStyles();

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

  // Grid template depends on a runtime pane width — kept inline because Griffel
  // cannot compose dynamic numeric values into the columns track string.
  const containerStyle = paneOpen
    ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` }
    : { gridTemplateColumns: "1fr 0px 0px" };

  return (
    <div ref={containerRef} className={styles.container} style={containerStyle}>
      <div className={styles.mainColumn}>
        {/* Filter bar */}
        <div className={styles.filterBar}>
          <div className={styles.searchBox}>
            <IconSearch className={styles.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, filename, genre…"
              className={styles.searchInput}
            />
            <span className={styles.kbdHint}>⌘K</span>
          </div>
          <div className={styles.viewToggleGroup}>
            {(["grid", "list"] as const).map((m) => {
              const active = view === m;
              return (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={mergeClasses(
                    styles.viewToggleBtn,
                    active && styles.viewToggleBtnActive,
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* Profile chips */}
        <div className={styles.profileChipsBar}>
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
          <div className={styles.spacer} />
          <span className="eyebrow">SORT · RECENTLY ADDED</span>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {view === "grid" ? (
            <div className={styles.gridLayout}>
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
            <div className={styles.listLayout}>
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
            <div className={styles.emptyState}>
              No films match the current filter.
            </div>
          )}
        </div>
      </div>

      {paneOpen && (
        <>
          <div onMouseDown={onResizeMouseDown} className={styles.splitter} />
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
}> = ({ label, count, active, warn, onClick }) => {
  const styles = useLibraryStyles();
  return (
    <button
      onClick={onClick}
      className={mergeClasses(styles.chip, active && styles.chipActive)}
    >
      {warn && <IconWarn />}
      <span>{label}</span>
      <span className={styles.chipCount}>{count}</span>
    </button>
  );
};

const PosterCard: FC<{
  film: Film;
  selected: boolean;
  onClick: () => void;
}> = ({ film, selected, onClick }) => {
  const styles = useLibraryStyles();
  const showHdrChip = film.resolution === "4K" && film.hdr && film.hdr !== "—";
  return (
    <div onClick={onClick} className={styles.posterCard}>
      <div
        className={mergeClasses(
          styles.posterFrame,
          selected && styles.posterFrameSelected,
        )}
      >
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          className={styles.posterImage}
        />
        {showHdrChip && (
          <span className={styles.hdrBadge}>
            4K · {film.hdr}
          </span>
        )}
        {film.rating !== null && (
          <div className={styles.ratingBadge}>
            <ImdbBadge />
            {film.rating}
          </div>
        )}
        {!film.matched && (
          <div className={styles.unmatchedOverlay}>?</div>
        )}
      </div>
      <div className={styles.posterCardMeta}>
        <div className={styles.posterCardTitle}>
          {film.title ?? film.filename}
        </div>
        <div className={styles.posterCardSubtitle}>
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
  const styles = useLibraryStyles();
  const profileName = profiles.find((p) => p.id === film.profile)?.name ?? "";
  return (
    <div
      onClick={onClick}
      className={mergeClasses(styles.listRow, selected && styles.listRowSelected)}
    >
      <Poster
        url={film.posterUrl}
        alt={film.title ?? film.filename}
        className={styles.listRowPoster}
      />
      <div>
        <div className={styles.listRowTitle}>
          {film.title ?? film.filename}
          {film.year && (
            <span className={styles.listRowYear}> · {film.year}</span>
          )}
        </div>
        <div className={styles.listRowMeta}>
          {(film.genre ?? "UNMATCHED").toUpperCase()} · {profileName}
        </div>
      </div>
      <div className={styles.listRowChips}>
        <span className={`chip ${film.resolution === "4K" ? "green" : ""}`}>
          {film.resolution}
        </span>
        {film.hdr && film.hdr !== "—" && (
          <span className="chip">{film.hdr}</span>
        )}
      </div>
      <div className={styles.listRowRating}>
        {film.rating !== null && (
          <>
            <ImdbBadge />
            {film.rating}
          </>
        )}
      </div>
      <div className={styles.listRowDuration}>{film.duration}</div>
      <div className={styles.listRowSize}>{film.size}</div>
    </div>
  );
};
