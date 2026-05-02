import { type FC } from "react";
import { useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { type Film } from "../../data/mock.js";
import { ImdbBadge } from "../../lib/icons.js";
import { Poster } from "../Poster/Poster.js";
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
 */
export const FilmRow: FC<FilmRowProps> = ({ film, selected, onOpen, onEdit }) => {
  const s = useFilmRowStyles();
  const navigate = useNavigate();
  const playFilm = (e: React.MouseEvent): void => {
    e.stopPropagation();
    navigate(`/player/${film.id}`);
  };
  const editFilm = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onEdit();
  };

  return (
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
          ▶
        </span>
      </button>
      <div>
        <div className={s.title}>
          {film.title ?? film.filename}{" "}
          {film.year && <span className={s.year}>· {film.year}</span>}
        </div>
        <div className={s.meta}>
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
  );
};
