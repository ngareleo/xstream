import { type FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { type Film, getEpisodeStats } from "../../data/mock.js";
import {
  IconChevron,
  IconPlay,
  ImdbBadge,
} from "../../lib/icons.js";
import { MediaKindBadge } from "../MediaKindBadge/MediaKindBadge.js";
import { Poster } from "../Poster/Poster.js";
import { SeasonsPanel } from "../SeasonsPanel/SeasonsPanel.js";
import { useFilmRowStyles } from "./FilmRow.styles.js";

interface FilmRowProps {
  film: Film;
  selected: boolean;
  /** Open the right detail pane in view mode. */
  onOpen: () => void;
  /** Open the right detail pane in edit mode. */
  onEdit: () => void;
}

/**
 * One film inside an expanded ProfileRow. Click targets split three ways:
 *  - Poster thumbnail navigates straight to the player.
 *  - Row body opens the detail pane (view mode).
 *  - "Edit" text action opens the detail pane in edit mode (caller wires
 *    the URL/state plumbing via the `onEdit` callback).
 *
 * Series (`film.kind === "series"`) get an extra chevron at the start of
 * the title cell that toggles a nested SeasonsPanel directly under the
 * row — letting users drill into seasons + episodes without leaving the
 * profile tree. Movies render the chevron slot as empty, keeping the
 * grid aligned with the rest of the column.
 */
export const FilmRow: FC<FilmRowProps> = ({ film, selected, onOpen, onEdit }) => {
  const s = useFilmRowStyles();
  const navigate = useNavigate();
  const isSeries = film.kind === "series";
  const stats = isSeries ? getEpisodeStats(film) : null;
  const [seasonsOpen, setSeasonsOpen] = useState(false);

  const playFilm = (e: React.MouseEvent): void => {
    e.stopPropagation();
    navigate(`/player/${film.id}`);
  };
  const editFilm = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onEdit();
  };
  const toggleSeasons = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setSeasonsOpen((v) => !v);
  };

  const metaText = isSeries && stats
    ? `${(film.genre ?? "UNMATCHED").toUpperCase()} · ${film.seasons?.length ?? 0} SEASONS · ${stats.available}/${stats.total} EPISODES`
    : `${(film.genre ?? "UNMATCHED").toUpperCase()} · ${film.duration}`;

  return (
    <div>
      <div
        onClick={onOpen}
        className={mergeClasses(s.row, selected && s.rowSelected)}
      >
        <button
          type="button"
          onClick={playFilm}
          aria-label={`Play ${film.title ?? film.filename}`}
          className={s.thumbBtn}
        >
          <Poster
            url={film.posterUrl}
            alt={film.title ?? film.filename}
            className={s.thumb}
          />
          <span className={s.thumbHover} aria-hidden="true">
            <IconPlay width={14} height={14} />
          </span>
        </button>
        <div className={s.titleWrap}>
          {isSeries && (
            <button
              type="button"
              onClick={toggleSeasons}
              aria-label={
                seasonsOpen
                  ? `Collapse seasons of ${film.title ?? film.filename}`
                  : `Expand seasons of ${film.title ?? film.filename}`
              }
              aria-expanded={seasonsOpen}
              className={mergeClasses(s.expandBtn, seasonsOpen && s.expandBtnOpen)}
            >
              <IconChevron />
            </button>
          )}
          <MediaKindBadge kind={film.kind} variant="row" />
          <div style={{ minWidth: 0 }}>
            <div className={s.title}>
              {film.title ?? film.filename}{" "}
              {film.year && <span className={s.year}>· {film.year}</span>}
            </div>
            <div className={s.meta}>{metaText}</div>
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
        <div className={s.editCell}>
          <button
            type="button"
            onClick={editFilm}
            className={s.editAction}
          >
            Edit
          </button>
        </div>
      </div>
      {isSeries && seasonsOpen && film.seasons && (
        <div className={s.expandedHost}>
          <SeasonsPanel seasons={film.seasons} defaultOpenFirst />
        </div>
      )}
    </div>
  );
};
