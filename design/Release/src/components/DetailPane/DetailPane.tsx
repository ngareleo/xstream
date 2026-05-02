import { type FC, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import {
  IconClose,
  IconExpand,
  IconPlay,
  IconSearch,
  ImdbBadge,
} from "../../lib/icons.js";
import { type Film, getEpisodeStats, getResumeEpisode } from "../../data/mock.js";
import { type OmdbResult, searchOmdb } from "../../data/omdb.js";
import { Poster } from "../Poster/Poster.js";
import { SeasonsPanel } from "../SeasonsPanel/SeasonsPanel.js";
import { useDetailPaneStyles } from "./DetailPane.styles.js";

interface DetailPaneProps {
  film: Film;
  /** When true, the pane mounts already in edit mode. */
  initialEdit?: boolean;
  onClose: () => void;
  /**
   * Notify the parent when the user enters/exits edit mode so it can
   * sync URL state. The parent owns the source of truth.
   */
  onEditChange?: (editing: boolean) => void;
}

/**
 * Right-rail film detail. Identical structure on Profiles and Library.
 * Has a view mode (default) and an edit mode that exposes editable
 * title / year / IMDb ID / plot fields. The design lab does not persist
 * edits — Save just exits edit mode visually so the form can be QA'd.
 */
export const DetailPane: FC<DetailPaneProps> = ({
  film,
  initialEdit = false,
  onClose,
  onEditChange,
}) => {
  const styles = useDetailPaneStyles();
  const navigate = useNavigate();
  const hdrLabel = film.hdr && film.hdr !== "—" ? film.hdr.toUpperCase() : null;
  const [editing, setEditing] = useState(initialEdit);
  const resume = getResumeEpisode(film);
  const playHref = resume
    ? `/player/${film.id}?s=${resume.season}&e=${resume.episode}`
    : `/player/${film.id}`;
  const playLabel = resume ? "Continue" : "Play";

  const playEpisode = (seasonNumber: number, episodeNumber: number): void => {
    navigate(`/player/${film.id}?s=${seasonNumber}&e=${episodeNumber}`);
  };

  const expandToOverlay = (): void => {
    const target = `/?film=${encodeURIComponent(film.id)}`;
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(() => navigate(target));
    } else {
      navigate(target);
    }
  };

  useEffect(() => {
    setEditing(initialEdit);
  }, [initialEdit]);

  const enterEdit = (): void => {
    setEditing(true);
    onEditChange?.(true);
  };

  const exitEdit = (): void => {
    setEditing(false);
    onEditChange?.(false);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.posterFrame}>
        <Poster
          url={film.posterUrl}
          alt={film.title ?? film.filename}
          className={styles.posterImage}
        />
        <div className={styles.posterFade} />
        <button
          onClick={onClose}
          aria-label="Close detail pane"
          className={styles.closeBtn}
        >
          <IconClose />
        </button>
      </div>

      <div className={styles.body}>
        {editing ? (
          <DetailPaneEdit film={film} onSave={exitEdit} onCancel={exitEdit} />
        ) : (
          <>
            <div className={styles.actionRow}>
              <Link to={playHref} className={styles.playAction}>
                <IconPlay width={11} height={11} />
                <span>{playLabel}</span>
              </Link>
              <button
                type="button"
                onClick={enterEdit}
                className={styles.editAction}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={expandToOverlay}
                aria-label="Expand to full details view"
                title="Expand"
                className={styles.expandAction}
              >
                <IconExpand width={16} height={16} />
              </button>
            </div>

            <div className={styles.title}>{film.title ?? "Unmatched file"}</div>
            <div className={styles.subhead}>
              {[film.year, film.genre, film.duration]
                .filter(Boolean)
                .join(" · ")}
            </div>

            <div className={styles.techChips}>
              <span className="chip green">{film.resolution} UHD</span>
              {hdrLabel && <span className="chip">{hdrLabel}</span>}
              <span className="chip">{film.codec}</span>
              <span className="chip">
                {film.audio} {film.audioChannels}
              </span>
            </div>

            <div className={styles.ratingRow}>
              {film.rating !== null && (
                <>
                  <ImdbBadge />
                  <span className={styles.ratingValue}>{film.rating}</span>
                  <span className={styles.divider}>·</span>
                </>
              )}
              <span>{film.duration}</span>
              <span className={styles.divider}>·</span>
              <span className={styles.status}>● ON DISK</span>
            </div>

            {film.plot && <div className={styles.plot}>{film.plot}</div>}

            {film.cast.length > 0 && (
              <>
                <div className={styles.sectionLabel}>CAST</div>
                <div className={styles.castChips}>
                  {film.cast.map((c) => (
                    <span key={c} className="chip">
                      {c}
                    </span>
                  ))}
                </div>
              </>
            )}

            {film.kind === "series" && film.seasons && (() => {
              const stats = getEpisodeStats(film);
              return (
                <>
                  <div className={styles.sectionLabel}>SEASONS &amp; EPISODES</div>
                  <div className={styles.seasonsSection}>
                    <div className={styles.seasonsHeader}>
                      <span className={styles.seasonsHeaderLabel}>
                        {film.seasons.length} season{film.seasons.length === 1 ? "" : "s"}
                      </span>
                      {stats && (
                        <span className={styles.seasonsHeaderStat}>
                          {stats.available} / {stats.total} on disk
                        </span>
                      )}
                    </div>
                    <SeasonsPanel
                      seasons={film.seasons}
                      defaultOpenFirst
                      onSelectEpisode={playEpisode}
                    />
                  </div>
                </>
              );
            })()}

            <div className={styles.sectionLabel}>FILE</div>
            <div className={styles.fileBlock}>
              <div>{film.filename}</div>
              <div className={styles.fileMeta}>
                <span>{film.size}</span>
                <span>·</span>
                <span>{film.bitrate}</span>
                <span>·</span>
                <span>{film.frameRate}</span>
                <span>·</span>
                <span>{film.container}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface EditProps {
  film: Film;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Edit mode = re-link the film to an OMDb entry. The user types a
 * search query, picks a candidate from the results list, and Save
 * commits the link. Mirrors the production "Re-link" flow at the data
 * level (`searchOmdb` mock has the same shape as the real fetch).
 */
const DetailPaneEdit: FC<EditProps> = ({ film, onSave, onCancel }) => {
  const s = useDetailPaneStyles();
  const initialQuery = film.title ?? film.filename;
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<string | null>(null);

  const results = useMemo(() => searchOmdb(query), [query]);
  const trimmed = query.trim();

  // Re-prime when the active film changes — a stale selection from a
  // previous film must not bleed into the next.
  useEffect(() => {
    setQuery(film.title ?? film.filename);
    setSelected(null);
  }, [film.id]);

  const canSave = selected !== null;

  return (
    <>
      <div className={s.editEyebrow}>· edit · re-link to OMDb</div>

      <div className={s.editSearchRow}>
        <span className={s.editSearchIcon} aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className={s.editSearchInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search OMDb by title, director, or IMDb ID…"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className={s.editResults}>
        {trimmed.length === 0 ? (
          <div className={s.editEmpty}>
            Type to search OMDb. Pick a result to link to.
          </div>
        ) : results.length === 0 ? (
          <div className={s.editEmpty}>
            No matches for &ldquo;{trimmed}&rdquo;.
          </div>
        ) : (
          results.map((r) => (
            <OmdbResultRow
              key={r.imdbId}
              result={r}
              selected={selected === r.imdbId}
              onSelect={() => setSelected(r.imdbId)}
            />
          ))
        )}
      </div>

      <div className={s.editFooter}>
        <button type="button" className={s.editCancel} onClick={onCancel}>
          [ESC] Cancel
        </button>
        <button
          type="button"
          className={mergeClasses(
            s.editSave,
            !canSave && s.editSaveDisabled,
          )}
          onClick={onSave}
          disabled={!canSave}
          aria-disabled={!canSave}
        >
          [↩] Link
        </button>
      </div>
    </>
  );
};

const OmdbResultRow: FC<{
  result: OmdbResult;
  selected: boolean;
  onSelect: () => void;
}> = ({ result, selected, onSelect }) => {
  const s = useDetailPaneStyles();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={mergeClasses(
        s.editResult,
        selected && s.editResultSelected,
      )}
      aria-pressed={selected}
    >
      {result.posterUrl ? (
        <Poster
          url={result.posterUrl}
          alt={result.title}
          className={s.editResultPoster}
        />
      ) : (
        <div className={mergeClasses(s.editResultPoster, s.editResultPosterFallback)}>
          ·
        </div>
      )}
      <div className={s.editResultText}>
        <div className={s.editResultTitle}>
          {result.title}
          <span className={s.editResultYear}>· {result.year}</span>
        </div>
        <div className={s.editResultMeta}>
          {result.genre} · {result.runtime}
        </div>
        <div className={s.editResultId}>
          {result.imdbId} · dir. {result.director}
        </div>
      </div>
      <span className={s.editResultMark} aria-hidden="true">
        {selected ? "[x]" : "[ ]"}
      </span>
    </button>
  );
};
